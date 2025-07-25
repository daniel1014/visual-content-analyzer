/**
 * Tests for ImageUpload component functionality.
 * 
 * Tests drag-and-drop file uploads, file validation, preview generation,
 * and user interaction handling for the Visual Content Analyzer.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ImageUpload from './ImageUpload';

// Mock react-dropzone for file upload testing
jest.mock('react-dropzone', () => ({
  useDropzone: jest.fn(),
}));

// Mock FileReader for file preview
const mockFileReader = {
  readAsDataURL: jest.fn(),
  result: 'data:image/jpeg;base64,mock-image-data',
  onload: null,
  onerror: null,
};

global.FileReader = jest.fn(() => mockFileReader);

describe('ImageUpload Component', () => {
  const defaultProps = {
    onFilesSelected: jest.fn(),
    isUploading: false,
    maxFiles: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL.mockReturnValue('blob:mock-url');
  });

  describe('Rendering', () => {
    test('should render upload area with correct initial state', () => {
      render(<ImageUpload {...defaultProps} />);

      expect(screen.getByText(/drag and drop images here/i)).toBeInTheDocument();
      expect(screen.getByText(/click to browse/i)).toBeInTheDocument();
      expect(screen.getByText(/supports jpeg, png, webp/i)).toBeInTheDocument();
      expect(screen.getByText(/max 10mb per file/i)).toBeInTheDocument();
    });

    test('should show uploading state when isUploading is true', () => {
      render(<ImageUpload {...defaultProps} isUploading={true} />);

      expect(screen.getByText(/uploading/i)).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    test('should display maxFiles limit correctly', () => {
      render(<ImageUpload {...defaultProps} maxFiles={5} />);

      expect(screen.getByText(/up to 5 files/i)).toBeInTheDocument();
    });
  });

  describe('File Selection', () => {
    test('should handle file selection through input', async () => {
      const user = userEvent.setup();
      render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const input = screen.getByRole('button');

      // Simulate file selection
      await user.click(input);
      
      // Mock file input change
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(defaultProps.onFilesSelected).toHaveBeenCalledWith([file]);
      });
    });

    test('should handle multiple file selection', async () => {
      render(<ImageUpload {...defaultProps} />);

      const files = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.png', { type: 'image/png' }),
      ];

      // Mock file input change with multiple files
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: files,
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(defaultProps.onFilesSelected).toHaveBeenCalledWith(files);
      });
    });

    test('should validate file types', async () => {
      render(<ImageUpload {...defaultProps} />);

      const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [invalidFile],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
      });

      expect(defaultProps.onFilesSelected).not.toHaveBeenCalled();
    });

    test('should validate file size limits', async () => {
      render(<ImageUpload {...defaultProps} />);

      const largeFile = new File(['x'.repeat(15 * 1024 * 1024)], 'large.jpg', { 
        type: 'image/jpeg' 
      });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [largeFile],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText(/file too large/i)).toBeInTheDocument();
      });

      expect(defaultProps.onFilesSelected).not.toHaveBeenCalled();
    });

    test('should enforce maxFiles limit', async () => {
      render(<ImageUpload {...defaultProps} maxFiles={2} />);

      const files = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
        new File(['test3'], 'test3.jpg', { type: 'image/jpeg' }),
      ];

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: files,
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText(/too many files/i)).toBeInTheDocument();
      });

      expect(defaultProps.onFilesSelected).not.toHaveBeenCalled();
    });
  });

  describe('File Previews', () => {
    test('should generate previews for selected files', async () => {
      render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);

        // Simulate FileReader onload
        setTimeout(() => {
          if (mockFileReader.onload) {
            mockFileReader.onload();
          }
        }, 0);
      }

      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
        expect(screen.getByAltText('test.jpg preview')).toBeInTheDocument();
      });
    });

    test('should handle preview generation errors', async () => {
      render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);

        // Simulate FileReader error
        setTimeout(() => {
          if (mockFileReader.onerror) {
            mockFileReader.onerror(new Error('Preview failed'));
          }
        }, 0);
      }

      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
        // Should show file without preview
        expect(screen.queryByAltText('test.jpg preview')).not.toBeInTheDocument();
      });
    });

    test('should remove individual files from preview', async () => {
      render(<ImageUpload {...defaultProps} />);

      const files = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
      ];

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: files,
          writable: false,
        });
        fireEvent.change(fileInput);

        // Simulate FileReader onload for both files
        setTimeout(() => {
          if (mockFileReader.onload) {
            mockFileReader.onload();
            mockFileReader.onload();
          }
        }, 0);
      }

      await waitFor(() => {
        expect(screen.getByText('test1.jpg')).toBeInTheDocument();
        expect(screen.getByText('test2.jpg')).toBeInTheDocument();
      });

      // Remove first file
      const removeButtons = screen.getAllByLabelText(/remove/i);
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText('test1.jpg')).not.toBeInTheDocument();
        expect(screen.getByText('test2.jpg')).toBeInTheDocument();
      });
    });

    test('should clear all files', async () => {
      render(<ImageUpload {...defaultProps} />);

      const files = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
      ];

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: files,
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText('test1.jpg')).toBeInTheDocument();
        expect(screen.getByText('test2.jpg')).toBeInTheDocument();
      });

      // Clear all files
      const clearButton = screen.getByText(/clear all/i);
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.queryByText('test1.jpg')).not.toBeInTheDocument();
        expect(screen.queryByText('test2.jpg')).not.toBeInTheDocument();
      });
    });
  });

  describe('Upload Process', () => {
    test('should call onFilesSelected with valid files', async () => {
      render(<ImageUpload {...defaultProps} />);

      const validFiles = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.png', { type: 'image/png' }),
      ];

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: validFiles,
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText('test1.jpg')).toBeInTheDocument();
        expect(screen.getByText('test2.png')).toBeInTheDocument();
      });

      // Click upload button
      const uploadButton = screen.getByText(/upload and analyze/i);
      fireEvent.click(uploadButton);

      expect(defaultProps.onFilesSelected).toHaveBeenCalledWith(validFiles);
    });

    test('should not upload when no files selected', () => {
      render(<ImageUpload {...defaultProps} />);

      const uploadButton = screen.getByText(/upload and analyze/i);
      fireEvent.click(uploadButton);

      expect(defaultProps.onFilesSelected).not.toHaveBeenCalled();
    });

    test('should disable upload during uploading state', () => {
      render(<ImageUpload {...defaultProps} isUploading={true} />);

      const uploadButton = screen.getByRole('button');
      expect(uploadButton).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    test('should display validation errors', async () => {
      render(<ImageUpload {...defaultProps} />);

      const invalidFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [invalidFile],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
        expect(screen.getByText(/use jpeg, png, or webp/i)).toBeInTheDocument();
      });
    });

    test('should dismiss validation errors', async () => {
      render(<ImageUpload {...defaultProps} />);

      const invalidFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [invalidFile],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
      });

      const dismissButton = screen.getByLabelText(/dismiss error/i);
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText(/unsupported file type/i)).not.toBeInTheDocument();
      });
    });

    test('should handle FileReader errors gracefully', async () => {
      render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      // Mock FileReader to throw error
      global.FileReader = jest.fn(() => ({
        readAsDataURL: jest.fn(() => {
          throw new Error('FileReader failed');
        }),
        result: null,
        onload: null,
        onerror: null,
      }));

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      // Should still show file even without preview
      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels and roles', () => {
      render(<ImageUpload {...defaultProps} />);

      expect(screen.getByRole('button')).toHaveAttribute('aria-label');
      expect(screen.getByRole('button')).toHaveAttribute('aria-describedby');
    });

    test('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<ImageUpload {...defaultProps} />);

      const uploadButton = screen.getByRole('button');
      
      // Focus the button
      await user.tab();
      expect(uploadButton).toHaveFocus();

      // Activate with Enter
      await user.keyboard('{Enter}');
      // Should trigger file dialog (mocked)
    });

    test('should have proper focus management for remove buttons', async () => {
      render(<ImageUpload {...defaultProps} />);

      const files = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
      ];

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: files,
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        const removeButtons = screen.getAllByLabelText(/remove/i);
        expect(removeButtons).toHaveLength(2);
        removeButtons.forEach(button => {
          expect(button).toHaveAttribute('aria-label');
        });
      });
    });
  });

  describe('Memory Management', () => {
    test('should clean up object URLs when files are removed', async () => {
      render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
      });

      // Remove file
      const removeButton = screen.getByLabelText(/remove/i);
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      });
    });

    test('should clean up object URLs when component unmounts', async () => {
      const { unmount } = render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText('test.jpg')).toBeInTheDocument();
      });

      unmount();

      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('File Format Support', () => {
    test.each([
      ['JPEG', 'test.jpg', 'image/jpeg'],
      ['PNG', 'test.png', 'image/png'],
      ['WebP', 'test.webp', 'image/webp'],
    ])('should accept %s files', async (format, filename, mimeType) => {
      render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], filename, { type: mimeType });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText(filename)).toBeInTheDocument();
        expect(screen.queryByText(/unsupported file type/i)).not.toBeInTheDocument();
      });
    });

    test.each([
      ['GIF', 'test.gif', 'image/gif'],
      ['BMP', 'test.bmp', 'image/bmp'],
      ['TIFF', 'test.tiff', 'image/tiff'],
    ])('should reject %s files', async (format, filename, mimeType) => {
      render(<ImageUpload {...defaultProps} />);

      const file = new File(['test'], filename, { type: mimeType });
      
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        Object.defineProperty(fileInput, 'files', {
          value: [file],
          writable: false,
        });
        fireEvent.change(fileInput);
      }

      await waitFor(() => {
        expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
      });
    });
  });
});