"""
Configuration management for Visual Content Analyzer using pydantic-settings.
"""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator, ConfigDict
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # BLIP Model Configuration
    model_name: str = Field(
        default="Salesforce/blip-image-captioning-base",
        description="BLIP model checkpoint to use for image captioning"
    )
    model_cache_dir: Optional[str] = Field(
        default=None,
        description="Directory to cache downloaded models"
    )
    max_model_memory: int = Field(
        default=2048,
        description="Maximum memory usage for model in MB"
    )
    
    # File Upload Configuration
    max_file_size: int = Field(
        default=10 * 1024 * 1024,  # 10MB in bytes
        description="Maximum file size for uploads in bytes"
    )
    allowed_extensions: List[str] = Field(
        default=["image/jpeg", "image/png", "image/webp"],
        description="Allowed MIME types for image uploads"
    )
    temp_dir: str = Field(
        default="/tmp/visual-analyzer",
        description="Temporary directory for file processing"
    )
    
    # API Configuration
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        description="Allowed CORS origins for frontend communication"
    )
    api_host: str = Field(default="0.0.0.0", description="API host address")
    api_port: int = Field(default=8000, description="API port number")
    
    # Image Processing Configuration
    max_image_size: tuple[int, int] = Field(
        default=(512, 512),
        description="Maximum image dimensions for processing (width, height)"
    )
    confidence_threshold: float = Field(
        default=0.1,
        ge=0.0,
        le=1.0,
        description="Minimum confidence score for tags"
    )
    max_tags: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum number of tags to return"
    )
    
    # Application Configuration
    app_env: str = Field(default="development", description="Application environment")
    log_level: str = Field(default="INFO", description="Logging level")
    debug: bool = Field(default=False, description="Enable debug mode")
    
    @field_validator("max_file_size")
    @classmethod
    def validate_file_size(cls, v):
        """Ensure file size is reasonable."""
        if v <= 0:
            raise ValueError("Max file size must be positive")
        if v > 100 * 1024 * 1024:  # 100MB limit
            raise ValueError("Max file size cannot exceed 100MB")
        return v
    
    @field_validator("allowed_extensions")
    @classmethod
    def validate_extensions(cls, v):
        """Ensure only image MIME types are allowed."""
        valid_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
        for ext in v:
            if not ext.startswith("image/"):
                raise ValueError(f"Invalid MIME type: {ext}. Must be image/* type")
        return v
    
    @field_validator("confidence_threshold")
    @classmethod
    def validate_confidence(cls, v):
        """Ensure confidence threshold is valid."""
        if not 0.0 <= v <= 1.0:
            raise ValueError("Confidence threshold must be between 0.0 and 1.0")
        return v


# Global settings instance with error handling
try:
    settings = Settings()
except Exception as e:
    # For testing, create settings with safe defaults
    import warnings
    warnings.warn(f"Failed to load settings from environment: {e}. Using defaults.")
    
    # Set safe environment defaults for testing
    os.environ.setdefault("MODEL_NAME", "Salesforce/blip-image-captioning-base")
    os.environ.setdefault("MAX_FILE_SIZE", "10485760")  # 10MB
    os.environ.setdefault("APP_ENV", "development")
    
    settings = Settings()


def create_temp_dir():
    """Create temporary directory if it doesn't exist."""
    import os
    os.makedirs(settings.temp_dir, exist_ok=True)
    return settings.temp_dir


def get_model_config():
    """Get model configuration for BLIP initialization."""
    return {
        "model_name": settings.model_name,
        "cache_dir": settings.model_cache_dir,
        "max_memory": settings.max_model_memory
    }


def get_upload_config():
    """Get file upload configuration."""
    return {
        "max_size": settings.max_file_size,
        "allowed_types": settings.allowed_extensions,
        "temp_dir": settings.temp_dir
    }