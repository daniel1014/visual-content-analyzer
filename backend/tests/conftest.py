"""
Pytest configuration and shared fixtures for backend tests.

Provides common fixtures, test utilities, and configuration
for the Visual Content Analyzer backend test suite.
"""

import pytest
import asyncio
import io
import tempfile
import os
from unittest.mock import Mock, AsyncMock, patch
from fastapi.testclient import TestClient
from PIL import Image

from ..main import app
from ..models import BLIPModel
from ..schemas import TagResult


# Pytest configuration
def pytest_configure(config):
    """Configure pytest with custom markers and settings."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )
    config.addinivalue_line(
        "markers", "api: mark test as API test"
    )


# Async event loop configuration
@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# Application fixtures
@pytest.fixture
def client():
    """Create FastAPI test client."""
    with TestClient(app) as client:
        yield client


@pytest.fixture
def async_client():
    """Create async FastAPI test client."""
    from httpx import AsyncClient
    
    async def _client():
        async with AsyncClient(app=app, base_url="http://test") as client:
            yield client
    
    return _client


# Image fixtures
@pytest.fixture
def sample_jpeg_bytes():
    """Create sample JPEG image bytes for testing."""
    image = Image.new('RGB', (224, 224), color='red')
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG')
    return buffer.getvalue()


@pytest.fixture
def sample_png_bytes():
    """Create sample PNG image bytes for testing."""
    image = Image.new('RGB', (256, 256), color='blue')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()


@pytest.fixture
def sample_webp_bytes():
    """Create sample WebP image bytes for testing."""
    image = Image.new('RGB', (128, 128), color='green')
    buffer = io.BytesIO()
    image.save(buffer, format='WEBP')
    return buffer.getvalue()


@pytest.fixture
def large_image_bytes():
    """Create large image bytes for testing size limits."""
    # Create a larger image (2K x 2K)
    image = Image.new('RGB', (2048, 2048), color='yellow')
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=95)
    return buffer.getvalue()


@pytest.fixture
def corrupted_image_bytes():
    """Create corrupted image bytes for testing error handling."""
    return b"This is definitely not a valid image file content"


# Mock file fixtures
@pytest.fixture
def mock_valid_upload_file(sample_jpeg_bytes):
    """Create a mock valid UploadFile for testing."""
    from fastapi import UploadFile
    
    upload_file = Mock(spec=UploadFile)
    upload_file.filename = "test_image.jpg"
    upload_file.content_type = "image/jpeg"
    upload_file.size = len(sample_jpeg_bytes)
    upload_file.read = AsyncMock(return_value=sample_jpeg_bytes)
    upload_file.seek = AsyncMock()
    
    return upload_file


@pytest.fixture
def mock_large_upload_file():
    """Create a mock large UploadFile for testing size limits."""
    from fastapi import UploadFile
    
    upload_file = Mock(spec=UploadFile)
    upload_file.filename = "large_image.jpg"
    upload_file.content_type = "image/jpeg"
    upload_file.size = 15 * 1024 * 1024  # 15MB
    upload_file.read = AsyncMock(return_value=b"fake large image data")
    upload_file.seek = AsyncMock()
    
    return upload_file


@pytest.fixture
def mock_invalid_type_file():
    """Create a mock invalid file type for testing."""
    from fastapi import UploadFile
    
    upload_file = Mock(spec=UploadFile)
    upload_file.filename = "document.pdf"
    upload_file.content_type = "application/pdf"
    upload_file.size = 1024
    upload_file.read = AsyncMock(return_value=b"fake pdf content")
    upload_file.seek = AsyncMock()
    
    return upload_file


# Model fixtures
@pytest.fixture
def mock_blip_model_healthy():
    """Create a mock healthy BLIP model for testing."""
    mock_model = AsyncMock()
    mock_model.health_check.return_value = {
        "status": "healthy",
        "model_loaded": True,
        "model_name": "Salesforce/blip-image-captioning-base",
        "device": "cpu"
    }
    mock_model.analyze_image.return_value = (
        [
            TagResult(tag="landscape", confidence=0.95),
            TagResult(tag="mountains", confidence=0.87),
            TagResult(tag="nature", confidence=0.82),
            TagResult(tag="scenic", confidence=0.78),
            TagResult(tag="outdoors", confidence=0.74)
        ],
        2.34,  # processing_time
        (224, 224)  # image_size
    )
    return mock_model


@pytest.fixture
def mock_blip_model_unhealthy():
    """Create a mock unhealthy BLIP model for testing."""
    mock_model = AsyncMock()
    mock_model.health_check.return_value = {
        "status": "unhealthy",
        "model_loaded": False,
        "error": "Model failed to load"
    }
    return mock_model


@pytest.fixture
def mock_blip_model_slow():
    """Create a mock slow BLIP model for testing timeouts."""
    mock_model = AsyncMock()
    
    async def slow_analyze(*args, **kwargs):
        await asyncio.sleep(0.5)  # Simulate slow processing
        return (
            [TagResult(tag="slow processing", confidence=0.8)],
            0.5,
            (224, 224)
        )
    
    mock_model.analyze_image = slow_analyze
    mock_model.health_check.return_value = {
        "status": "healthy",
        "model_loaded": True,
        "model_name": "Salesforce/blip-image-captioning-base",
        "device": "cpu"
    }
    return mock_model


@pytest.fixture
def mock_transformers_components():
    """Mock transformers library components for model testing."""
    with patch('transformers.BlipProcessor') as mock_processor, \
         patch('transformers.BlipForConditionalGeneration') as mock_model, \
         patch('torch.cuda.is_available', return_value=False):
        
        # Setup processor mock
        mock_processor_instance = Mock()
        mock_processor_instance.return_value = {
            'input_ids': Mock(),
            'attention_mask': Mock(),
            'pixel_values': Mock()
        }
        mock_processor_instance.tokenizer = Mock()
        mock_processor_instance.tokenizer.decode = Mock(
            return_value="a beautiful landscape with mountains and trees"
        )
        mock_processor.from_pretrained.return_value = mock_processor_instance
        
        # Setup model mock
        mock_model_instance = Mock()
        mock_model_instance.generate = Mock(return_value=[[101, 102, 103, 104, 105]])
        mock_model_instance.to = Mock(return_value=mock_model_instance)
        mock_model.from_pretrained.return_value = mock_model_instance
        
        yield {
            'processor': mock_processor,
            'model': mock_model,
            'processor_instance': mock_processor_instance,
            'model_instance': mock_model_instance
        }


# Temporary file fixtures
@pytest.fixture
def temp_directory():
    """Create temporary directory for testing file operations."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir


