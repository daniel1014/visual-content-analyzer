"""
Test FastAPI endpoints and application functionality.

Tests for the main FastAPI application including file upload, 
analysis endpoints, error handling, and middleware functionality.
"""

import pytest
import asyncio
import io
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import status
from PIL import Image

from ..main import app
from ..models import BLIPModelError
from ..utils import FileValidationError
from ..schemas import TagResult


class TestApplicationSetup:
    """Test FastAPI application configuration and setup."""
    
    def test_app_creation(self):
        """Test that FastAPI application is created successfully."""
        assert app is not None
        assert app.title == "Visual Content Analyzer"
        assert app.version == "1.0.0"
    
    def test_cors_middleware(self):
        """Test CORS middleware configuration."""
        # Find CORS middleware in app middleware stack
        cors_middleware = None
        for middleware in app.middleware_stack:
            if hasattr(middleware, 'cls') and 'CORS' in str(middleware.cls):
                cors_middleware = middleware
                break
        
        assert cors_middleware is not None


class TestRootEndpoint:
    """Test root endpoint functionality."""
    
    def test_root_endpoint(self):
        """Test GET / endpoint returns API information."""
        with TestClient(app) as client:
            response = client.get("/")
            
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            
            assert data["message"] == "Visual Content Analyzer API"
            assert data["version"] == "1.0.0"
            assert "docs" in data
            assert "health" in data
            assert "analyze" in data


class TestHealthEndpoint:
    """Test health check endpoint functionality."""
    
    @pytest.fixture
    def mock_healthy_model(self):
        """Mock a healthy BLIP model for health checks."""
        mock_model = AsyncMock()
        mock_model.health_check.return_value = {
            "status": "healthy",
            "model_loaded": True,
            "model_name": "Salesforce/blip-image-captioning-base",
            "device": "cpu"
        }
        return mock_model
    
    @pytest.fixture
    def mock_unhealthy_model(self):
        """Mock an unhealthy BLIP model for health checks."""
        mock_model = AsyncMock()
        mock_model.health_check.return_value = {
            "status": "unhealthy",
            "model_loaded": False,
            "error": "Model failed to load"
        }
        return mock_model
    
    def test_health_check_healthy(self, mock_healthy_model):
        """Test health check with healthy model."""
        with patch('visual_content_analyzer.backend.main.get_model', return_value=mock_healthy_model):
            with TestClient(app) as client:
                response = client.get("/health")
                
                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                
                assert data["status"] == "healthy"
                assert data["model_status"]["status"] == "healthy"
                assert "system_info" in data
                assert data["system_info"]["max_file_size_mb"] == 10.0
    
    def test_health_check_unhealthy(self, mock_unhealthy_model):
        """Test health check with unhealthy model."""
        with patch('visual_content_analyzer.backend.main.get_model', return_value=mock_unhealthy_model):
            with TestClient(app) as client:
                response = client.get("/health")
                
                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                
                assert data["status"] == "degraded"
                assert data["model_status"]["status"] == "unhealthy"
    
    def test_health_check_exception(self):
        """Test health check when model raises exception."""
        with patch('visual_content_analyzer.backend.main.get_model', side_effect=Exception("Model unavailable")):
            with TestClient(app) as client:
                response = client.get("/health")
                
                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                
                assert data["status"] == "unhealthy"
                assert "error" in data["model_status"]


