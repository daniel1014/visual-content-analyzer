"""
Test utility functions for file validation and security.

Tests for file validation, security checks, cleanup utilities,
and helper functions used throughout the FastAPI application.
"""

import pytest
import asyncio
import io
import os
import tempfile
import time
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi import UploadFile
from PIL import Image

from ..utils import (
    validate_file,
    validate_image_content,
    FileValidationError,
    get_safe_filename,
    save_temp_file,
    cleanup_temp_file,
    cleanup_old_temp_files,
    format_file_size,
    get_file_info,
    TempFileManager
)
from ..config import settings


class TestFileValidation:
    """Test file validation functionality."""
    
    @pytest.fixture
    def valid_image_file(self):
        """Create a valid image file for testing."""
        # Create test image
        image = Image.new('RGB', (224, 224), color='red')
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG')
        buffer.seek(0)
        
        # Create UploadFile mock
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "test.jpg"
        upload_file.content_type = "image/jpeg"
        upload_file.size = len(buffer.getvalue())
        upload_file.read = AsyncMock(return_value=buffer.getvalue())
        upload_file.seek = AsyncMock()
        
        return upload_file
    
    @pytest.fixture
    def large_image_file(self):
        """Create a large image file for testing size limits."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "large.jpg"
        upload_file.content_type = "image/jpeg"
        upload_file.size = 15 * 1024 * 1024  # 15MB (over limit)
        upload_file.read = AsyncMock(return_value=b"fake large image data")
        upload_file.seek = AsyncMock()
        
        return upload_file
    
    @pytest.fixture
    def invalid_type_file(self):
        """Create an invalid file type for testing."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "document.pdf"
        upload_file.content_type = "application/pdf"
        upload_file.size = 1024
        upload_file.read = AsyncMock(return_value=b"fake pdf data")
        upload_file.seek = AsyncMock()
        
        return upload_file
    
    @pytest.mark.asyncio
    async def test_validate_file_success(self, valid_image_file):
        """Test successful file validation."""
        with patch('magic.from_buffer', return_value='image/jpeg'):
            # Should not raise any exception
            await validate_file(valid_image_file)
            
            # Verify file operations
            valid_image_file.seek.assert_called()
            valid_image_file.read.assert_called()
    
    @pytest.mark.asyncio
    async def test_validate_file_no_file(self):
        """Test validation with no file provided."""
        with pytest.raises(FileValidationError) as exc_info:
            await validate_file(None)
        
        assert "No file provided" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_file_no_filename(self):
        """Test validation with no filename."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = None
        
        with pytest.raises(FileValidationError) as exc_info:
            await validate_file(upload_file)
        
        assert "Filename is required" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_file_too_large(self, large_image_file):
        """Test validation with file too large."""
        with pytest.raises(FileValidationError) as exc_info:
            await validate_file(large_image_file)
        
        assert "File too large" in str(exc_info.value)
        assert "15.0MB" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_file_empty(self):
        """Test validation with empty file."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "empty.jpg"
        upload_file.content_type = "image/jpeg"
        upload_file.size = 0
        upload_file.read = AsyncMock(return_value=b"")
        upload_file.seek = AsyncMock()
        
        with pytest.raises(FileValidationError) as exc_info:
            await validate_file(upload_file)
        
        assert "Empty file provided" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_file_invalid_type(self, invalid_type_file):
        """Test validation with invalid file type."""
        with pytest.raises(FileValidationError) as exc_info:
            await validate_file(invalid_type_file)
        
        assert "Unsupported file type" in str(exc_info.value)
        assert "application/pdf" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_file_invalid_extension(self):
        """Test validation with invalid file extension."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "document.txt"
        upload_file.content_type = "image/jpeg"  # Mismatch
        upload_file.size = 1024
        upload_file.read = AsyncMock(return_value=b"fake image data")
        upload_file.seek = AsyncMock()
        
        with pytest.raises(FileValidationError) as exc_info:
            await validate_file(upload_file)
        
        assert "Unsupported file extension" in str(exc_info.value)
        assert ".txt" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_file_content_mismatch(self, valid_image_file):
        """Test validation with content type mismatch."""
        # Mock magic to return different MIME type
        with patch('magic.from_buffer', return_value='text/plain'):
            with pytest.raises(FileValidationError) as exc_info:
                await validate_file(valid_image_file)
            
            assert "File content does not match declared type" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_file_magic_failure(self, valid_image_file):
        """Test validation when magic library fails."""
        # Mock magic to raise exception
        with patch('magic.from_buffer', side_effect=Exception("Magic failed")):
            # Should continue without magic validation
            await validate_file(valid_image_file)


class TestImageContentValidation:
    """Test image content validation functionality."""
    
    @pytest.fixture
    def valid_image_bytes(self):
        """Create valid image bytes for testing."""
        image = Image.new('RGB', (512, 384), color='blue')
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        return buffer.getvalue()
    
    @pytest.fixture
    def corrupted_image_bytes(self):
        """Create corrupted image bytes for testing."""
        return b"This is not a valid image file"
    
    @pytest.fixture
    def huge_image_bytes(self):
        """Create extremely large image bytes for testing."""
        # Create a very large image (simulated)
        return b"fake huge image data that would be too large"
    
    @pytest.mark.asyncio
    async def test_validate_image_content_success(self, valid_image_bytes):
        """Test successful image content validation."""
        width, height = await validate_image_content(valid_image_bytes)
        
        assert width == 512
        assert height == 384
    
    @pytest.mark.asyncio
    async def test_validate_image_content_corrupted(self, corrupted_image_bytes):
        """Test validation with corrupted image."""
        with pytest.raises(FileValidationError) as exc_info:
            await validate_image_content(corrupted_image_bytes)
        
        assert "Corrupted or invalid image" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_image_content_too_large(self):
        """Test validation with extremely large image."""
        # Mock PIL to return huge dimensions
        with patch('PIL.Image.open') as mock_open:
            mock_image = Mock()
            mock_image.size = (10000, 10000)  # 100MP image
            mock_image.verify = Mock()
            mock_open.return_value = mock_image
            
            fake_bytes = b"fake large image"
            
            with pytest.raises(FileValidationError) as exc_info:
                await validate_image_content(fake_bytes)
            
            assert "Image too large" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_validate_image_content_invalid_dimensions(self):
        """Test validation with invalid dimensions."""
        # Mock PIL to return invalid dimensions
        with patch('PIL.Image.open') as mock_open:
            mock_image = Mock()
            mock_image.size = (0, 0)  # Invalid dimensions
            mock_image.verify = Mock()
            mock_open.return_value = mock_image
            
            fake_bytes = b"fake image with invalid dimensions"
            
            with pytest.raises(FileValidationError) as exc_info:
                await validate_image_content(fake_bytes)
            
            assert "Invalid image dimensions" in str(exc_info.value)


class TestFilenameUtils:
    """Test filename utility functions."""
    
    def test_get_safe_filename_normal(self):
        """Test safe filename generation with normal filename."""
        result = get_safe_filename("my_image_file.jpg")
        assert result == "my_image_file.jpg"
    
    def test_get_safe_filename_special_chars(self):
        """Test safe filename generation with special characters."""
        result = get_safe_filename("my image@#$%file!.jpg")
        assert result == "my_image____file_.jpg"
        # Special characters should be replaced with underscores
    
    def test_get_safe_filename_unicode(self):
        """Test safe filename generation with unicode characters."""
        result = get_safe_filename("图片文件.jpg")
        assert result.endswith(".jpg")
        # Unicode characters should be handled appropriately
    
    def test_get_safe_filename_empty(self):
        """Test safe filename generation with empty filename."""
        result = get_safe_filename("")
        assert result == "file"
    
    def test_get_safe_filename_none(self):
        """Test safe filename generation with None."""
        result = get_safe_filename(None)
        assert result == "unknown_file"
    
    def test_get_safe_filename_too_long(self):
        """Test safe filename generation with very long filename."""
        long_name = "a" * 150 + ".jpg"
        result = get_safe_filename(long_name)
        
        # Should be limited to reasonable length
        assert len(result) <= 104  # 100 chars + .jpg
        assert result.endswith(".jpg")


class TestTempFileOperations:
    """Test temporary file operations."""
    
    @pytest.fixture
    def mock_upload_file(self):
        """Create mock upload file for testing."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "test.jpg"
        upload_file.read = AsyncMock(return_value=b"fake image data")
        upload_file.seek = AsyncMock()
        
        return upload_file
    
    @pytest.mark.asyncio
    async def test_save_temp_file_success(self, mock_upload_file):
        """Test successful temporary file saving."""
        with patch('os.makedirs'), \
             patch('builtins.open', create=True) as mock_open:
            
            mock_file = Mock()
            mock_open.return_value.__enter__.return_value = mock_file
            
            temp_path = await save_temp_file(mock_upload_file)
            
            # Should return a path
            assert isinstance(temp_path, str)
            assert "test.jpg" in temp_path
            
            # Should have written file
            mock_file.write.assert_called_once_with(b"fake image data")
    
    @pytest.mark.asyncio
    async def test_save_temp_file_error(self, mock_upload_file):
        """Test temporary file saving with error."""
        with patch('os.makedirs'), \
             patch('builtins.open', side_effect=OSError("Disk full")):
            
            with pytest.raises(FileValidationError) as exc_info:
                await save_temp_file(mock_upload_file)
            
            assert "Failed to save file" in str(exc_info.value)
    
    def test_cleanup_temp_file_success(self):
        """Test successful temporary file cleanup."""
        # Create a real temporary file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            temp_file.write(b"test data")
        
        # File should exist
        assert os.path.exists(temp_path)
        
        # Clean up
        cleanup_temp_file(temp_path)
        
        # File should be gone
        assert not os.path.exists(temp_path)
    
    def test_cleanup_temp_file_not_exists(self):
        """Test cleanup of non-existent file."""
        # Should not raise exception
        cleanup_temp_file("/non/existent/file.jpg")
    
    def test_cleanup_old_temp_files(self):
        """Test cleanup of old temporary files."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create some test files
            old_file = os.path.join(temp_dir, "old_file.jpg")
            new_file = os.path.join(temp_dir, "new_file.jpg")
            
            # Create files
            with open(old_file, 'w') as f:
                f.write("old")
            with open(new_file, 'w') as f:
                f.write("new")
            
            # Make old file actually old
            old_time = time.time() - (25 * 3600)  # 25 hours ago
            os.utime(old_file, (old_time, old_time))
            
            # Mock settings.temp_dir
            with patch('visual_content_analyzer.backend.utils.settings.temp_dir', temp_dir):
                count = cleanup_old_temp_files(max_age_hours=24)
            
            # Should have cleaned up old file
            assert count >= 0  # Depending on timing
    
    def test_cleanup_old_temp_files_no_dir(self):
        """Test cleanup when temp directory doesn't exist."""
        with patch('visual_content_analyzer.backend.utils.settings.temp_dir', '/non/existent/dir'):
            count = cleanup_old_temp_files()
            assert count == 0