@pytest.fixture
def temp_image_file(sample_jpeg_bytes, temp_directory):
    """Create temporary image file for testing."""
    temp_path = os.path.join(temp_directory, "test_image.jpg")
    with open(temp_path, 'wb') as f:
        f.write(sample_jpeg_bytes)
    yield temp_path


# Database and external service mocks
@pytest.fixture
def mock_file_validation():
    """Mock file validation to always pass."""
    with patch('visual_content_analyzer.backend.main.validate_file') as mock_validate:
        mock_validate.return_value = None
        yield mock_validate


@pytest.fixture
def mock_magic_detection():
    """Mock python-magic file type detection."""
    with patch('magic.from_buffer') as mock_magic:
        mock_magic.return_value = 'image/jpeg'
        yield mock_magic


# Test data fixtures
@pytest.fixture
def sample_tag_results():
    """Create sample tag results for testing."""
    return [
        TagResult(tag="landscape", confidence=0.95),
        TagResult(tag="mountains", confidence=0.87),
        TagResult(tag="nature", confidence=0.82),
        TagResult(tag="scenic view", confidence=0.78),
        TagResult(tag="outdoors", confidence=0.74)
    ]


@pytest.fixture
def sample_analysis_response():
    """Create sample analysis response for testing."""
    return {
        "filename": "test_image.jpg",
        "tags": [
            {"tag": "landscape", "confidence": 0.95},
            {"tag": "mountains", "confidence": 0.87},
            {"tag": "nature", "confidence": 0.82},
            {"tag": "scenic view", "confidence": 0.78},
            {"tag": "outdoors", "confidence": 0.74}
        ],
        "processing_time": 2.34,
        "image_size": [224, 224],
        "timestamp": "2024-01-01T12:00:00Z",
        "model_info": {
            "model_name": "Salesforce/blip-image-captioning-base",
            "device": "cpu",
            "processing_backend": "async_executor"
        }
    }


# Utility fixtures
@pytest.fixture
def reset_blip_singleton():
    """Reset BLIP model singleton for testing."""
    original_instance = BLIPModel._instance
    BLIPModel._instance = None
    yield
    BLIPModel._instance = original_instance


@pytest.fixture
def mock_settings():
    """Mock settings for testing."""
    with patch('visual_content_analyzer.backend.config.settings') as mock_settings:
        mock_settings.model_name = "Salesforce/blip-image-captioning-base"
        mock_settings.max_file_size = 10 * 1024 * 1024  # 10MB
        mock_settings.allowed_extensions = ["image/jpeg", "image/png", "image/webp"]
        mock_settings.max_tags = 5
        mock_settings.confidence_threshold = 0.7
        mock_settings.debug = True
        mock_settings.temp_dir = "/tmp/visual-analyzer"
        yield mock_settings


# Performance testing fixtures
@pytest.fixture
def performance_timer():
    """Timer fixture for performance testing."""
    import time
    
    class Timer:
        def __init__(self):
            self.start_time = None
            self.end_time = None
        
        def start(self):
            self.start_time = time.time()
        
        def stop(self):
            self.end_time = time.time()
        
        @property
        def elapsed(self):
            if self.start_time is None or self.end_time is None:
                return None
            return self.end_time - self.start_time
    
    return Timer()


# Error simulation fixtures
@pytest.fixture
def mock_network_error():
    """Mock network errors for testing error handling."""
    def _mock_error():
        raise ConnectionError("Network is unreachable")
    return _mock_error


@pytest.fixture
def mock_timeout_error():
    """Mock timeout errors for testing error handling."""
    def _mock_error():
        raise TimeoutError("Operation timed out")
    return _mock_error


@pytest.fixture
def mock_memory_error():
    """Mock memory errors for testing error handling."""
    def _mock_error():
        raise MemoryError("Out of memory")
    return _mock_error


# Integration test fixtures
@pytest.fixture
def integration_test_environment():
    """Setup environment for integration testing."""
    # Store original environment
    original_env = os.environ.copy()
    
    # Set test environment variables
    test_env = {
        "APP_ENV": "test",
        "DEBUG": "true",
        "LOG_LEVEL": "DEBUG",
        "MAX_FILE_SIZE": "10485760",  # 10MB
        "MODEL_NAME": "Salesforce/blip-image-captioning-base"
    }
    
    os.environ.update(test_env)
    
    yield test_env
    
    # Restore original environment
    os.environ.clear()
    os.environ.update(original_env)


# Cleanup utilities
@pytest.fixture(autouse=True)
def cleanup_temp_files():
    """Automatically cleanup temporary files after each test."""
    yield
    
    # Cleanup any remaining temp files
    import glob
    temp_files = glob.glob("/tmp/temp_*")
    for temp_file in temp_files:
        try:
            os.remove(temp_file)
        except (OSError, FileNotFoundError):
            pass  # File already gone or permission error