"""
Test BLIP model integration and functionality.

Tests for the BLIPModel singleton, image analysis, and error handling
with comprehensive mocking of transformers and PyTorch dependencies.
"""

import pytest
import asyncio
import io
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from PIL import Image
import numpy as np

from ..models import BLIPModel, get_model, BLIPModelError
from ..config import settings


class TestBLIPModelSingleton:
    """Test BLIPModel singleton behavior."""
    
    def test_singleton_pattern(self):
        """Test that BLIPModel follows singleton pattern."""
        # Reset singleton instance for testing
        BLIPModel._instance = None
        
        # Create two instances
        model1 = BLIPModel()
        model2 = BLIPModel()
        
        # Should be the same instance
        assert model1 is model2
        assert BLIPModel._instance is model1
    
    def test_singleton_thread_safety(self):
        """Test singleton behavior in concurrent scenarios."""
        import threading
        
        # Reset singleton
        BLIPModel._instance = None
        instances = []
        
        def create_instance():
            instance = BLIPModel()
            instances.append(instance)
        
        # Create multiple threads
        threads = [threading.Thread(target=create_instance) for _ in range(5)]
        
        # Start all threads
        for thread in threads:
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join()
        
        # All instances should be the same
        assert len(set(instances)) == 1
        assert all(instance is instances[0] for instance in instances)


class TestBLIPModelLoading:
    """Test BLIP model loading and initialization."""
    
    @pytest.fixture
    def mock_transformers(self):
        """Mock transformers library components."""
        with patch('transformers.BlipProcessor') as mock_processor, \
             patch('transformers.BlipForConditionalGeneration') as mock_model:
            
            # Configure mock processor
            mock_processor_instance = Mock()
            mock_processor_instance.tokenizer = Mock()
            mock_processor_instance.tokenizer.decode = Mock(return_value="a beautiful landscape")
            mock_processor.from_pretrained.return_value = mock_processor_instance
            
            # Configure mock model
            mock_model_instance = Mock()
            mock_model_instance.generate = Mock(return_value=[[1, 2, 3, 4, 5]])
            mock_model_instance.to = Mock(return_value=mock_model_instance)
            mock_model.from_pretrained.return_value = mock_model_instance
            
            yield {
                'processor': mock_processor,
                'model': mock_model,
                'processor_instance': mock_processor_instance,
                'model_instance': mock_model_instance
            }
    
    @pytest.mark.asyncio
    async def test_model_loading_success(self, mock_transformers):
        """Test successful model loading."""
        # Reset singleton
        BLIPModel._instance = None
        
        model = BLIPModel()
        await model._load_model()
        
        # Verify model components were loaded
        assert model._processor is not None
        assert model._model is not None
        assert model._device is not None
        
        # Verify transformers calls
        mock_transformers['processor'].from_pretrained.assert_called_once_with(settings.model_name)
        mock_transformers['model'].from_pretrained.assert_called_once_with(settings.model_name)
    
    @pytest.mark.asyncio
    async def test_model_loading_error(self):
        """Test model loading error handling."""
        # Reset singleton
        BLIPModel._instance = None
        
        with patch('transformers.BlipProcessor') as mock_processor:
            mock_processor.from_pretrained.side_effect = Exception("Failed to download model")
            
            model = BLIPModel()
            
            with pytest.raises(BLIPModelError) as exc_info:
                await model._load_model()
            
            assert "Failed to load BLIP model" in str(exc_info.value)
            assert "Failed to download model" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_get_model_function(self, mock_transformers):
        """Test get_model function."""
        # Reset singleton
        BLIPModel._instance = None
        
        model = await get_model()
        
        assert isinstance(model, BLIPModel)
        assert model._processor is not None
        assert model._model is not None


