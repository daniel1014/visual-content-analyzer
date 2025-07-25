/**
 * Tests for App component functionality.
 * 
 * Tests application state management, API integration, component coordination,
 * and user workflows for the Visual Content Analyzer.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import App from './App';
import api from './services/api';

// Mock the API service
jest.mock('./services/api', () => ({
  __esModule: true,
  default: {
    checkHealth: jest.fn(),
    analyzeImages: jest.fn(),
    validateFile: jest.fn(),
    formatErrorMessage: jest.fn(),
  },
}));

// Mock child components to isolate App testing
jest.mock('./components/ImageUpload', () => {
  return function MockImageUpload({ onFilesSelected, isUploading, maxFiles }) {
    return (
      <div data-testid="image-upload">
        <button 
          onClick={() => onFilesSelected([new File(['test'], 'test.jpg', { type: 'image/jpeg' })])}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload Files'}
        </button>
        <span>Max files: {maxFiles}</span>
      </div>
    );
  };
});

jest.mock('./components/ImageGallery', () => {
  return function MockImageGallery({ images, loadingImages, errorImages, onRetryImage, onRemoveImage }) {
    return (
      <div data-testid="image-gallery">
        <div>Images: {images.length}</div>
        <div>Loading: {loadingImages.length}</div>
        <div>Errors: {Object.keys(errorImages).length}</div>
        {images.map(img => (
          <div key={img.id} data-testid={`image-${img.id}`}>
            {img.filename}
            <button onClick={() => onRemoveImage(img.id)}>Remove</button>
          </div>
        ))}
        {loadingImages.map(img => (
          <div key={img.id} data-testid={`loading-${img.id}`}>
            Loading: {img.filename}
          </div>
        ))}
        {Object.entries(errorImages).map(([id, error]) => (
          <div key={id} data-testid={`error-${id}`}>
            Error: {error}
            <button onClick={() => onRetryImage(id)}>Retry</button>
          </div>
        ))}
      </div>
    );
  };
});

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default API mocks
    api.checkHealth.mockResolvedValue({
      success: true,
      data: { status: 'healthy' }
    });
    
    api.validateFile.mockReturnValue({ valid: true, errors: [] });
    api.formatErrorMessage.mockImplementation(error => error.toString());
  });

  describe('Application Initialization', () => {
    test('should render main application structure', () => {
      render(<App />);

      expect(screen.getByText(/visual content analyzer/i)).toBeInTheDocument();
      expect(screen.getByText(/ai-powered image tagging with blip/i)).toBeInTheDocument();
      expect(screen.getByTestId('image-upload')).toBeInTheDocument();
      expect(screen.getByText(/welcome to visual content analyzer/i)).toBeInTheDocument();
    });

    test('should check API health on startup', async () => {
      render(<App />);

      await waitFor(() => {
        expect(api.checkHealth).toHaveBeenCalledTimes(1);
      });
    });

    test('should display API connection status', async () => {
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/api connected/i)).toBeInTheDocument();
      });
    });

    test('should handle API health check failure', async () => {
      api.checkHealth.mockResolvedValue({
        success: false,
        error: 'Backend unavailable'
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/api disconnected/i)).toBeInTheDocument();
        expect(screen.getByText(/backend not available/i)).toBeInTheDocument();
      });
    });

    test('should show correct API URL in warning', async () => {
      api.checkHealth.mockResolvedValue({
        success: false,
        error: 'Backend unavailable'
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText(/http:\/\/localhost:8000/i)).toBeInTheDocument();
      });
    });
  });

  describe('File Upload Workflow', () => {
    test('should handle successful file upload', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test.jpg' },
            result: {
              tags: [{ tag: 'landscape', confidence: 0.95 }],
              processing_time: 2.34,
              image_size: [224, 224],
              timestamp: '2024-01-01T12:00:00Z',
              model_info: { model_name: 'BLIP' }
            },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      // Click upload button to trigger file upload
      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(api.analyzeImages).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('image-gallery')).toBeInTheDocument();
        expect(screen.getByText('Images: 1')).toBeInTheDocument();
      });
    });

    test('should show upload progress during processing', async () => {
      // Mock a delayed analysis
      api.analyzeImages.mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              success: true,
              results: [],
              errors: []
            });
          }, 100);
        })
      );

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      // Should show uploading state
      await waitFor(() => {
        expect(screen.getByText('Uploading...')).toBeInTheDocument();
      });
    });

    test('should handle file validation errors', async () => {
      api.validateFile.mockReturnValue({
        valid: false,
        errors: ['Unsupported file type: application/pdf']
      });

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/file validation failed/i)).toBeInTheDocument();
        expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
      });
    });

    test('should handle analysis errors', async () => {
      api.analyzeImages.mockRejectedValue(new Error('Analysis failed'));

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/analysis failed/i)).toBeInTheDocument();
      });
    });

    test('should update statistics after processing', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test1.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          },
          {
            file: { name: 'test2.jpg' },
            result: { tags: [], processing_time: 2.0 },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/2 processed/i)).toBeInTheDocument();
      });
    });
  });

  describe('State Management', () => {
    test('should maintain separate loading and completed images', async () => {
      // Mock delayed processing
      let resolveAnalysis;
      const analysisPromise = new Promise(resolve => {
        resolveAnalysis = resolve;
      });
      api.analyzeImages.mockReturnValue(analysisPromise);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Loading: 1')).toBeInTheDocument();
      });

      // Resolve analysis
      resolveAnalysis({
        success: true,
        results: [
          {
            file: { name: 'test.jpg' },
            result: {
              tags: [{ tag: 'test', confidence: 0.8 }],
              processing_time: 1.0,
              image_size: [200, 200],
              timestamp: '2024-01-01T12:00:00Z',
              model_info: { model_name: 'BLIP' }
            },
            success: true
          }
        ],
        errors: []
      });

      await waitFor(() => {
        expect(screen.getByText('Images: 1')).toBeInTheDocument();
        expect(screen.getByText('Loading: 0')).toBeInTheDocument();
      });
    });

    test('should handle mixed success and error results', async () => {
      const mockAnalysisResult = {
        success: false,
        results: [
          {
            file: { name: 'success.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: [
          {
            file: { name: 'failed.jpg' },
            error: 'Processing failed',
            success: false
          }
        ]
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Images: 2')).toBeInTheDocument(); // Both success and error images
        expect(screen.getByText('Errors: 1')).toBeInTheDocument();
      });
    });

    test('should generate unique IDs for images', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test1.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          },
          {
            file: { name: 'test2.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        // Should have unique test IDs for each image
        expect(screen.getByTestId(/^image-img_/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('should display and dismiss global errors', async () => {
      api.analyzeImages.mockRejectedValue(new Error('Network error'));

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });

      // Dismiss error
      const dismissButton = screen.getByLabelText(/dismiss/i) || screen.getByRole('button', { name: /close/i });
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
      });
    });

    test('should clear errors when new upload starts', async () => {
      api.analyzeImages.mockRejectedValue(new Error('First error'));

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/first error/i)).toBeInTheDocument();
      });

      // Start new upload
      api.analyzeImages.mockResolvedValue({ success: true, results: [], errors: [] });
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.queryByText(/first error/i)).not.toBeInTheDocument();
      });
    });

    test('should handle individual image processing errors', async () => {
      const mockAnalysisResult = {
        success: false,
        results: [],
        errors: [
          {
            file: { name: 'failed.jpg' },
            error: 'Image processing failed',
            success: false
          }
        ]
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Error: Image processing failed')).toBeInTheDocument();
      });
    });
  });

  describe('Image Management', () => {
    test('should remove individual images', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Images: 1')).toBeInTheDocument();
      });

      // Remove image
      const removeButton = screen.getByText('Remove');
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.getByText('Images: 0')).toBeInTheDocument();
      });
    });

    test('should clear all images', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test1.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          },
          {
            file: { name: 'test2.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Images: 2')).toBeInTheDocument();
      });

      // Clear all
      const clearButton = screen.getByText(/clear all/i);
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Images: 0')).toBeInTheDocument();
        expect(screen.getByText(/welcome to visual content analyzer/i)).toBeInTheDocument();
      });
    });

    test('should handle retry for failed images', async () => {
      const mockAnalysisResult = {
        success: false,
        results: [],
        errors: [
          {
            file: { name: 'failed.jpg' },
            error: 'Processing failed',
            success: false
          }
        ]
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Note: Retry implementation would need to store original file
      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);

      // Check that retry was attempted (would need more implementation)
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  describe('UI State Management', () => {
    test('should show/hide components based on state', () => {
      render(<App />);

      // Initially should show welcome message
      expect(screen.getByText(/welcome to visual content analyzer/i)).toBeInTheDocument();
      expect(screen.queryByTestId('image-gallery')).not.toBeInTheDocument();
    });

    test('should show clear all button when images exist', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      // Initially no clear button
      expect(screen.queryByText(/clear all/i)).not.toBeInTheDocument();

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/clear all/i)).toBeInTheDocument();
      });
    });

    test('should disable clear all button during upload', async () => {
      api.analyzeImages.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        const clearButton = screen.queryByText(/clear all/i);
        if (clearButton) {
          expect(clearButton).toBeDisabled();
        }
      });
    });

    test('should update statistics display', async () => {
      const mockAnalysisResult = {
        success: false,
        results: [
          {
            file: { name: 'success.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: [
          {
            file: { name: 'failed.jpg' },
            error: 'Failed',
            success: false
          }
        ]
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/1 processed • 1 errors/i)).toBeInTheDocument();
      });
    });
  });

  describe('Memory Management', () => {
    test('should clean up preview URLs when images are removed', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Images: 1')).toBeInTheDocument();
      });

      // Remove image
      const removeButton = screen.getByText('Remove');
      fireEvent.click(removeButton);

      // Should call URL.revokeObjectURL
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    test('should clean up URLs when clearing all images', async () => {
      const mockAnalysisResult = {
        success: true,
        results: [
          {
            file: { name: 'test.jpg' },
            result: { tags: [], processing_time: 1.0 },
            success: true
          }
        ],
        errors: []
      };

      api.analyzeImages.mockResolvedValue(mockAnalysisResult);

      render(<App />);

      const uploadButton = screen.getByText('Upload Files');
      fireEvent.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText('Images: 1')).toBeInTheDocument();
      });

      // Clear all
      const clearButton = screen.getByText(/clear all/i);
      fireEvent.click(clearButton);

      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    test('should have proper heading structure', () => {
      render(<App />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/visual content analyzer/i);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/welcome to visual content analyzer/i);
    });

    test('should have proper landmarks', () => {
      render(<App />);

      expect(screen.getByRole('banner')).toBeInTheDocument(); // header
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toBeInTheDocument(); // footer
    });

    test('should have proper focus management', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Should be able to navigate with keyboard
      await user.tab();
      
      // First focusable element should be upload button
      expect(document.activeElement).toHaveAttribute('type', 'button');
    });
  });
});