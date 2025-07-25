"""
Visual Content Analyzer FastAPI Application.

Main FastAPI application providing image analysis endpoints with BLIP model integration.
Handles file uploads, validates input, and returns structured tag analysis results.
"""

import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import (
    FastAPI, 
    UploadFile, 
    File, 
    HTTPException, 
    Request,
    status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import http_exception_handler

from config import settings, create_temp_dir
from models import get_model, BLIPModelError
from schemas import (
    ImageAnalysisResponse,
    ErrorResponse,
    HealthResponse,
    FileValidationError,
    ValidationError,
    AnalyzeResponse
)
from utils import validate_file, FileValidationError as UtilsFileValidationError

# Setup logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    
    Handles startup and shutdown procedures including model loading
    and cleanup operations.
    """
    # Startup
    logger.info("Starting Visual Content Analyzer API")
    
    try:
        # Create temporary directory
        create_temp_dir()
        logger.info(f"Created temporary directory: {settings.temp_dir}")
        
        # Pre-load BLIP model for faster first request
        if not settings.debug:  # Skip in debug mode for faster startup
            logger.info("Pre-loading BLIP model...")
            model = await get_model()
            health = await model.health_check()
            if health["status"] == "healthy":
                logger.info("BLIP model loaded successfully")
            else:
                logger.warning(f"Model health check failed: {health}")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        # Don't fail startup, let individual requests handle model loading
    
    yield
    
    # Shutdown
    logger.info("Shutting down Visual Content Analyzer API")


# Create FastAPI application
app = FastAPI(
    title="Visual Content Analyzer",
    description="""
    AI-powered image analysis API using BLIP (Bootstrapping Language-Image Pre-training) models.
    
    ## Features
    * **Image Analysis**: Upload images and get descriptive tags with confidence scores
    * **Multiple Formats**: Supports JPEG, PNG, and WebP formats
    * **Batch Processing**: Analyze multiple images efficiently
    * **Confidence Scoring**: Get quality metrics for each generated tag
    * **Async Processing**: Non-blocking image processing for better performance
    
    ## Usage
    1. Upload an image file (max 10MB) to the `/analyze` endpoint
    2. Receive top 5 descriptive tags with confidence scores
    3. Use tags for content categorization, search indexing, or accessibility
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None
)

# Add CORS middleware for React frontend communication
# CRITICAL: This enables React frontend to communicate with the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Add trusted host middleware for security
if not settings.debug:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["localhost", "127.0.0.1", settings.api_host]
    )


# Custom exception handlers
@app.exception_handler(BLIPModelError)
async def blip_model_exception_handler(request: Request, exc: BLIPModelError):
    """Handle BLIP model specific errors."""
    logger.error(f"BLIP model error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="Model processing failed",
            detail=str(exc),
            error_code="MODEL_ERROR"
        ).model_dump()
    )


@app.exception_handler(UtilsFileValidationError)
async def file_validation_exception_handler(request: Request, exc: UtilsFileValidationError):
    """Handle file validation errors."""
    logger.warning(f"File validation error: {exc}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=FileValidationError(
            validation_errors=[
                ValidationError(
                    field="file",
                    message=str(exc),
                    invalid_value=getattr(exc, 'invalid_value', None)
                )
            ]
        ).model_dump()
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors."""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="Internal server error",
            detail="An unexpected error occurred. Please try again later.",
            error_code="INTERNAL_ERROR"
        ).model_dump()
    )


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests for debugging and monitoring."""
    start_time = time.time()
    
    # Log request
    logger.info(f"{request.method} {request.url.path} - Client: {request.client.host}")
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Log response
        logger.info(
            f"{request.method} {request.url.path} - "
            f"Status: {response.status_code} - "
            f"Time: {process_time:.3f}s"
        )
        
        # Add processing time header
        response.headers["X-Process-Time"] = str(process_time)
        return response
        
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"Request failed after {process_time:.3f}s: {e}")
        raise