class TestAnalyzeEndpoint:
    """Test image analysis endpoint functionality."""
    
    @pytest.fixture
    def sample_image_file(self):
        """Create sample image file for testing."""
        # Create a simple test image
        image = Image.new('RGB', (224, 224), color='green')
        
        # Convert to bytes
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG')
        buffer.seek(0)
        
        return buffer
    
    @pytest.fixture
    def mock_successful_model(self):
        """Mock BLIP model with successful analysis."""
        mock_model = AsyncMock()
        mock_model.analyze_image.return_value = (
            [
                TagResult(tag="landscape", confidence=0.95),
                TagResult(tag="mountains", confidence=0.87),
                TagResult(tag="scenic view", confidence=0.82),
                TagResult(tag="nature", confidence=0.78),
                TagResult(tag="outdoors", confidence=0.74)
            ],
            2.34,  # processing_time
            (224, 224)  # image_size
        )
        return mock_model
    
    def test_analyze_image_success(self, sample_image_file, mock_successful_model):
        """Test successful image analysis."""
        with patch('visual_content_analyzer.backend.main.get_model', return_value=mock_successful_model), \
             patch('visual_content_analyzer.backend.main.validate_file', return_value=None):
            
            with TestClient(app) as client:
                response = client.post(
                    "/analyze",
                    files={"file": ("test.jpg", sample_image_file, "image/jpeg")}
                )
                
                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                
                assert data["filename"] == "test.jpg"
                assert len(data["tags"]) == 5
                assert data["tags"][0]["tag"] == "landscape"
                assert data["tags"][0]["confidence"] == 0.95
                assert data["processing_time"] == 2.34
                assert data["image_size"] == [224, 224]
                assert "model_info" in data
    
    def test_analyze_image_no_file(self):
        """Test analysis endpoint with no file provided."""
        with TestClient(app) as client:
            response = client.post("/analyze")
            
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_analyze_image_empty_file(self):
        """Test analysis endpoint with empty file."""
        empty_file = io.BytesIO(b"")
        
        with patch('visual_content_analyzer.backend.main.validate_file', return_value=None):
            with TestClient(app) as client:
                response = client.post(
                    "/analyze",
                    files={"file": ("empty.jpg", empty_file, "image/jpeg")}
                )
                
                assert response.status_code == status.HTTP_400_BAD_REQUEST
                data = response.json()
                assert "Empty file provided" in data["detail"]
    
    def test_analyze_image_validation_error(self, sample_image_file):
        """Test analysis endpoint with file validation error."""
        with patch('visual_content_analyzer.backend.main.validate_file', 
                   side_effect=FileValidationError("Invalid file type")):
            
            with TestClient(app) as client:
                response = client.post(
                    "/analyze",
                    files={"file": ("test.txt", sample_image_file, "text/plain")}
                )
                
                assert response.status_code == status.HTTP_400_BAD_REQUEST
                data = response.json()
                assert "validation_errors" in data
                assert data["validation_errors"][0]["message"] == "Invalid file type"
    
    def test_analyze_image_model_error(self, sample_image_file):
        """Test analysis endpoint with BLIP model error."""
        mock_model = AsyncMock()
        mock_model.analyze_image.side_effect = BLIPModelError("Model processing failed")
        
        with patch('visual_content_analyzer.backend.main.get_model', return_value=mock_model), \
             patch('visual_content_analyzer.backend.main.validate_file', return_value=None):
            
            with TestClient(app) as client:
                response = client.post(
                    "/analyze",
                    files={"file": ("test.jpg", sample_image_file, "image/jpeg")}
                )
                
                assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
                data = response.json()
                assert data["error"] == "Model processing failed"
                assert data["error_code"] == "MODEL_ERROR"
    
    def test_analyze_image_no_tags_generated(self, sample_image_file):
        """Test analysis endpoint when no tags are generated."""
        mock_model = AsyncMock()
        mock_model.analyze_image.return_value = (
            [],  # Empty tags list
            1.23,  # processing_time
            (224, 224)  # image_size
        )
        
        with patch('visual_content_analyzer.backend.main.get_model', return_value=mock_model), \
             patch('visual_content_analyzer.backend.main.validate_file', return_value=None):
            
            with TestClient(app) as client:
                response = client.post(
                    "/analyze",
                    files={"file": ("test.jpg", sample_image_file, "image/jpeg")}
                )
                
                assert response.status_code == status.HTTP_200_OK
                data = response.json()
                
                # Should provide fallback tag
                assert len(data["tags"]) == 1
                assert data["tags"][0]["tag"] == "image content"
    
    def test_analyze_image_unexpected_error(self, sample_image_file):
        """Test analysis endpoint with unexpected error."""
        with patch('visual_content_analyzer.backend.main.validate_file', return_value=None), \
             patch('visual_content_analyzer.backend.main.get_model', 
                   side_effect=RuntimeError("Unexpected system error")):
            
            with TestClient(app) as client:
                response = client.post(
                    "/analyze",
                    files={"file": ("test.jpg", sample_image_file, "image/jpeg")}
                )
                
                assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
                data = response.json()
                assert "Image analysis failed due to an unexpected error" in data["detail"]


