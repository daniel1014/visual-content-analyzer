import React, { useState } from 'react';

/**
 * TagDisplay Component
 * 
 * Displays individual tag with confidence score and visual indicator
 */
const TagDisplay = ({ tag, confidence, isLoading = false }) => {
  const getConfidenceColor = (conf) => {
    if (conf >= 0.8) return 'text-green-700 bg-green-100 border-green-200';
    if (conf >= 0.6) return 'text-yellow-700 bg-yellow-100 border-yellow-200';
    return 'text-red-700 bg-red-100 border-red-200';
  };

  const getConfidenceLevel = (conf) => {
    if (conf >= 0.8) return 'High';
    if (conf >= 0.6) return 'Medium';
    return 'Low';
  };

  if (isLoading) {
    return (
      <div className="tag-badge animate-pulse bg-gray-200">
        <div className="h-4 w-16 bg-gray-300 rounded"></div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium border ${getConfidenceColor(confidence)}`}>
      <span className="whitespace-normal" title={tag}>
        {tag}
      </span>
      <div className="flex items-center space-x-1">
        <span className="text-xs font-bold">
          {Math.round(confidence * 100)}%
        </span>
        <div 
          className={`w-2 h-2 rounded-full ${confidence >= 0.8 ? 'bg-green-500' : confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
          title={`Confidence: ${getConfidenceLevel(confidence)}`}
        ></div>
      </div>
    </div>
  );
};

/**
 * ImageCard Component
 * 
 * Individual image card with preview, tags, and metadata
 */
const ImageCard = ({ image, isLoading = false, error = null, onRetryImage = null }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const formatProcessingTime = (time) => {
    if (time < 1) return `${Math.round(time * 1000)}ms`;
    return `${time.toFixed(2)}s`;
  };

  const formatImageSize = (size) => {
    if (!size || size.length !== 2) return 'Unknown';
    return `${size[0]} × ${size[1]}`;
  };

  return (
    <div className="card overflow-hidden hover:shadow-lg transition-shadow duration-300">
      {/* Image Preview */}
      <div className="relative bg-gray-100">
        <img
          src={image.previewUrl}
          alt={image.filename}
          className={`w-full h-48 object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
        />
        
        {/* Loading overlay */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        )}

        {/* Processing status overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <p className="text-sm font-medium">Analyzing...</p>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 bg-red-500 bg-opacity-75 flex items-center justify-center">
            <div className="text-center text-white p-4">
              <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs font-medium">Analysis Failed</p>
            </div>
          </div>
        )}

        {/* Details toggle button */}
        {image.tags && !isLoading && !error && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="absolute top-2 right-2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition-opacity duration-200"
            title="Toggle details"
          >
            <svg className={`w-4 h-4 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Filename */}
        <h3 className="text-sm font-medium text-gray-900 truncate mb-3" title={image.filename}>
          {image.filename}
        </h3>

        {/* Tags */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {isLoading ? (
              // Loading state - show skeleton tags
              Array.from({ length: 3 }).map((_, index) => (
                <TagDisplay key={index} isLoading={true} />
              ))
            ) : error ? (
              // Error state with retry option
              <div className="w-full flex flex-col items-center space-y-2">
                <div className="text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-full border border-red-200 flex items-center">
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onRetryImage) onRetryImage(image.id || image.filename);
                  }}
                  className="text-xs text-primary-600 hover:text-primary-800 font-medium flex items-center transition-colors"
                >
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry Analysis
                </button>
              </div>
            ) : image.tags && image.tags.length > 0 ? (
              // Success state - show actual tags with fade-in animation
              image.tags.map((tagData, index) => (
                <div 
                  key={index}
                  className="animate-fadeIn"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <TagDisplay
                    tag={tagData.tag}
                    confidence={tagData.confidence}
                  />
                </div>
              ))
            ) : (
              // No tags state
              <div className="text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200 flex items-center">
                <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                No tags generated
              </div>
            )}
          </div>
        </div>

        {/* Metadata (collapsible) */}
        {showDetails && image.metadata && (
          <div className="border-t pt-4 mt-4 space-y-2 text-xs text-gray-600">
            {image.metadata.processing_time && (
              <div className="flex justify-between">
                <span>Processing time:</span>
                <span className="font-medium">{formatProcessingTime(image.metadata.processing_time)}</span>
              </div>
            )}
            {image.metadata.image_size && (
              <div className="flex justify-between">
                <span>Dimensions:</span>
                <span className="font-medium">{formatImageSize(image.metadata.image_size)}</span>
              </div>
            )}
            {image.metadata.model_info?.model_name && (
              <div className="flex justify-between">
                <span>Model:</span>
                <span className="font-medium text-primary-600">BLIP</span>
              </div>
            )}
            {image.metadata.timestamp && (
              <div className="flex justify-between">
                <span>Analyzed:</span>
                <span className="font-medium">
                  {new Date(image.metadata.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * ImageGallery Component
 * 
 * Responsive grid layout displaying analyzed images with tags and metadata
 */
const ImageGallery = ({ 
  images = [], 
  loadingImages = [], 
  errorImages = {},
  onRetryImage = null,
  onRemoveImage = null 
}) => {
  const [sortBy, setSortBy] = useState('recent'); // recent, confidence, filename
  const [filterConfidence, setFilterConfidence] = useState('all'); // all, high, medium, low

  /**
   * Filter and sort images based on user preferences
   */
  const getFilteredAndSortedImages = () => {
    let filtered = [...images];

    // Apply confidence filter
    if (filterConfidence !== 'all') {
      filtered = filtered.filter(image => {
        if (!image.tags || image.tags.length === 0) return false;
        
        const avgConfidence = image.tags.reduce((sum, tag) => sum + tag.confidence, 0) / image.tags.length;
        
        switch (filterConfidence) {
          case 'high': return avgConfidence >= 0.8;
          case 'medium': return avgConfidence >= 0.6 && avgConfidence < 0.8;
          case 'low': return avgConfidence < 0.6;
          default: return true;
        }
      });
    }

    // Apply sorting
    switch (sortBy) {
      case 'confidence':
        filtered.sort((a, b) => {
          const aAvg = a.tags?.length > 0 ? a.tags.reduce((sum, tag) => sum + tag.confidence, 0) / a.tags.length : 0;
          const bAvg = b.tags?.length > 0 ? b.tags.reduce((sum, tag) => sum + tag.confidence, 0) / b.tags.length : 0;
          return bAvg - aAvg;
        });
        break;
      case 'filename':
        filtered.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case 'recent':
      default:
        filtered.sort((a, b) => new Date(b.metadata?.timestamp || 0) - new Date(a.metadata?.timestamp || 0));
        break;
    }

    return filtered;
  };

  const filteredImages = getFilteredAndSortedImages();
  const totalImages = images.length + loadingImages.length;
  const hasImages = totalImages > 0;

  if (!hasImages) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No images to display</h3>
        <p className="text-gray-500">Upload some images to see AI-generated tags and analysis.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Analysis Results
          </h2>
          <p className="text-sm text-gray-600">
            {totalImages} image{totalImages !== 1 ? 's' : ''} 
            {loadingImages.length > 0 && ` (${loadingImages.length} processing)`}
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Sort dropdown */}
          <div className="flex items-center space-x-2">
            <label htmlFor="sort" className="text-sm font-medium text-gray-700">Sort:</label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="recent">Most Recent</option>
              <option value="confidence">Highest Confidence</option>
              <option value="filename">Filename</option>
            </select>
          </div>

          {/* Filter dropdown */}
          <div className="flex items-center space-x-2">
            <label htmlFor="filter" className="text-sm font-medium text-gray-700">Filter:</label>
            <select
              id="filter"
              value={filterConfidence}
              onChange={(e) => setFilterConfidence(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Confidence</option>
              <option value="high">High (80%+)</option>
              <option value="medium">Medium (60-80%)</option>
              <option value="low">Low (&lt;60%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Image Grid */}
      <div className="image-grid">
        {/* Loading images */}
        {loadingImages.map((image, index) => (
          <ImageCard
            key={`loading-${index}`}
            image={image}
            isLoading={true}
          />
        ))}

        {/* Completed images */}
        {filteredImages.map((image, index) => (
          <ImageCard
            key={image.id || `image-${index}`}
            image={image}
            error={errorImages[image.id]}
          />
        ))}

        {/* Error images */}
        {Object.entries(errorImages).map(([imageId, error]) => {
          const image = images.find(img => img.id === imageId);
          if (!image) return null;
          
          return (
            <ImageCard
              key={`error-${imageId}`}
              image={image}
              error={error}
            />
          );
        })}
      </div>

      {/* Filter results message */}
      {images.length > 0 && filteredImages.length === 0 && (
        <div className="text-center py-12">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No images match your filter</h3>
          <p className="text-gray-500 mb-4">Try adjusting your confidence filter or sort options.</p>
          <button
            onClick={() => {
              setSortBy('recent');
              setFilterConfidence('all');
            }}
            className="btn-secondary"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;