# API Endpoints
@app.get("/", response_model=dict)
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Visual Content Analyzer API",
        "version": "1.0.0",
        "docs": "/docs" if settings.debug else "Documentation disabled in production",
        "health": "/health",
        "analyze": "/analyze"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    
    Returns system status, model information, and configuration details.
    Useful for monitoring and ensuring the API is ready to process requests.
    """
    try:
        # Check model health
        model = await get_model()
        model_status = await model.health_check()
        
        # System information
        system_info = {
            "max_file_size_mb": settings.max_file_size / (1024 * 1024),
            "allowed_formats": settings.allowed_extensions,
            "max_tags": settings.max_tags,
            "max_image_size": settings.max_image_size,
            "confidence_threshold": settings.confidence_threshold,
            "environment": settings.app_env
        }
        
        # Determine overall status
        overall_status = "healthy" if model_status["status"] == "healthy" else "degraded"
        
        return HealthResponse(
            status=overall_status,
            model_status=model_status,
            system_info=system_info
        )
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            model_status={"status": "unhealthy", "error": str(e)},
            system_info={"error": "Unable to retrieve system information"}
        )


@app.post("/analyze", response_model=ImageAnalysisResponse)
async def analyze_image(
    file: UploadFile = File(
        ...,
        description="Image file to analyze (JPEG, PNG, or WebP, max 10MB)"
    )
) -> ImageAnalysisResponse:
    """
    Analyze an uploaded image and return descriptive tags with confidence scores.
    
    This endpoint processes the uploaded image using a BLIP model to generate
    descriptive tags that capture the visual content. Each tag includes a
    confidence score indicating the model's certainty.
    
    **Process:**
    1. Validates file type and size
    2. Preprocesses image (resize if needed, format conversion)
    3. Runs BLIP model inference
    4. Generates top 5 descriptive tags with confidence scores
    5. Returns structured response with metadata
    
    **Supported formats:** JPEG, PNG, WebP
    **Max file size:** 10MB
    **Processing time:** Typically 1-5 seconds depending on image size and hardware
    
    Args:
        file: Image file upload
        
    Returns:
        ImageAnalysisResponse with tags, confidence scores, and metadata
        
    Raises:
        HTTPException: 
            - 400: Invalid file type or corrupted image
            - 413: File too large
            - 500: Model processing error
    """
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided"
        )
    
    try:
        # Validate file before processing
        await validate_file(file)
        
        # Read file contents
        file_contents = await file.read()
        
        if not file_contents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty file provided"
            )
        
        # Get model and analyze image
        model = await get_model()
        tags, processing_time, image_size = await model.analyze_image(
            file_contents, 
            filename=file.filename
        )
        
        if not tags:
            # If no tags generated, return a generic response
            from .schemas import TagResult
            tags = [TagResult(
                tag="image content",
                confidence=settings.confidence_threshold
            )]
        
        # Create response with model information
        model_info = {
            "model_name": settings.model_name,
            "device": "cuda" if hasattr(model, '_model') and next(model._model.parameters()).is_cuda else "cpu",
            "processing_backend": "async_executor"
        }
        
        return ImageAnalysisResponse(
            filename=file.filename or "unknown",
            tags=tags,
            processing_time=round(processing_time, 3),
            image_size=image_size,
            model_info=model_info
        )
        
    except UtilsFileValidationError:
        # Re-raise validation errors to be handled by exception handler
        raise
        
    except BLIPModelError:
        # Re-raise model errors to be handled by exception handler
        raise
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
        
    except Exception as e:
        logger.error(f"Unexpected error in analyze_image: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Image analysis failed due to an unexpected error"
        )


# Development endpoints (only available in debug mode)
if settings.debug:
    @app.get("/debug/config")
    async def debug_config():
        """Debug endpoint to view current configuration (debug mode only)."""
        return {
            "model_name": settings.model_name,
            "max_file_size": settings.max_file_size,
            "allowed_extensions": settings.allowed_extensions,
            "cors_origins": settings.cors_origins,
            "max_image_size": settings.max_image_size,
            "confidence_threshold": settings.confidence_threshold,
            "max_tags": settings.max_tags,
            "app_env": settings.app_env,
            "debug": settings.debug
        }


# Application startup message
if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting Visual Content Analyzer on {settings.api_host}:{settings.api_port}")
    logger.info(f"Environment: {settings.app_env}")
    logger.info(f"Debug mode: {settings.debug}")
    logger.info(f"Model: {settings.model_name}")
    
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )