import React, { useState, useEffect, useCallback } from 'react';
import ImageUpload from './components/ImageUpload';
import ImageGallery from './components/ImageGallery';
import api from './services/api';

/**
 * Main Application Component
 * 
 * Manages global state for the visual content analyzer application,
 * coordinates between upload, processing, and display components.
 */
function App() {
  // Application state
  const [images, setImages] = useState([]); // Processed images with results
  const [loadingImages, setLoadingImages] = useState([]); // Images being processed
  const [errorImages, setErrorImages] = useState({}); // Images with errors
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiHealth, setApiHealth] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [statistics, setStatistics] = useState({
    totalProcessed: 0,
    totalErrors: 0,
    averageProcessingTime: 0,
  });

  // Application settings
  const [settings, setSettings] = useState({
    maxConcurrentUploads: 3,
    showProcessingDetails: true,
    autoRetryErrors: false,
  });

  /**
   * Check API health on app startup
   */
  useEffect(() => {
    const checkAPIHealth = async () => {
      const health = await api.checkHealth();
      setApiHealth(health);
      
      if (!health.success) {
        setGlobalError(`Backend connection failed: ${health.error}`);
      }
    };

    checkAPIHealth();
  }, []);

  /**
   * Generate unique ID for images
   */
  const generateImageId = useCallback(() => {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  /**
   * Create image preview URL safely
   */
  const createImagePreview = useCallback((file) => {
    try {
      return URL.createObjectURL(file);
    } catch (error) {
      console.error('Failed to create image preview:', error);
      return null;
    }
  }, []);

  /**
   * Handle file selection from upload component
   */
  const handleFilesSelected = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    // Clear any global errors
    setGlobalError(null);
    setIsProcessing(true);

    // Validate files
    const validFiles = [];
    const invalidFiles = [];

    files.forEach(file => {
      const validation = api.validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        invalidFiles.push({
          file,
          errors: validation.errors,
        });
      }
    });

    // Handle validation errors
    if (invalidFiles.length > 0) {
      const errorMessage = invalidFiles
        .map(({ file, errors }) => `${file.name}: ${errors.join(', ')}`)
        .join('\n');
      setGlobalError(`File validation failed:\n${errorMessage}`);
      
      if (validFiles.length === 0) {
        setIsProcessing(false);
        return;
      }
    }

    // Create loading entries for valid files
    const loadingEntries = validFiles.map(file => ({
      id: generateImageId(),
      filename: file.name,
      previewUrl: createImagePreview(file),
      file,
      progress: 0,
      startTime: Date.now(),
    }));

    setLoadingImages(prev => [...prev, ...loadingEntries]);

    try {
      // Process images with progress tracking
      const result = await api.analyzeImages(
        validFiles,
        (overallProgress) => {
          // Update overall progress
          console.log(`Overall progress: ${overallProgress}%`);
        },
        (imageResult) => {
          // Handle individual image completion
          handleImageProcessingComplete(imageResult, loadingEntries);
        }
      );

      // Update statistics
      setStatistics(prev => ({
        totalProcessed: prev.totalProcessed + result.results.length,
        totalErrors: prev.totalErrors + result.errors.length,
        averageProcessingTime: calculateAverageProcessingTime(result.results),
      }));

    } catch (error) {
      console.error('Batch processing error:', error);
      setGlobalError(api.formatErrorMessage(error));
      
      // Remove all loading entries on batch failure
      setLoadingImages(prev => 
        prev.filter(loading => !loadingEntries.some(entry => entry.id === loading.id))
      );
    } finally {
      setIsProcessing(false);
    }
  }, [generateImageId, createImagePreview]);

  /**
   * Handle completion of individual image processing
   */
  const handleImageProcessingComplete = useCallback((result, loadingEntries) => {
    const loadingEntry = loadingEntries.find(entry => entry.file.name === result.file.name);
    
    if (!loadingEntry) {
      console.warn('Could not find loading entry for completed image:', result.file.name);
      return;
    }

    // Remove from loading
    setLoadingImages(prev => prev.filter(img => img.id !== loadingEntry.id));

    if (result.success) {
      // Add to successful images
      const processedImage = {
        id: loadingEntry.id,
        filename: result.file.name,
        previewUrl: loadingEntry.previewUrl,
        tags: result.result.tags,
        metadata: {
          processing_time: result.result.processing_time,
          image_size: result.result.image_size,
          timestamp: result.result.timestamp,
          model_info: result.result.model_info,
        },
      };
      
      setImages(prev => [processedImage, ...prev]);
      
      // Clear any existing errors for this image
      setErrorImages(prev => {
        const updated = { ...prev };
        delete updated[loadingEntry.id];
        return updated;
      });
    } else {
      // Add to error images
      setErrorImages(prev => ({
        ...prev,
        [loadingEntry.id]: result.error,
      }));
      
      // Still add to images list for display with error state
      const errorImage = {
        id: loadingEntry.id,
        filename: result.file.name,
        previewUrl: loadingEntry.previewUrl,
        tags: [],
        metadata: null,
      };
      
      setImages(prev => [errorImage, ...prev]);
    }
  }, []);

  /**
   * Calculate average processing time
   */
  const calculateAverageProcessingTime = useCallback((results) => {
    if (results.length === 0) return 0;
    
    const totalTime = results.reduce((sum, result) => {
      return sum + (result.result?.processing_time || 0);
    }, 0);
    
    return totalTime / results.length;
  }, []);

  /**
   * Handle retry for failed images
   */
  const handleRetryImage = useCallback(async (imageId) => {
    const image = images.find(img => img.id === imageId);
    if (!image) return;

    // Move back to loading state
    setLoadingImages(prev => [...prev, {
      id: image.id,
      filename: image.filename,
      previewUrl: image.previewUrl,
      file: image.file, // This might not be available, would need to store it
      progress: 0,
      startTime: Date.now(),
    }]);

    // Remove from error state
    setErrorImages(prev => {
      const updated = { ...prev };
      delete updated[imageId];
      return updated;
    });

    // Note: Full retry implementation would require storing original file
    console.log('Retry functionality would need file storage implementation');
  }, [images]);

  /**
   * Handle image removal
   */
  const handleRemoveImage = useCallback((imageId) => {
    // Clean up preview URL
    const image = images.find(img => img.id === imageId);
    if (image?.previewUrl) {
      URL.revokeObjectURL(image.previewUrl);
    }

    // Remove from all states
    setImages(prev => prev.filter(img => img.id !== imageId));
    setLoadingImages(prev => prev.filter(img => img.id !== imageId));
    setErrorImages(prev => {
      const updated = { ...prev };
      delete updated[imageId];
      return updated;
    });
  }, [images]);

  /**
   * Clear all images
   */
  const handleClearAll = useCallback(() => {
    // Clean up all preview URLs
    images.forEach(image => {
      if (image.previewUrl) {
        URL.revokeObjectURL(image.previewUrl);
      }
    });
    
    loadingImages.forEach(image => {
      if (image.previewUrl) {
        URL.revokeObjectURL(image.previewUrl);
      }
    });

    // Reset all states
    setImages([]);
    setLoadingImages([]);
    setErrorImages({});
    setGlobalError(null);
  }, [images, loadingImages]);

  /**
   * Dismiss global error
   */
  const dismissGlobalError = useCallback(() => {
    setGlobalError(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and title */}
            <div className="flex items-center">
              <svg className="w-8 h-8 text-primary-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Visual Content Analyzer</h1>
                <p className="text-sm text-gray-500">AI-powered image tagging with BLIP</p>
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center space-x-4">
              {/* API Health Status */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${apiHealth?.success ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-600">
                  {apiHealth?.success ? 'API Connected' : 'API Disconnected'}
                </span>
              </div>

              {/* Statistics */}
              {statistics.totalProcessed > 0 && (
                <div className="text-sm text-gray-600">
                  {statistics.totalProcessed} processed
                  {statistics.totalErrors > 0 && ` • ${statistics.totalErrors} errors`}
                </div>
              )}

              {/* Clear all button */}
              {(images.length > 0 || loadingImages.length > 0) && (
                <button
                  onClick={handleClearAll}
                  className="btn-secondary text-sm"
                  disabled={isProcessing}
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Global error banner */}
        {globalError && (
          <div className="mb-6">
            <div className="error-message flex items-start justify-between">
              <div className="flex">
                <svg className="w-5 h-5 text-red-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-medium">Error</h3>
                  <p className="mt-1 text-sm whitespace-pre-line">{globalError}</p>
                </div>
              </div>
              <button
                onClick={dismissGlobalError}
                className="text-red-500 hover:text-red-700 ml-4"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* API offline warning */}
        {apiHealth && !apiHealth.success && (
          <div className="mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex">
                <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="text-yellow-800 font-medium">Backend Not Available</h3>
                  <p className="text-yellow-700 text-sm mt-1">
                    Please ensure the FastAPI backend is running on {process.env.REACT_APP_API_URL || 'http://localhost:8000'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-8">
          {/* Upload Section */}
          <section>
            <ImageUpload
              onFilesSelected={handleFilesSelected}
              isUploading={isProcessing}
              maxFiles={10}
            />
          </section>

          {/* Results Section */}
          {(images.length > 0 || loadingImages.length > 0) && (
            <section>
              <ImageGallery
                images={images}
                loadingImages={loadingImages}
                errorImages={errorImages}
                onRetryImage={handleRetryImage}
                onRemoveImage={handleRemoveImage}
              />
            </section>
          )}

          {/* Footer with instructions */}
          {images.length === 0 && loadingImages.length === 0 && (
            <section className="text-center py-12">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Welcome to Visual Content Analyzer
                </h2>
                <p className="text-lg text-gray-600 mb-6">
                  Upload your images to get AI-powered descriptive tags and insights. 
                  Our BLIP model analyzes visual content to generate meaningful descriptions 
                  that help with content organization, accessibility, and search optimization.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                  <div className="p-4 bg-white rounded-lg shadow-sm border">
                    <div className="text-primary-600 mb-2">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Upload Images</h3>
                    <p className="text-sm text-gray-600">
                      Drag and drop or click to upload JPEG, PNG, or WebP images up to 10MB each.
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg shadow-sm border">
                    <div className="text-primary-600 mb-2">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">AI Analysis</h3>
                    <p className="text-sm text-gray-600">
                      Our BLIP model analyzes your images and generates descriptive tags with confidence scores.
                    </p>
                  </div>
                  <div className="p-4 bg-white rounded-lg shadow-sm border">
                    <div className="text-primary-600 mb-2">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Get Results</h3>
                    <p className="text-sm text-gray-600">
                      View generated tags with confidence scores, processing time, and detailed metadata.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-sm text-gray-500">
            <p>Visual Content Analyzer • Powered by BLIP (Bootstrapping Language-Image Pre-training)</p>
            <p className="mt-1">Built with React, FastAPI, and Transformers</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;