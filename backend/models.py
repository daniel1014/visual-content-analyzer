"""
BLIP Model Integration for Visual Content Analysis.

Implements singleton pattern for efficient model loading and async processing
for CPU-bound image inference operations.
"""

import asyncio
import io
import logging
import time
from typing import List, Optional, Tuple
from PIL import Image
import torch
from transformers import BlipProcessor, BlipForConditionalGeneration

from config import settings, get_model_config
from schemas import TagResult

# Setup logging
logging.basicConfig(level=getattr(logging, settings.log_level))
logger = logging.getLogger(__name__)


class BLIPModelError(Exception):
    """Custom exception for BLIP model related errors."""
    pass


class BLIPModel:
    """
    Singleton BLIP model wrapper for image captioning.
    
    Implements lazy loading, caching, and async processing patterns
    to handle the expensive model initialization and CPU-bound inference.
    """
    
    _instance: Optional['BLIPModel'] = None
    _model: Optional[BlipForConditionalGeneration] = None
    _processor: Optional[BlipProcessor] = None
    _model_loaded: bool = False
    _loading_lock = asyncio.Lock()
    
    def __new__(cls) -> 'BLIPModel':
        """Ensure singleton pattern - only one instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def load_model(self) -> None:
        """
        Load BLIP model and processor with error handling and caching.
        
        Uses async lock to prevent multiple loading attempts and implements
        proper error handling for model initialization failures.
        
        Raises:
            BLIPModelError: If model loading fails
        """
        if self._model_loaded:
            return
        
        async with self._loading_lock:
            # Double-check after acquiring lock
            if self._model_loaded:
                return
            
            try:
                logger.info(f"Loading BLIP model: {settings.model_name}")
                start_time = time.time()
                
                # Use executor for blocking I/O operations
                loop = asyncio.get_event_loop()
                
                # Load processor and model in executor to avoid blocking
                self._processor = await loop.run_in_executor(
                    None,
                    lambda: BlipProcessor.from_pretrained(
                        settings.model_name,
                        cache_dir=settings.model_cache_dir
                    )
                )
                
                self._model = await loop.run_in_executor(
                    None,
                    lambda: BlipForConditionalGeneration.from_pretrained(
                        settings.model_name,
                        cache_dir=settings.model_cache_dir,
                        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
                    )
                )
                
                # Move model to appropriate device
                device = "cuda" if torch.cuda.is_available() else "cpu"
                self._model = self._model.to(device)
                
                # Set to evaluation mode for inference
                self._model.eval()
                
                self._model_loaded = True
                load_time = time.time() - start_time
                
                logger.info(f"BLIP model loaded successfully in {load_time:.2f}s on {device}")
                
            except Exception as e:
                logger.error(f"Failed to load BLIP model: {e}")
                raise BLIPModelError(f"Model loading failed: {str(e)}") from e
    
    def _preprocess_image(self, image_bytes: bytes) -> Image.Image:
        """
        Preprocess image for BLIP model input.
        
        Args:
            image_bytes: Raw image bytes
            
        Returns:
            PIL Image ready for processing
            
        Raises:
            BLIPModelError: If image processing fails
        """
        try:
            # Open image from bytes
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if not already (handles RGBA, grayscale, etc.)
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Resize large images to prevent OOM errors
            # CRITICAL: This prevents memory issues with large images
            if max(image.size) > max(settings.max_image_size):
                logger.info(f"Resizing image from {image.size} to max {settings.max_image_size}")
                image.thumbnail(settings.max_image_size, Image.Resampling.LANCZOS)
            
            return image
            
        except Exception as e:
            logger.error(f"Image preprocessing failed: {e}")
            raise BLIPModelError(f"Image preprocessing failed: {str(e)}") from e
    
    def _generate_tags_sync(self, image: Image.Image) -> List[TagResult]:
        """
        Synchronous tag generation for use in executor.
        
        Args:
            image: Preprocessed PIL Image
            
        Returns:
            List of TagResult objects with tags and confidence scores
        """
        try:
            # Process image for model input
            inputs = self._processor(images=image, return_tensors="pt")
            
            # Move inputs to same device as model
            device = next(self._model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}
            
            # Generate multiple captions for diverse tags
            with torch.no_grad():
                outputs = self._model.generate(
                    **inputs,
                    max_length=50,
                    num_return_sequences=settings.max_tags,
                    temperature=0.7,
                    do_sample=True,
                    early_stopping=True,
                    no_repeat_ngram_size=2
                )
            
            # Decode captions
            captions = []
            for output in outputs:
                caption = self._processor.decode(output, skip_special_tokens=True)
                # Remove any leading/trailing whitespace and convert to lowercase
                caption = caption.strip().lower()
                if caption and len(caption) > 3:  # Filter very short captions
                    captions.append(caption)
            
            # Remove duplicates while preserving order
            unique_captions = []
            seen = set()
            for caption in captions:
                if caption not in seen:
                    unique_captions.append(caption)
                    seen.add(caption)
            
            # Create TagResult objects with confidence scores
            # BLIP doesn't provide confidence directly, so we use a heuristic
            # based on generation order and length
            tags = []
            for i, caption in enumerate(unique_captions[:settings.max_tags]):
                # Generate confidence score based on generation order and caption quality
                base_confidence = 0.9 - (i * 0.1)  # Decrease confidence for later generations
                length_bonus = min(len(caption.split()) / 10, 0.1)  # Bonus for descriptive captions
                confidence = max(base_confidence + length_bonus, settings.confidence_threshold)
                
                tags.append(TagResult(
                    tag=caption,
                    confidence=round(confidence, 3)
                ))
            
            # Filter by confidence threshold
            filtered_tags = [tag for tag in tags if tag.confidence >= settings.confidence_threshold]
            
            # Ensure we return at least one tag if any were generated
            if not filtered_tags and tags:
                filtered_tags = [tags[0]]  # Return the best tag even if below threshold
            
            return filtered_tags[:settings.max_tags]
            
        except Exception as e:
            logger.error(f"Tag generation failed: {e}")
            raise BLIPModelError(f"Tag generation failed: {str(e)}") from e
    
    async def analyze_image(
        self, 
        image_bytes: bytes,
        filename: Optional[str] = None
    ) -> Tuple[List[TagResult], float, Tuple[int, int]]:
        """
        Analyze image and generate descriptive tags with confidence scores.
        
        Args:
            image_bytes: Raw image bytes
            filename: Optional filename for logging
            
        Returns:
            Tuple of (tags, processing_time, image_size)
            
        Raises:
            BLIPModelError: If analysis fails
        """
        start_time = time.time()
        
        try:
            # Ensure model is loaded
            await self.load_model()
            
            # Preprocess image
            logger.info(f"Processing image: {filename or 'unknown'}")
            image = self._preprocess_image(image_bytes)
            image_size = image.size
            
            # Use executor for CPU-bound inference to avoid blocking event loop
            # CRITICAL: This prevents blocking FastAPI's async event loop
            loop = asyncio.get_event_loop()
            tags = await loop.run_in_executor(
                None,
                self._generate_tags_sync,
                image
            )
            
            processing_time = time.time() - start_time
            
            logger.info(f"Generated {len(tags)} tags in {processing_time:.2f}s for {filename or 'image'}")
            
            return tags, processing_time, image_size
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Image analysis failed after {processing_time:.2f}s: {e}")
            raise BLIPModelError(f"Image analysis failed: {str(e)}") from e
    
    async def health_check(self) -> dict:
        """
        Perform health check on the model.
        
        Returns:
            Dictionary with model status information
        """
        try:
            await self.load_model()
            
            device = "cuda" if torch.cuda.is_available() else "cpu"
            memory_used = 0
            
            if torch.cuda.is_available():
                memory_used = torch.cuda.memory_allocated() / 1024**2  # MB
            
            return {
                "status": "healthy",
                "model_loaded": self._model_loaded,
                "model_name": settings.model_name,
                "device": device,
                "memory_used_mb": round(memory_used, 2),
                "max_image_size": settings.max_image_size,
                "max_tags": settings.max_tags
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "model_loaded": self._model_loaded
            }


# Global model instance
blip_model = BLIPModel()


async def get_model() -> BLIPModel:
    """
    Get the global BLIP model instance.
    
    Returns:
        Initialized BLIPModel instance
    """
    await blip_model.load_model()
    return blip_model