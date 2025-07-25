import axios from 'axios';

/**
 * API Client for Visual Content Analyzer Backend
 * 
 * Handles communication with FastAPI backend including file uploads,
 * error handling, retry logic, and request/response processing.
 */

// API Configuration
const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  timeout: 30000, // 30 seconds for image processing
  maxRetries: 3,
  retryDelay: 1000, // 1 second base delay
};

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging and authentication
apiClient.interceptors.request.use(
  (config) => {
    // Log requests in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    }
    
    // Add timestamp to requests
    config.metadata = { startTime: new Date().getTime() };
    
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
apiClient.interceptors.response.use(
  (response) => {
    // Calculate request duration
    const duration = new Date().getTime() - response.config.metadata?.startTime;
    
    // Log responses in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`API Response: ${response.status} ${response.config.url} (${duration}ms)`);
    }
    
    return response;
  },
  (error) => {
    // Calculate request duration
    const duration = error.config?.metadata?.startTime 
      ? new Date().getTime() - error.config.metadata.startTime 
      : 0;
    
    // Log errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error(`API Error: ${error.response?.status || 'Network'} ${error.config?.url} (${duration}ms)`, error);
    }
    
    return Promise.reject(error);
  }
);

/**
 * Custom error class for API errors
 */
class APIError extends Error {
  constructor(message, status, code, details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper for API calls
 */
const withRetry = async (fn, maxRetries = API_CONFIG.maxRetries, baseDelay = API_CONFIG.retryDelay) => {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`API call failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(delay);
    }
  }
  
  throw lastError;
};

/**
 * Parse API error response
 */
const parseError = (error) => {
  // Network or timeout error
  if (!error.response) {
    return new APIError(
      'Network error. Please check your connection and try again.',
      0,
      'NETWORK_ERROR'
    );
  }
  
  const { status, data } = error.response;
  
  // Parse error response based on structure
  if (data?.error) {
    return new APIError(
      data.detail || data.error,
      status,
      data.error_code || 'API_ERROR',
      data
    );
  }
  
  if (data?.validation_errors) {
    const errorMessages = data.validation_errors.map(err => err.message).join(', ');
    return new APIError(
      `Validation error: ${errorMessages}`,
      status,
      'VALIDATION_ERROR',
      data.validation_errors
    );
  }
  
  // Generic error
  const errorMessage = status >= 500 
    ? 'Server error. Please try again later.'
    : data?.detail || `Request failed with status ${status}`;
    
  return new APIError(errorMessage, status, 'HTTP_ERROR');
};

/**
 * Health check endpoint
 */
export const checkHealth = async () => {
  try {
    const response = await withRetry(() => apiClient.get('/health'));
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    const apiError = parseError(error);
    return {
      success: false,
      error: apiError.message,
      details: apiError.details,
    };
  }
};

/**
 * Analyze single image
 */
export const analyzeImage = async (file, onProgress = null) => {
  try {
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);
    
    // Configure request with progress tracking
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000, // 60 seconds for image processing
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    };
    
    const response = await withRetry(() => 
      apiClient.post('/analyze', formData, config)
    );
    
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    const apiError = parseError(error);
    return {
      success: false,
      error: apiError.message,
      code: apiError.code,
      details: apiError.details,
    };
  }
};

/**
 * Analyze multiple images with concurrent processing
 */
export const analyzeImages = async (files, onProgress = null, onImageComplete = null) => {
  const results = [];
  const errors = [];
  let completed = 0;
  
  // Process images with limited concurrency to avoid overwhelming the server
  const CONCURRENT_LIMIT = 3;
  const chunks = [];
  
  for (let i = 0; i < files.length; i += CONCURRENT_LIMIT) {
    chunks.push(files.slice(i, i + CONCURRENT_LIMIT));
  }
  
  try {
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (file, index) => {
        try {
          const result = await analyzeImage(file, (progress) => {
            // Report individual file progress
            if (onProgress) {
              const overallProgress = ((completed + (progress / 100)) / files.length) * 100;
              onProgress(Math.round(overallProgress));
            }
          });
          
          completed++;
          
          if (result.success) {
            const imageResult = {
              file,
              result: result.data,
              success: true,
            };
            results.push(imageResult);
            
            // Notify parent of completed image
            if (onImageComplete) {
              onImageComplete(imageResult);
            }
          } else {
            const error = {
              file,
              error: result.error,
              code: result.code,
              success: false,
            };
            errors.push(error);
            
            // Notify parent of error
            if (onImageComplete) {
              onImageComplete(error);
            }
          }
          
          // Update overall progress
          if (onProgress) {
            const overallProgress = (completed / files.length) * 100;
            onProgress(Math.round(overallProgress));
          }
          
          return result;
        } catch (error) {
          completed++;
          const fileError = {
            file,
            error: 'Unexpected error during processing',
            success: false,
          };
          errors.push(fileError);
          
          if (onImageComplete) {
            onImageComplete(fileError);
          }
          
          return fileError;
        }
      });
      
      // Wait for current chunk to complete before starting next
      await Promise.all(chunkPromises);
    }
    
    return {
      success: errors.length === 0,
      results,
      errors,
      summary: {
        total: files.length,
        successful: results.length,
        failed: errors.length,
      },
    };
  } catch (error) {
    const apiError = parseError(error);
    return {
      success: false,
      error: apiError.message,
      results,
      errors,
    };
  }
};

/**
 * Get API configuration info
 */
export const getAPIInfo = async () => {
  try {
    const response = await withRetry(() => apiClient.get('/'));
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    const apiError = parseError(error);
    return {
      success: false,
      error: apiError.message,
    };
  }
};

/**
 * Validate file before upload (client-side checks)
 */
export const validateFile = (file) => {
  const errors = [];
  
  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type.toLowerCase())) {
    errors.push(`Unsupported file type: ${file.type}. Use JPEG, PNG, or WebP.`);
  }
  
  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    errors.push(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 10MB.`);
  }
  
  // Check file name
  if (!file.name || file.name.trim() === '') {
    errors.push('File must have a valid name.');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Format error message for display
 */
export const formatErrorMessage = (error) => {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof APIError) {
    return error.message;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return 'An unexpected error occurred. Please try again.';
};

/**
 * Check if error is retryable
 */
export const isRetryableError = (error) => {
  if (!error.status) return true; // Network errors are retryable
  
  // Server errors and rate limits are retryable
  return error.status >= 500 || error.status === 429;
};

// Export API client for advanced usage
export { apiClient, APIError };

// Default export
const api = {
  checkHealth,
  analyzeImage,
  analyzeImages,
  getAPIInfo,
  validateFile,
  formatErrorMessage,
  isRetryableError,
};

export default api;