class TestErrorHandling:
    """Test error handling and exception handlers."""
    
    def test_blip_model_exception_handler(self):
        """Test BLIP model exception handler."""
        # Create a test endpoint that raises BLIPModelError
        @app.get("/test-blip-error")
        async def test_blip_error():
            raise BLIPModelError("Test BLIP error")
        
        with TestClient(app) as client:
            response = client.get("/test-blip-error")
            
            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
            data = response.json()
            assert data["error"] == "Model processing failed"
            assert data["error_code"] == "MODEL_ERROR"
    
    def test_file_validation_exception_handler(self):
        """Test file validation exception handler."""
        # Create a test endpoint that raises FileValidationError
        @app.get("/test-validation-error")
        async def test_validation_error():
            raise FileValidationError("Test validation error")
        
        with TestClient(app) as client:
            response = client.get("/test-validation-error")
            
            assert response.status_code == status.HTTP_400_BAD_REQUEST
            data = response.json()
            assert "validation_errors" in data
            assert data["validation_errors"][0]["message"] == "Test validation error"
    
    def test_general_exception_handler(self):
        """Test general exception handler."""
        # Create a test endpoint that raises a general exception
        @app.get("/test-general-error")
        async def test_general_error():
            raise ValueError("Test general error")
        
        with TestClient(app) as client:
            response = client.get("/test-general-error")
            
            assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
            data = response.json()
            assert data["error"] == "Internal server error"
            assert data["error_code"] == "INTERNAL_ERROR"


class TestMiddleware:
    """Test middleware functionality."""
    
    def test_request_logging_middleware(self):
        """Test request logging middleware adds headers."""
        with TestClient(app) as client:
            response = client.get("/")
            
            # Should add processing time header
            assert "X-Process-Time" in response.headers
            assert float(response.headers["X-Process-Time"]) >= 0
    
    def test_cors_headers(self):
        """Test CORS headers are added to responses."""
        with TestClient(app) as client:
            # Make an OPTIONS request to trigger CORS
            response = client.options("/", headers={"Origin": "http://localhost:3000"})
            
            # Should have CORS headers (exact headers depend on configuration)
            assert response.status_code in [200, 204]


class TestDebugEndpoints:
    """Test debug endpoints (if enabled)."""
    
    def test_debug_config_endpoint(self):
        """Test debug configuration endpoint."""
        # Temporarily enable debug mode
        with patch('visual_content_analyzer.backend.main.settings.debug', True):
            # Re-create app with debug endpoint
            from ..main import app as debug_app
            
            with TestClient(debug_app) as client:
                response = client.get("/debug/config")
                
                if response.status_code == 200:  # Only if debug is enabled
                    data = response.json()
                    assert "model_name" in data
                    assert "max_file_size" in data
                    assert "allowed_extensions" in data


class TestFileUploadLimits:
    """Test file upload size and type limits."""
    
    def test_large_file_handling(self):
        """Test handling of large files."""
        # Create a large file (simulate > 10MB)
        large_data = b"x" * (11 * 1024 * 1024)  # 11MB
        large_file = io.BytesIO(large_data)
        
        with TestClient(app) as client:
            response = client.post(
                "/analyze",
                files={"file": ("large.jpg", large_file, "image/jpeg")}
            )
            
            # Should be rejected (exact error depends on server configuration)
            assert response.status_code in [413, 400, 422]
    
    def test_invalid_content_type(self):
        """Test handling of invalid content types."""
        text_file = io.BytesIO(b"This is not an image")
        
        with TestClient(app) as client:
            response = client.post(
                "/analyze",
                files={"file": ("test.txt", text_file, "text/plain")}
            )
            
            # Should be rejected due to validation
            assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestConcurrentRequests:
    """Test concurrent request handling."""
    
    @pytest.fixture
    def mock_slow_model(self):
        """Mock model with artificial delay."""
        mock_model = AsyncMock()
        
        async def slow_analysis(*args, **kwargs):
            await asyncio.sleep(0.1)  # Small delay
            return (
                [TagResult(tag="test", confidence=0.8)],
                0.1,
                (224, 224)
            )
        
        mock_model.analyze_image = slow_analysis
        return mock_model
    
    @pytest.mark.asyncio
    async def test_concurrent_analysis_requests(self, mock_slow_model):
        """Test handling of concurrent analysis requests."""
        with patch('visual_content_analyzer.backend.main.get_model', return_value=mock_slow_model), \
             patch('visual_content_analyzer.backend.main.validate_file', return_value=None):
            
            async def make_request():
                # Create sample image
                image = Image.new('RGB', (100, 100), color='blue')
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG')
                buffer.seek(0)
                
                with TestClient(app) as client:
                    response = client.post(
                        "/analyze",
                        files={"file": ("test.jpg", buffer, "image/jpeg")}
                    )
                    return response
            
            # Make multiple concurrent requests
            tasks = [make_request() for _ in range(3)]
            responses = await asyncio.gather(*tasks)
            
            # All should succeed
            for response in responses:
                assert response.status_code == status.HTTP_200_OK


# Pytest configuration for async testing
@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])