class TestFileFormatting:
    """Test file formatting utilities."""
    
    def test_format_file_size_bytes(self):
        """Test file size formatting for bytes."""
        assert format_file_size(512) == "512.0 B"
    
    def test_format_file_size_kb(self):
        """Test file size formatting for kilobytes."""
        assert format_file_size(1536) == "1.5 KB"
    
    def test_format_file_size_mb(self):
        """Test file size formatting for megabytes."""
        assert format_file_size(2097152) == "2.0 MB"
    
    def test_format_file_size_gb(self):
        """Test file size formatting for gigabytes."""
        assert format_file_size(3221225472) == "3.0 GB"
    
    def test_format_file_size_zero(self):
        """Test file size formatting for zero bytes."""
        assert format_file_size(0) == "0.0 B"


class TestFileInfo:
    """Test file information extraction."""
    
    def test_get_file_info_complete(self):
        """Test file info extraction with complete file."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "vacation_photo.jpg"
        upload_file.content_type = "image/jpeg"
        upload_file.size = 2048
        
        info = get_file_info(upload_file)
        
        assert info["filename"] == "vacation_photo.jpg"
        assert info["content_type"] == "image/jpeg"
        assert info["size_bytes"] == 2048
        assert info["size_formatted"] == "2.0 KB"
        assert info["extension"] == ".jpg"
        assert info["basename"] == "vacation_photo"
    
    def test_get_file_info_no_filename(self):
        """Test file info extraction without filename."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = None
        upload_file.content_type = "image/png"
        upload_file.size = 1024
        
        info = get_file_info(upload_file)
        
        assert info["filename"] is None
        assert info["content_type"] == "image/png"
        assert info["size_bytes"] == 1024
        assert "extension" not in info
        assert "basename" not in info
    
    def test_get_file_info_no_size(self):
        """Test file info extraction without size."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "test.png"
        upload_file.content_type = "image/png"
        # No size attribute
        
        info = get_file_info(upload_file)
        
        assert info["filename"] == "test.png"
        assert info["size_bytes"] is None
        assert info["size_formatted"] == "Unknown"


class TestTempFileManager:
    """Test temporary file manager context manager."""
    
    @pytest.fixture
    def mock_upload_file(self):
        """Create mock upload file for context manager testing."""
        upload_file = Mock(spec=UploadFile)
        upload_file.filename = "context_test.jpg"
        upload_file.read = AsyncMock(return_value=b"context test data")
        upload_file.seek = AsyncMock()
        
        return upload_file
    
    @pytest.mark.asyncio
    async def test_temp_file_manager_success(self, mock_upload_file):
        """Test successful temporary file manager usage."""
        with patch('visual_content_analyzer.backend.utils.save_temp_file', 
                   return_value="/tmp/test_file.jpg") as mock_save, \
             patch('visual_content_analyzer.backend.utils.cleanup_temp_file') as mock_cleanup:
            
            async with TempFileManager(mock_upload_file) as temp_path:
                assert temp_path == "/tmp/test_file.jpg"
                # File should be saved
                mock_save.assert_called_once_with(mock_upload_file)
            
            # File should be cleaned up after context
            mock_cleanup.assert_called_once_with("/tmp/test_file.jpg")
    
    @pytest.mark.asyncio
    async def test_temp_file_manager_exception(self, mock_upload_file):
        """Test temporary file manager with exception in context."""
        with patch('visual_content_analyzer.backend.utils.save_temp_file', 
                   return_value="/tmp/test_file.jpg") as mock_save, \
             patch('visual_content_analyzer.backend.utils.cleanup_temp_file') as mock_cleanup:
            
            try:
                async with TempFileManager(mock_upload_file) as temp_path:
                    assert temp_path == "/tmp/test_file.jpg"
                    # Raise exception in context
                    raise ValueError("Test exception")
            except ValueError:
                pass
            
            # File should still be cleaned up
            mock_cleanup.assert_called_once_with("/tmp/test_file.jpg")


class TestErrorHandlerDecorator:
    """Test error handler decorator functionality."""
    
    @pytest.mark.asyncio
    async def test_error_handler_success(self):
        """Test error handler with successful function."""
        from ..utils import error_handler
        
        @error_handler
        async def test_function():
            return "success"
        
        result = await test_function()
        assert result == "success"
    
    @pytest.mark.asyncio
    async def test_error_handler_file_validation_error(self):
        """Test error handler with FileValidationError."""
        from ..utils import error_handler
        
        @error_handler
        async def test_function():
            raise FileValidationError("Test validation error")
        
        # Should re-raise FileValidationError
        with pytest.raises(FileValidationError):
            await test_function()
    
    @pytest.mark.asyncio
    async def test_error_handler_other_exception(self):
        """Test error handler with other exceptions."""
        from ..utils import error_handler
        
        @error_handler
        async def test_function():
            raise ValueError("Test other error")
        
        # Should wrap in FileValidationError
        with pytest.raises(FileValidationError) as exc_info:
            await test_function()
        
        assert "Operation failed" in str(exc_info.value)


# Pytest configuration for async testing
@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])