class TestBLIPModelImageAnalysis:
    """Test image analysis functionality."""
    
    @pytest.fixture
    def mock_model_components(self):
        """Mock BLIP model components for testing."""
        with patch('transformers.BlipProcessor') as mock_processor, \
             patch('transformers.BlipForConditionalGeneration') as mock_model, \
             patch('torch.cuda.is_available') as mock_cuda:
            
            # Setup processor mock
            mock_processor_instance = Mock()
            mock_processor_instance.return_value = {
                'input_ids': Mock(),
                'attention_mask': Mock(),
                'pixel_values': Mock()
            }
            mock_processor_instance.tokenizer = Mock()
            mock_processor_instance.tokenizer.decode = Mock(return_value="a beautiful landscape with mountains")
            mock_processor.from_pretrained.return_value = mock_processor_instance
            
            # Setup model mock
            mock_model_instance = Mock()
            mock_model_instance.generate = Mock(return_value=[[101, 102, 103, 104, 105]])
            mock_model_instance.to = Mock(return_value=mock_model_instance)
            mock_model.from_pretrained.return_value = mock_model_instance
            
            # Setup CUDA mock
            mock_cuda.return_value = False
            
            yield {
                'processor': mock_processor,
                'model': mock_model,
                'processor_instance': mock_processor_instance,
                'model_instance': mock_model_instance,
                'cuda': mock_cuda
            }
    
    @pytest.fixture
    def sample_image_bytes(self):
        """Create sample image bytes for testing."""
        # Create a simple test image
        image = Image.new('RGB', (224, 224), color='red')
        
        # Convert to bytes
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG')
        return buffer.getvalue()
    
    @pytest.mark.asyncio
    async def test_analyze_image_success(self, mock_model_components, sample_image_bytes):
        """Test successful image analysis."""
        # Reset singleton
        BLIPModel._instance = None
        
        model = BLIPModel()
        await model._load_model()
        
        # Mock PIL Image operations
        with patch('PIL.Image.open') as mock_image_open:
            mock_image = Mock()
            mock_image.size = (224, 224)
            mock_image.mode = 'RGB'
            mock_image_open.return_value = mock_image
            
            # Analyze image
            tags, processing_time, image_size = await model.analyze_image(
                sample_image_bytes, 
                filename="test.jpg"
            )
            
            # Verify results
            assert len(tags) > 0
            assert all(hasattr(tag, 'tag') and hasattr(tag, 'confidence') for tag in tags)
            assert isinstance(processing_time, float)
            assert processing_time > 0
            assert image_size == (224, 224)
            
            # Verify model was called
            mock_model_components['model_instance'].generate.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_analyze_image_with_custom_tags(self, mock_model_components, sample_image_bytes):
        """Test image analysis with custom tag generation."""
        # Reset singleton
        BLIPModel._instance = None
        
        # Configure mock to return specific caption
        mock_model_components['processor_instance'].tokenizer.decode.return_value = \
            "a beautiful mountain landscape with trees and sky"
        
        model = BLIPModel()
        await model._load_model()
        
        # Mock PIL Image operations
        with patch('PIL.Image.open') as mock_image_open:
            mock_image = Mock()
            mock_image.size = (512, 384)
            mock_image.mode = 'RGB'
            mock_image_open.return_value = mock_image
            
            tags, processing_time, image_size = await model.analyze_image(
                sample_image_bytes,
                filename="landscape.jpg"
            )
            
            # Should generate multiple tags from the caption
            assert len(tags) >= 3
            tag_texts = [tag.tag for tag in tags]
            
            # Should contain relevant keywords
            assert any("mountain" in tag.lower() for tag in tag_texts)
            assert any("landscape" in tag.lower() for tag in tag_texts)
            
            # All confidence scores should be valid
            assert all(0.0 <= tag.confidence <= 1.0 for tag in tags)
    
    @pytest.mark.asyncio
    async def test_analyze_image_invalid_image(self, mock_model_components):
        """Test error handling for invalid image data."""
        # Reset singleton
        BLIPModel._instance = None
        
        model = BLIPModel()
        await model._load_model()
        
        # Test with invalid image bytes
        with pytest.raises(BLIPModelError) as exc_info:
            await model.analyze_image(b"invalid image data", filename="test.jpg")
        
        assert "Failed to process image" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_analyze_image_model_error(self, mock_model_components, sample_image_bytes):
        """Test error handling when model generation fails."""
        # Reset singleton
        BLIPModel._instance = None
        
        # Configure model to raise exception
        mock_model_components['model_instance'].generate.side_effect = RuntimeError("CUDA out of memory")
        
        model = BLIPModel()
        await model._load_model()
        
        # Mock PIL Image operations
        with patch('PIL.Image.open') as mock_image_open:
            mock_image = Mock()
            mock_image.size = (224, 224)
            mock_image.mode = 'RGB'
            mock_image_open.return_value = mock_image
            
            with pytest.raises(BLIPModelError) as exc_info:
                await model.analyze_image(sample_image_bytes, filename="test.jpg")
            
            assert "Image analysis failed" in str(exc_info.value)
            assert "CUDA out of memory" in str(exc_info.value)


