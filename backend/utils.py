"""
Utility functions for Visual Content Analyzer.

Provides file validation, security checks, cleanup utilities,
and helper functions for the FastAPI application.
"""

import os
import tempfile
import logging
import mimetypes
from typing import Optional, BinaryIO
from functools import wraps
from pathlib import Path

from fastapi import UploadFile, HTTPException, status
from PIL import Image
import magic

from config import settings

logger = logging.getLogger(__name__)


class FileValidationError(Exception):
    """Custom exception for file validation errors."""
    
    def __init__(self, message: str, invalid_value: Optional[str] = None):
        super().__init__(message)
        self.invalid_value = invalid_value


def error_handler(func):
    """Decorator for consistent error handling in utility functions."""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except FileValidationError:
            # Re-raise validation errors as-is
            raise
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {e}")
            raise FileValidationError(f"Operation failed: {str(e)}")
    return wrapper


async def validate_file(file: UploadFile) -> None:
    """
    Comprehensive file validation for uploaded images.
    
    Validates file size, MIME type, content type, and image integrity
    to ensure security and compatibility with the BLIP model.
    
    Args:
        file: FastAPI UploadFile object
        
    Raises:
        FileValidationError: If validation fails
    """
    if not file:
        raise FileValidationError("No file provided")
    
    # Validate filename
    if not file.filename:
        raise FileValidationError("Filename is required")
    
    # Check file size
    if hasattr(file, 'size') and file.size is not None:
        if file.size == 0:
            raise FileValidationError("Empty file provided")
        
        if file.size > settings.max_file_size:
            max_mb = settings.max_file_size / (1024 * 1024)
            raise FileValidationError(
                f"File too large. Maximum size is {max_mb:.1f}MB",
                invalid_value=f"{file.size / (1024 * 1024):.1f}MB"
            )
    
    # Validate MIME type from FastAPI
    if file.content_type not in settings.allowed_extensions:
        raise FileValidationError(
            f"Unsupported file type: {file.content_type}. "
            f"Allowed types: {', '.join(settings.allowed_extensions)}",
            invalid_value=file.content_type
        )
    
    # Read a small chunk to validate actual content
    # Reset file pointer first
    await file.seek(0)
    chunk = await file.read(1024)  # Read first 1KB
    await file.seek(0)  # Reset for later use
    
    if not chunk:
        raise FileValidationError("File appears to be empty or corrupted")
    
    # Validate actual file content using python-magic
    try:
        detected_mime = magic.from_buffer(chunk, mime=True)
        
        # Map common variations
        mime_mapping = {
            'image/jpg': 'image/jpeg',
            'image/pjpeg': 'image/jpeg'
        }
        
        detected_mime = mime_mapping.get(detected_mime, detected_mime)
        
        if detected_mime not in settings.allowed_extensions:
            raise FileValidationError(
                f"File content does not match declared type. "
                f"Detected: {detected_mime}, Declared: {file.content_type}",
                invalid_value=detected_mime
            )
            
    except Exception as e:
        logger.warning(f"Magic detection failed: {e}")
        # Continue without magic validation if library fails
    
    # Validate file extension
    if file.filename:
        file_ext = Path(file.filename).suffix.lower()
        allowed_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
        
        if file_ext not in allowed_extensions:
            raise FileValidationError(
                f"Unsupported file extension: {file_ext}. "
                f"Allowed extensions: {', '.join(allowed_extensions)}",
                invalid_value=file_ext
            )


async def validate_image_content(file_data: bytes) -> tuple[int, int]:
    """
    Validate image data and return dimensions.
    
    Args:
        file_data: Raw image bytes
        
    Returns:
        Tuple of (width, height) in pixels
        
    Raises:
        FileValidationError: If image is corrupted or invalid
    """
    try:
        # Try to open and validate image using PIL
        image = Image.open(io.BytesIO(file_data))
        
        # Verify image can be loaded
        image.verify()
        
        # Re-open for size info (verify() closes the image)
        image = Image.open(io.BytesIO(file_data))
        width, height = image.size
        
        # Validate dimensions
        if width <= 0 or height <= 0:
            raise FileValidationError("Invalid image dimensions")
        
        # Check for extremely large images that might cause memory issues
        max_pixels = 50 * 1024 * 1024  # 50MP limit
        if width * height > max_pixels:
            raise FileValidationError(
                f"Image too large: {width}x{height} pixels. "
                f"Maximum supported: {max_pixels / (1024*1024):.1f}MP"
            )
        
        return width, height
        
    except FileValidationError:
        raise
    except Exception as e:
        logger.error(f"Image validation failed: {e}")
        raise FileValidationError(f"Corrupted or invalid image: {str(e)}")


