"""
Pydantic schemas for Visual Content Analyzer API.

Defines request/response models, validation rules, and data structures
used throughout the FastAPI application.
"""

from typing import List, Optional, Union
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import datetime


class TagResult(BaseModel):
    """Single tag result with confidence score."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "tag": "a golden retriever sitting in a park",
                "confidence": 0.87
            }
        }
    )
    
    tag: str = Field(
        ...,
        description="Descriptive tag for the image content",
        min_length=1,
        max_length=200,
        examples=["a dog playing in the park", "sunset over mountains"]
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score between 0.0 and 1.0",
        examples=[0.87, 0.92, 0.75]
    )
    
    @field_validator("tag")
    @classmethod
    def validate_tag(cls, v):
        """Ensure tag is properly formatted."""
        if not v or not v.strip():
            raise ValueError("Tag cannot be empty or whitespace only")
        
        # Remove excessive whitespace and normalize
        cleaned_tag = " ".join(v.strip().split())
        
        if len(cleaned_tag) < 1:
            raise ValueError("Tag must contain meaningful content")
        
        return cleaned_tag


class ImageAnalysisResponse(BaseModel):
    """Response model for successful image analysis."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "filename": "sample_image.jpg",
                "tags": [
                    {"tag": "a golden retriever sitting in a park", "confidence": 0.87},
                    {"tag": "dog outdoors on grass", "confidence": 0.82},
                    {"tag": "pet animal in nature", "confidence": 0.79}
                ],
                "processing_time": 2.34,
                "image_size": [640, 480],
                "timestamp": "2025-01-25T10:30:45.123456",
                "model_info": {
                    "model_name": "Salesforce/blip-image-captioning-base",
                    "device": "cpu"
                }
            }
        }
    )
    
    filename: str = Field(
        ...,
        description="Original filename of the uploaded image",
        examples=["vacation_photo.jpg", "product_image.png"]
    )
    tags: List[TagResult] = Field(
        ...,
        description="List of descriptive tags with confidence scores",
        min_length=1,
        max_length=10
    )
    processing_time: float = Field(
        ...,
        ge=0.0,
        description="Processing time in seconds",
        examples=[1.23, 2.87, 0.95]
    )
    image_size: tuple[int, int] = Field(
        ...,
        description="Image dimensions as (width, height) in pixels",
        examples=[[640, 480], [1920, 1080], [512, 512]]
    )
    timestamp: datetime = Field(
        default_factory=datetime.now,
        description="Timestamp when analysis was completed"
    )
    model_info: dict = Field(
        default_factory=dict,
        description="Information about the model used for analysis"
    )
    
    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v):
        """Ensure tags list is valid."""
        if not v:
            raise ValueError("At least one tag must be provided")
        
        # Remove duplicates while preserving order
        seen_tags = set()
        unique_tags = []
        for tag in v:
            if tag.tag.lower() not in seen_tags:
                unique_tags.append(tag)
                seen_tags.add(tag.tag.lower())
        
        return unique_tags
    
    @field_validator("image_size")
    @classmethod
    def validate_image_size(cls, v):
        """Ensure image size is valid."""
        if len(v) != 2:
            raise ValueError("Image size must be a tuple of (width, height)")
        
        width, height = v
        if width <= 0 or height <= 0:
            raise ValueError("Image dimensions must be positive")
        
        if width > 10000 or height > 10000:
            raise ValueError("Image dimensions seem unreasonably large")
        
        return v


class ErrorResponse(BaseModel):
    """Error response model for API failures."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": "Unsupported file type",
                "detail": "Only JPEG, PNG, and WebP images are supported",
                "error_code": "INVALID_FILE_TYPE",
                "timestamp": "2025-01-25T10:30:45.123456"
            }
        }
    )
    
    error: str = Field(
        ...,
        description="Brief error message",
        examples=["Unsupported file type", "File too large", "Processing failed"]
    )
    detail: Optional[str] = Field(
        None,
        description="Detailed error information",
        examples=[
            "Only JPEG, PNG, and WebP images are supported",
            "Maximum file size is 10MB",
            "Model inference failed due to corrupted image data"
        ]
    )
    error_code: Optional[str] = Field(
        None,
        description="Machine-readable error code",
        examples=["INVALID_FILE_TYPE", "FILE_TOO_LARGE", "MODEL_ERROR"]
    )
    timestamp: datetime = Field(
        default_factory=datetime.now,
        description="Timestamp when error occurred"
    )


class HealthResponse(BaseModel):
    """Health check response model."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "healthy",
                "model_status": {
                    "model_loaded": True,
                    "model_name": "Salesforce/blip-image-captioning-base",
                    "device": "cpu",
                    "memory_used_mb": 1024.5
                },
                "system_info": {
                    "max_file_size_mb": 10,
                    "allowed_formats": ["image/jpeg", "image/png", "image/webp"],
                    "max_tags": 5
                },
                "timestamp": "2025-01-25T10:30:45.123456"
            }
        }
    )
    
    status: str = Field(
        ...,
        description="Overall system health status",
        examples=["healthy", "degraded", "unhealthy"]
    )
    model_status: dict = Field(
        ...,
        description="BLIP model status information"
    )
    system_info: dict = Field(
        ...,
        description="System configuration information"
    )
    timestamp: datetime = Field(
        default_factory=datetime.now,
        description="Timestamp of health check"
    )


class ValidationError(BaseModel):
    """Validation error details."""
    
    field: str = Field(..., description="Field that failed validation")
    message: str = Field(..., description="Validation error message")
    invalid_value: Optional[Union[str, int, float]] = Field(
        None, 
        description="The invalid value that caused the error"
    )


class FileValidationError(BaseModel):
    """File validation error response."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "error": "File validation failed",
                "validation_errors": [
                    {
                        "field": "file_type",
                        "message": "Unsupported MIME type",
                        "invalid_value": "text/plain"
                    }
                ],
                "timestamp": "2025-01-25T10:30:45.123456"
            }
        }
    )
    
    error: str = Field(
        default="File validation failed",
        description="Error message"
    )
    validation_errors: List[ValidationError] = Field(
        ...,
        description="List of specific validation errors"
    )
    timestamp: datetime = Field(
        default_factory=datetime.now,
        description="Timestamp when validation failed"
    )


# Request models (for documentation and validation)
class AnalyzeImageRequest(BaseModel):
    """Request model for image analysis (for documentation)."""
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "description": "Upload an image file (JPEG, PNG, or WebP) up to 10MB for analysis"
            }
        }
    )
    
    file: str = Field(
        ...,
        description="Image file to analyze (multipart/form-data upload)",
        examples=["binary_image_data"]
    )


# Response union types for OpenAPI documentation
AnalyzeResponse = Union[ImageAnalysisResponse, ErrorResponse, FileValidationError]
HealthCheckResponse = Union[HealthResponse, ErrorResponse]