class TestBLIPModelHealthCheck:
    """Test model health check functionality."""
    
    @pytest.fixture
    def mock_healthy_model(self):
        """Mock a healthy BLIP model."""
        with patch('transformers.BlipProcessor') as mock_processor, \
             patch('transformers.BlipForConditionalGeneration') as mock_model:
            
            # Setup healthy model
            mock_processor_instance = Mock()
            mock_processor.from_pretrained.return_value = mock_processor_instance
            
            mock_model_instance = Mock()
            mock_model_instance.generate = Mock(return_value=[[1, 2, 3]])
            mock_model.from_pretrained.return_value = mock_model_instance
            
            yield {
                'processor': mock_processor,
                'model': mock_model,
                'processor_instance': mock_processor_instance,
                'model_instance': mock_model_instance
            }
    
    @pytest.mark.asyncio
    async def test_health_check_healthy(self, mock_healthy_model):
        """Test health check with healthy model."""
        # Reset singleton
        BLIPModel._instance = None
        
        model = BLIPModel()
        await model._load_model()
        
        health_status = await model.health_check()
        
        assert health_status["status"] == "healthy"
        assert health_status["model_loaded"] is True
        assert "model_name" in health_status
        assert "device" in health_status
    
    @pytest.mark.asyncio
    async def test_health_check_unloaded(self):
        """Test health check with unloaded model."""
        # Reset singleton
        BLIPModel._instance = None
        
        model = BLIPModel()
        # Don't load model
        
        health_status = await model.health_check()
        
        assert health_status["status"] == "unhealthy"
        assert health_status["model_loaded"] is False
        assert "error" in health_status


class TestBLIPModelConcurrency:
    """Test concurrent access to BLIP model."""
    
    @pytest.fixture
    def mock_concurrent_model(self):
        """Mock model for concurrency testing."""
        with patch('transformers.BlipProcessor') as mock_processor, \
             patch('transformers.BlipForConditionalGeneration') as mock_model:
            
            # Setup model with artificial delay
            mock_processor_instance = Mock()
            mock_processor_instance.tokenizer = Mock()
            mock_processor_instance.tokenizer.decode = Mock(return_value="test caption")
            mock_processor.from_pretrained.return_value = mock_processor_instance
            
            mock_model_instance = Mock()
            
            async def mock_generate(*args, **kwargs):
                await asyncio.sleep(0.1)  # Simulate processing time
                return [[1, 2, 3, 4, 5]]
            
            mock_model_instance.generate = Mock(side_effect=mock_generate)
            mock_model.from_pretrained.return_value = mock_model_instance
            
            yield {
                'processor': mock_processor,
                'model': mock_model,
                'processor_instance': mock_processor_instance,
                'model_instance': mock_model_instance
            }
    
    @pytest.fixture
    def sample_image_bytes(self):
        """Create sample image bytes for testing."""
        image = Image.new('RGB', (224, 224), color='blue')
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG')
        return buffer.getvalue()
    
    @pytest.mark.asyncio
    async def test_concurrent_image_analysis(self, mock_concurrent_model, sample_image_bytes):
        """Test concurrent image analysis requests."""
        # Reset singleton
        BLIPModel._instance = None
        
        model = BLIPModel()
        await model._load_model()
        
        # Mock PIL Image operations
        with patch('PIL.Image.open') as mock_image_open:
            mock_image = Mock()
            mock_image.size = (224, 224)
            mock_image.mode = 'RGB'
            mock_image_open.return_value = mock_image
            
            # Create multiple concurrent requests
            tasks = [
                model.analyze_image(sample_image_bytes, filename=f"test_{i}.jpg")
                for i in range(3)
            ]
            
            # Execute concurrently
            results = await asyncio.gather(*tasks)
            
            # All should succeed
            assert len(results) == 3
            for tags, processing_time, image_size in results:
                assert len(tags) > 0
                assert isinstance(processing_time, float)
                assert image_size == (224, 224)


# Pytest configuration for async testing
@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])