def get_safe_filename(filename: str) -> str:
    """
    Generate a safe filename for temporary storage.
    
    Args:
        filename: Original filename
        
    Returns:
        Sanitized filename safe for filesystem operations
    """
    if not filename:
        return "unknown_file"
    
    # Get file extension
    path = Path(filename)
    name = path.stem
    ext = path.suffix
    
    # Sanitize filename
    safe_chars = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
    safe_name = "".join(c if c in safe_chars else "_" for c in name)
    
    # Ensure name is not empty
    if not safe_name:
        safe_name = "file"
    
    # Limit length
    if len(safe_name) > 100:
        safe_name = safe_name[:100]
    
    return f"{safe_name}{ext}"


async def save_temp_file(file: UploadFile) -> str:
    """
    Save uploaded file to temporary storage.
    
    Args:
        file: FastAPI UploadFile object
        
    Returns:
        Path to saved temporary file
        
    Raises:
        FileValidationError: If save operation fails
    """
    try:
        # Create temporary file
        safe_filename = get_safe_filename(file.filename or "upload")
        temp_path = os.path.join(settings.temp_dir, f"temp_{int(time.time())}_{safe_filename}")
        
        # Ensure temp directory exists
        os.makedirs(settings.temp_dir, exist_ok=True)
        
        # Save file
        with open(temp_path, "wb") as temp_file:
            await file.seek(0)
            content = await file.read()
            temp_file.write(content)
        
        logger.info(f"Saved temporary file: {temp_path}")
        return temp_path
        
    except Exception as e:
        logger.error(f"Failed to save temporary file: {e}")
        raise FileValidationError(f"Failed to save file: {str(e)}")


def cleanup_temp_file(file_path: str) -> None:
    """
    Clean up temporary file safely.
    
    Args:
        file_path: Path to temporary file to delete
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.debug(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup temporary file {file_path}: {e}")


def cleanup_old_temp_files(max_age_hours: int = 24) -> int:
    """
    Clean up old temporary files.
    
    Args:
        max_age_hours: Maximum age of files to keep in hours
        
    Returns:
        Number of files cleaned up
    """
    if not os.path.exists(settings.temp_dir):
        return 0
    
    import time
    
    cleaned_count = 0
    max_age_seconds = max_age_hours * 3600
    current_time = time.time()
    
    try:
        for filename in os.listdir(settings.temp_dir):
            file_path = os.path.join(settings.temp_dir, filename)
            
            # Skip directories
            if os.path.isdir(file_path):
                continue
            
            # Check file age
            file_age = current_time - os.path.getctime(file_path)
            
            if file_age > max_age_seconds:
                try:
                    os.remove(file_path)
                    cleaned_count += 1
                    logger.debug(f"Cleaned up old temporary file: {file_path}")
                except Exception as e:
                    logger.warning(f"Failed to remove old file {file_path}: {e}")
    
    except Exception as e:
        logger.error(f"Error during temp file cleanup: {e}")
    
    if cleaned_count > 0:
        logger.info(f"Cleaned up {cleaned_count} old temporary files")
    
    return cleaned_count


def format_file_size(size_bytes: int) -> str:
    """
    Format file size in human-readable format.
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        Formatted size string (e.g., "1.5 MB")
    """
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"


def get_file_info(file: UploadFile) -> dict:
    """
    Extract comprehensive file information.
    
    Args:
        file: FastAPI UploadFile object
        
    Returns:
        Dictionary with file metadata
    """
    info = {
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": getattr(file, 'size', None),
        "size_formatted": format_file_size(getattr(file, 'size', 0)) if hasattr(file, 'size') else "Unknown"
    }
    
    if file.filename:
        path = Path(file.filename)
        info.update({
            "extension": path.suffix.lower(),
            "basename": path.stem
        })
    
    return info


# Context manager for temporary file handling
class TempFileManager:
    """Context manager for temporary file lifecycle management."""
    
    def __init__(self, file: UploadFile):
        self.file = file
        self.temp_path: Optional[str] = None
    
    async def __aenter__(self) -> str:
        """Save file and return temporary path."""
        self.temp_path = await save_temp_file(self.file)
        return self.temp_path
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Clean up temporary file."""
        if self.temp_path:
            cleanup_temp_file(self.temp_path)


# Import at end to avoid circular imports
import io
import time