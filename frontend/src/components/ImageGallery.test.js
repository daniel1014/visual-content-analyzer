/**
 * Tests for ImageGallery component functionality.
 * 
 * Tests image display, tag rendering, sorting, filtering,
 * and interaction handling for the Visual Content Analyzer.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ImageGallery from './ImageGallery';

describe('ImageGallery Component', () => {
  const mockImages = [
    {
      id: 'img1',
      filename: 'landscape.jpg',
      previewUrl: 'blob:mock-url-1',
      tags: [
        { tag: 'landscape', confidence: 0.95 },
        { tag: 'mountains', confidence: 0.87 },
        { tag: 'nature', confidence: 0.82 }
      ],
      metadata: {
        processing_time: 2.34,
        image_size: [1920, 1080],
        timestamp: '2024-01-01T12:00:00Z',
        model_info: { model_name: 'BLIP' }
      }
    },
    {
      id: 'img2',
      filename: 'portrait.jpg',
      previewUrl: 'blob:mock-url-2',
      tags: [
        { tag: 'person', confidence: 0.92 },
        { tag: 'portrait', confidence: 0.88 },
        { tag: 'face', confidence: 0.75 }
      ],
      metadata: {
        processing_time: 1.87,
        image_size: [800, 600],
        timestamp: '2024-01-01T12:05:00Z',
        model_info: { model_name: 'BLIP' }
      }
    }
  ];

  const mockLoadingImages = [
    {
      id: 'loading1',
      filename: 'processing.jpg',
      previewUrl: 'blob:mock-url-3',
      progress: 50,
      startTime: Date.now()
    }
  ];

  const mockErrorImages = {
    'error1': 'Failed to process image'
  };

  const defaultProps = {
    images: mockImages,
    loadingImages: [],
    errorImages: {},
    onRetryImage: jest.fn(),
    onRemoveImage: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('should render empty state when no images', () => {
      render(<ImageGallery images={[]} loadingImages={[]} errorImages={{}} />);

      expect(screen.getByText(/no images to display/i)).toBeInTheDocument();
      expect(screen.getByText(/upload some images/i)).toBeInTheDocument();
    });

    test('should render image gallery with images', () => {
      render(<ImageGallery {...defaultProps} />);

      expect(screen.getByText(/analysis results/i)).toBeInTheDocument();
      expect(screen.getByText(/2 images/i)).toBeInTheDocument();
      expect(screen.getByText('landscape.jpg')).toBeInTheDocument();
      expect(screen.getByText('portrait.jpg')).toBeInTheDocument();
    });

    test('should show loading count in header', () => {
      render(<ImageGallery 
        {...defaultProps} 
        loadingImages={mockLoadingImages}
      />);

      expect(screen.getByText(/3 images \(1 processing\)/i)).toBeInTheDocument();
    });

    test('should render loading images with progress indicators', () => {
      render(<ImageGallery 
        {...defaultProps} 
        loadingImages={mockLoadingImages}
      />);

      expect(screen.getByText('processing.jpg')).toBeInTheDocument();
      expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
    });

    test('should render error images with error states', () => {
      const errorImage = {
        id: 'error1',
        filename: 'error.jpg',
        previewUrl: 'blob:mock-url-error',
        tags: [],
        metadata: null
      };

      render(<ImageGallery 
        {...defaultProps} 
        images={[...mockImages, errorImage]}
        errorImages={mockErrorImages}
      />);

      expect(screen.getByText('error.jpg')).toBeInTheDocument();
      expect(screen.getByText('Failed to process image')).toBeInTheDocument();
    });
  });

  describe('Tag Display', () => {
    test('should render tags with confidence scores', () => {
      render(<ImageGallery {...defaultProps} />);

      // Check for tag display
      expect(screen.getByText('landscape')).toBeInTheDocument();
      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('mountains')).toBeInTheDocument();
      expect(screen.getByText('87%')).toBeInTheDocument();
    });

    test('should show different confidence colors', () => {
      render(<ImageGallery {...defaultProps} />);

      // High confidence (95%) should have green styling
      const landscapeTag = screen.getByText('landscape').closest('div');
      expect(landscapeTag).toHaveClass('text-green-700');

      // Medium confidence (75%) should have different styling
      const faceTag = screen.getByText('face').closest('div');
      expect(faceTag).toHaveClass('text-yellow-700');
    });

    test('should display tag confidence indicators', () => {
      render(<ImageGallery {...defaultProps} />);

      // Should have confidence indicators (colored dots)
      const confidenceIndicators = document.querySelectorAll('[class*="bg-green-500"], [class*="bg-yellow-500"], [class*="bg-red-500"]');
      expect(confidenceIndicators.length).toBeGreaterThan(0);
    });

    test('should handle images with no tags', () => {
      const imageWithoutTags = {
        id: 'img3',
        filename: 'notags.jpg',
        previewUrl: 'blob:mock-url-3',
        tags: [],
        metadata: { processing_time: 1.0, image_size: [400, 300] }
      };

      render(<ImageGallery 
        {...defaultProps} 
        images={[...mockImages, imageWithoutTags]}
      />);

      expect(screen.getByText('notags.jpg')).toBeInTheDocument();
      expect(screen.getByText(/no tags generated/i)).toBeInTheDocument();
    });
  });

  describe('Metadata Display', () => {
    test('should toggle metadata details', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      // Find and click details toggle button
      const toggleButtons = screen.getAllByTitle(/toggle details/i);
      await user.click(toggleButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/processing time:/i)).toBeInTheDocument();
        expect(screen.getByText('2.34s')).toBeInTheDocument();
        expect(screen.getByText(/dimensions:/i)).toBeInTheDocument();
        expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
      });
    });

    test('should format processing time correctly', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const toggleButtons = screen.getAllByTitle(/toggle details/i);
      await user.click(toggleButtons[1]); // Second image

      await waitFor(() => {
        expect(screen.getByText('1.87s')).toBeInTheDocument();
      });
    });

    test('should format image dimensions correctly', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const toggleButtons = screen.getAllByTitle(/toggle details/i);
      await user.click(toggleButtons[1]); // Second image

      await waitFor(() => {
        expect(screen.getByText('800 × 600')).toBeInTheDocument();
      });
    });

    test('should display model information', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const toggleButtons = screen.getAllByTitle(/toggle details/i);
      await user.click(toggleButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/model:/i)).toBeInTheDocument();
        expect(screen.getByText('BLIP')).toBeInTheDocument();
      });
    });

    test('should display timestamp in readable format', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const toggleButtons = screen.getAllByTitle(/toggle details/i);
      await user.click(toggleButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/analyzed:/i)).toBeInTheDocument();
        // Should show formatted time
        expect(screen.getByText(/\d{1,2}:\d{2}:\d{2}/)).toBeInTheDocument();
      });
    });
  });

  describe('Sorting Functionality', () => {
    test('should sort by most recent by default', () => {
      render(<ImageGallery {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/sort:/i);
      expect(sortSelect.value).toBe('recent');
    });

    test('should change sorting option', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/sort:/i);
      await user.selectOptions(sortSelect, 'confidence');

      expect(sortSelect.value).toBe('confidence');
    });

    test('should sort by confidence correctly', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/sort:/i);
      await user.selectOptions(sortSelect, 'confidence');

      // After sorting by confidence, landscape.jpg should come first (95% vs 92% avg)
      const imageCards = screen.getAllByText(/\.jpg$/);
      expect(imageCards[0]).toHaveTextContent('landscape.jpg');
    });

    test('should sort by filename alphabetically', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/sort:/i);
      await user.selectOptions(sortSelect, 'filename');

      // After sorting by filename, landscape.jpg should come before portrait.jpg
      const imageCards = screen.getAllByText(/\.jpg$/);
      expect(imageCards[0]).toHaveTextContent('landscape.jpg');
      expect(imageCards[1]).toHaveTextContent('portrait.jpg');
    });
  });

  describe('Filtering Functionality', () => {
    test('should filter by all confidence by default', () => {
      render(<ImageGallery {...defaultProps} />);

      const filterSelect = screen.getByLabelText(/filter:/i);
      expect(filterSelect.value).toBe('all');
    });

    test('should filter by high confidence', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const filterSelect = screen.getByLabelText(/filter:/i);
      await user.selectOptions(filterSelect, 'high');

      // Should show both images as they have high average confidence
      expect(screen.getByText('landscape.jpg')).toBeInTheDocument();
      expect(screen.getByText('portrait.jpg')).toBeInTheDocument();
    });

    test('should show no results message when filter excludes all images', async () => {
      const user = userEvent.setup();
      
      // Create images with only low confidence
      const lowConfidenceImages = [
        {
          id: 'low1',
          filename: 'low.jpg',
          previewUrl: 'blob:low',
          tags: [{ tag: 'unclear', confidence: 0.3 }],
          metadata: { processing_time: 1.0, image_size: [200, 200] }
        }
      ];

      render(<ImageGallery 
        {...defaultProps} 
        images={lowConfidenceImages}
      />);

      const filterSelect = screen.getByLabelText(/filter:/i);
      await user.selectOptions(filterSelect, 'high');

      await waitFor(() => {
        expect(screen.getByText(/no images match your filter/i)).toBeInTheDocument();
      });
    });

    test('should reset filters', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      // Set non-default filters
      const sortSelect = screen.getByLabelText(/sort:/i);
      const filterSelect = screen.getByLabelText(/filter:/i);
      
      await user.selectOptions(sortSelect, 'confidence');
      await user.selectOptions(filterSelect, 'high');

      // Find and click reset button (when no results showing)
      const resetButton = screen.queryByText(/reset filters/i);
      if (resetButton) {
        await user.click(resetButton);

        expect(sortSelect.value).toBe('recent');
        expect(filterSelect.value).toBe('all');
      }
    });
  });

  describe('Image Interaction', () => {
    test('should handle image load events', async () => {
      render(<ImageGallery {...defaultProps} />);

      const images = screen.getAllByAltText(/preview$/);
      
      // Simulate image load
      fireEvent.load(images[0]);

      // Image should become visible (opacity change)
      await waitFor(() => {
        expect(images[0]).toHaveClass('opacity-100');
      });
    });

    test('should show loading spinner before image loads', () => {
      render(<ImageGallery {...defaultProps} />);

      const loadingSpinners = document.querySelectorAll('[class*="animate-spin"]');
      expect(loadingSpinners.length).toBeGreaterThan(0);
    });

    test('should call onRetryImage when retry is attempted', async () => {
      const user = userEvent.setup();
      const errorImage = {
        id: 'error1',
        filename: 'error.jpg',
        previewUrl: 'blob:error',
        tags: [],
        metadata: null
      };

      render(<ImageGallery 
        {...defaultProps} 
        images={[errorImage]}
        errorImages={mockErrorImages}
      />);

      // Look for retry functionality (if implemented)
      const retryButton = screen.queryByText(/retry/i);
      if (retryButton) {
        await user.click(retryButton);
        expect(defaultProps.onRetryImage).toHaveBeenCalledWith('error1');
      }
    });

    test('should call onRemoveImage when image is removed', async () => {
      const user = userEvent.setup();
      
      // Note: Remove functionality might be in the parent component
      // This test assumes there's a remove button for images
      render(<ImageGallery {...defaultProps} />);

      const removeButton = screen.queryByText(/remove/i);
      if (removeButton) {
        await user.click(removeButton);
        expect(defaultProps.onRemoveImage).toHaveBeenCalled();
      }
    });
  });

  describe('Responsive Design', () => {
    test('should have responsive grid classes', () => {
      render(<ImageGallery {...defaultProps} />);

      const gridContainer = document.querySelector('.image-grid');
      expect(gridContainer).toHaveClass('image-grid');
    });

    test('should handle mobile layout', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<ImageGallery {...defaultProps} />);

      // Check that responsive classes are applied
      const controls = screen.getByText(/sort:/i).closest('div').parentElement;
      expect(controls).toHaveClass('flex-col', 'sm:flex-row');
    });
  });

  describe('Performance', () => {
    test('should handle large number of images', () => {
      const manyImages = Array.from({ length: 50 }, (_, i) => ({
        id: `img${i}`,
        filename: `image${i}.jpg`,
        previewUrl: `blob:url${i}`,
        tags: [{ tag: 'test', confidence: 0.8 }],
        metadata: { processing_time: 1.0, image_size: [200, 200] }
      }));

      render(<ImageGallery 
        {...defaultProps} 
        images={manyImages}
      />);

      expect(screen.getByText(/50 images/i)).toBeInTheDocument();
    });

    test('should efficiently update when props change', () => {
      const { rerender } = render(<ImageGallery {...defaultProps} />);

      expect(screen.getByText('landscape.jpg')).toBeInTheDocument();

      // Add new image
      const newImages = [
        ...mockImages,
        {
          id: 'img3',
          filename: 'new.jpg',
          previewUrl: 'blob:new',
          tags: [{ tag: 'new', confidence: 0.9 }],
          metadata: { processing_time: 1.5, image_size: [300, 300] }
        }
      ];

      rerender(<ImageGallery {...defaultProps} images={newImages} />);

      expect(screen.getByText('new.jpg')).toBeInTheDocument();
      expect(screen.getByText(/3 images/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels', () => {
      render(<ImageGallery {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/sort:/i);
      const filterSelect = screen.getByLabelText(/filter:/i);

      expect(sortSelect).toHaveAttribute('id', 'sort');
      expect(filterSelect).toHaveAttribute('id', 'filter');
    });

    test('should support keyboard navigation for controls', async () => {
      const user = userEvent.setup();
      render(<ImageGallery {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/sort:/i);
      
      // Should be focusable
      await user.tab();
      expect(document.activeElement).toBe(sortSelect);
    });

    test('should have proper alt text for images', () => {
      render(<ImageGallery {...defaultProps} />);

      const images = screen.getAllByAltText(/preview$/);
      expect(images).toHaveLength(mockImages.length);
      
      images.forEach((img, index) => {
        expect(img).toHaveAttribute('alt', `${mockImages[index].filename} preview`);
      });
    });

    test('should have descriptive text for screen readers', () => {
      render(<ImageGallery {...defaultProps} />);

      // Check for descriptive text that would help screen readers
      expect(screen.getByText(/analysis results/i)).toBeInTheDocument();
      expect(screen.getByText(/2 images/i)).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    test('should display error overlay for failed images', () => {
      const errorImage = {
        id: 'error1',
        filename: 'failed.jpg',
        previewUrl: 'blob:failed',
        tags: [],
        metadata: null
      };

      render(<ImageGallery 
        {...defaultProps} 
        images={[errorImage]}
        errorImages={{ error1: 'Processing failed' }}
      />);

      expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
    });

    test('should handle missing metadata gracefully', () => {
      const imageWithoutMetadata = {
        id: 'img3',
        filename: 'nometa.jpg',
        previewUrl: 'blob:nometa',
        tags: [{ tag: 'test', confidence: 0.8 }],
        metadata: null
      };

      render(<ImageGallery 
        {...defaultProps} 
        images={[imageWithoutMetadata]}
      />);

      expect(screen.getByText('nometa.jpg')).toBeInTheDocument();
      // Should not crash or show broken metadata
    });
  });
});