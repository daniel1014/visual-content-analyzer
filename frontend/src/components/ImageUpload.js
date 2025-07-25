import React, { useState, useCallback } from 'react';
import { FileUploader } from 'react-drag-drop-files';

/**
 * ImageUpload Component
 * 
 * Handles drag-and-drop file uploads with image preview and validation.
 * Supports multiple image formats and provides user feedback for upload states.
 */
const ImageUpload = ({ onFilesSelected, isUploading = false, maxFiles = 10 }) => {
  const [dragActive, setDragActive] = useState(false);
  const [previewImages, setPreviewImages] = useState([]);
  const [errors, setErrors] = useState([]);

  // Supported file types - must match backend allowed_extensions
  const fileTypes = ['JPG', 'JPEG', 'PNG', 'WEBP'];
  const maxFileSize = 10; // 10MB

  /**
   * Handle successful file selection
   * Creates preview URLs and calls parent callback
   */
  const handleFileChange = useCallback((files) => {
    // Convert FileList to Array if needed
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    
    // Clear previous errors
    setErrors([]);
    
    // Validate file count
    if (fileArray.length > maxFiles) {
      setErrors([`Maximum ${maxFiles} files allowed. Selected ${fileArray.length} files.`]);
      return;
    }

    // Create preview URLs and validate files
    const validFiles = [];
    const newErrors = [];
    const previews = [];

    fileArray.forEach((file, index) => {
      // Validate file size
      if (file.size > maxFileSize * 1024 * 1024) {
        newErrors.push(`${file.name}: File too large (max ${maxFileSize}MB)`);
        return;
      }

      // Validate file type
      const fileExtension = file.name.split('.').pop()?.toUpperCase();
      if (!fileTypes.includes(fileExtension)) {
        newErrors.push(`${file.name}: Unsupported file type. Use JPG, PNG, or WebP.`);
        return;
      }

      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      previews.push({
        id: `${file.name}-${Date.now()}-${index}`,
        file,
        previewUrl,
        name: file.name,
        size: file.size
      });

      validFiles.push(file);
    });

    // Set errors if any
    if (newErrors.length > 0) {
      setErrors(newErrors);
    }

    // Update previews
    setPreviewImages(prev => {
      // Clean up old URLs to prevent memory leaks
      prev.forEach(preview => URL.revokeObjectURL(preview.previewUrl));
      return previews;
    });

    // Call parent callback with valid files
    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  }, [maxFiles, onFilesSelected]);

  /**
   * Handle file selection errors from react-drag-drop-files
   */
  const handleTypeError = useCallback((error) => {
    setErrors([`Invalid file type. Please use: ${fileTypes.join(', ')}`]);
  }, []);

  const handleSizeError = useCallback((error) => {
    setErrors([`File too large. Maximum size is ${maxFileSize}MB.`]);
  }, []);

  /**
   * Remove a specific image from preview
   */
  const removeImage = useCallback((imageId) => {
    setPreviewImages(prev => {
      const updated = prev.filter(img => img.id !== imageId);
      
      // Clean up URL for removed image
      const removedImage = prev.find(img => img.id === imageId);
      if (removedImage) {
        URL.revokeObjectURL(removedImage.previewUrl);
      }
      
      return updated;
    });

    // Clear errors when removing images
    setErrors([]);
  }, []);

  /**
   * Clear all selected images
   */
  const clearAll = useCallback(() => {
    // Clean up all preview URLs
    previewImages.forEach(preview => URL.revokeObjectURL(preview.previewUrl));
    setPreviewImages([]);
    setErrors([]);
  }, [previewImages]);

  /**
   * Format file size for display
   */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Upload Area */}
      <div className="mb-6">
        <FileUploader
          handleChange={handleFileChange}
          name="imageFiles"
          types={fileTypes}
          multiple={true}
          disabled={isUploading}
          maxSize={maxFileSize}
          onTypeError={handleTypeError}
          onSizeError={handleSizeError}
          onDrop={() => setDragActive(false)}
          onDraggingStateChange={setDragActive}
        >
          <div className={`upload-area ${dragActive ? 'upload-area-active' : ''} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex flex-col items-center justify-center py-12">
              {/* Upload Icon */}
              <svg 
                className={`w-12 h-12 mb-4 ${dragActive ? 'text-primary-500' : 'text-gray-400'}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                />
              </svg>

              {/* Upload Text */}
              <div className="text-center">
                <p className={`text-lg font-medium mb-2 ${dragActive ? 'text-primary-600' : 'text-gray-900'}`}>
                  {dragActive ? 'Drop images here' : 'Drag & drop images here'}
                </p>
                <p className="text-gray-500 mb-4">
                  or <span className="text-primary-600 font-medium">browse files</span>
                </p>
                <div className="text-sm text-gray-400 space-y-1">
                  <p>Supports: {fileTypes.join(', ')}</p>
                  <p>Max size: {maxFileSize}MB per file</p>
                  <p>Max files: {maxFiles}</p>
                </div>
              </div>

              {/* Loading State */}
              {isUploading && (
                <div className="mt-4 flex items-center text-primary-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 mr-2"></div>
                  <span className="text-sm font-medium">Processing images...</span>
                </div>
              )}
            </div>
          </div>
        </FileUploader>
      </div>

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="mb-6">
          <div className="error-message">
            <div className="flex">
              <svg className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="font-medium">Upload Error{errors.length > 1 ? 's' : ''}</h3>
                <ul className="mt-1 text-sm space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Previews */}
      {previewImages.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Selected Images ({previewImages.length})
            </h3>
            <button
              onClick={clearAll}
              disabled={isUploading}
              className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {previewImages.map((image) => (
              <div key={image.id} className="image-preview group">
                <div className="relative">
                  <img
                    src={image.previewUrl}
                    alt={`Preview of ${image.name}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  
                  {/* Remove Button Overlay */}
                  <div className="image-overlay">
                    <button
                      onClick={() => removeImage(image.id)}
                      disabled={isUploading}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 transition-colors duration-200 disabled:opacity-50"
                      title="Remove image"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Image Info */}
                <div className="mt-2 px-2">
                  <p className="text-sm font-medium text-gray-900 truncate" title={image.name}>
                    {image.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(image.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Instructions */}
      {previewImages.length === 0 && !isUploading && (
        <div className="text-center py-8">
          <div className="text-gray-500 space-y-2">
            <p className="text-lg font-medium">Ready to analyze your images?</p>
            <p className="text-sm">
              Upload up to {maxFiles} images to get AI-powered descriptive tags and insights.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;