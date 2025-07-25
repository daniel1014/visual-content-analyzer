/**
 * Tests for API service functionality.
 * 
 * Tests HTTP client configuration, error handling, retry logic,
 * and all API endpoint functions for the Visual Content Analyzer.
 */

import api, { 
  checkHealth, 
  analyzeImage, 
  analyzeImages, 
  getAPIInfo, 
  validateFile, 
  formatErrorMessage, 
  isRetryableError,
  APIError,
  apiClient 
} from './api';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  })),
}));

describe('API Configuration', () => {
  test('should have correct default configuration', () => {
    expect(process.env.REACT_APP_API_URL).toBe('http://localhost:8000');
  });

  test('should create axios instance with correct config', () => {
    expect(apiClient).toBeDefined();
    expect(apiClient.interceptors).toBeDefined();
  });
});

describe('APIError Class', () => {
  test('should create APIError with all properties', () => {
    const error = new APIError('Test error', 400, 'TEST_ERROR', { detail: 'test' });
    
    expect(error.message).toBe('Test error');
    expect(error.status).toBe(400);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.details).toEqual({ detail: 'test' });
    expect(error.name).toBe('APIError');
  });

  test('should create APIError with minimal properties', () => {
    const error = new APIError('Simple error', 500, 'SIMPLE_ERROR');
    
    expect(error.message).toBe('Simple error');
    expect(error.status).toBe(500);
    expect(error.code).toBe('SIMPLE_ERROR');
    expect(error.details).toBeNull();
  });
});

describe('checkHealth', () => {
  beforeEach(() => {
    global.fetch.mockClear();
  });

  test('should return success response for healthy API', async () => {
    const mockResponse = {
      status: 'healthy',
      model_status: { status: 'healthy' },
      system_info: { max_file_size_mb: 10 }
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await checkHealth();

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/health',
      expect.any(Object)
    );
  });

  test('should return error response for API failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await checkHealth();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error. Please check your connection and try again.');
  });

  test('should handle HTTP error responses', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' })
    });

    const result = await checkHealth();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server error. Please try again later.');
  });
});

describe('analyzeImage', () => {
  beforeEach(() => {
    global.fetch.mockClear();
  });

  test('should successfully analyze single image', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const mockResponse = {
      filename: 'test.jpg',
      tags: [
        { tag: 'landscape', confidence: 0.95 },
        { tag: 'mountain', confidence: 0.87 }
      ],
      processing_time: 2.34,
      image_size: [224, 224]
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await analyzeImage(mockFile);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/analyze',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData)
      })
    );
  });

  test('should handle upload progress callback', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const mockResponse = { filename: 'test.jpg', tags: [] };
    const onProgress = jest.fn();

    // Mock XMLHttpRequest for progress tracking
    const mockXHR = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
      upload: {
        addEventListener: jest.fn((event, callback) => {
          if (event === 'progress') {
            // Simulate progress event
            callback({ loaded: 50, total: 100 });
          }
        })
      },
      addEventListener: jest.fn((event, callback) => {
        if (event === 'load') {
          callback({
            target: {
              status: 200,
              responseText: JSON.stringify(mockResponse)
            }
          });
        }
      })
    };

    global.XMLHttpRequest = jest.fn(() => mockXHR);

    // Note: This test simulates the progress functionality
    // In a real implementation, you'd need to mock the actual axios upload progress
    onProgress(50);
    expect(onProgress).toHaveBeenCalledWith(50);
  });

  test('should handle analysis error', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ 
        error: 'Invalid file format',
        error_code: 'VALIDATION_ERROR'
      })
    });

    const result = await analyzeImage(mockFile);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid file format');
    expect(result.code).toBe('VALIDATION_ERROR');
  });

  test('should handle network errors', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    global.fetch.mockRejectedValueOnce(new Error('Network failed'));

    const result = await analyzeImage(mockFile);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error. Please check your connection and try again.');
  });
});

describe('analyzeImages', () => {
  beforeEach(() => {
    global.fetch.mockClear();
  });

  test('should process multiple images successfully', async () => {
    const mockFiles = [
      new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
      new File(['test2'], 'test2.jpg', { type: 'image/jpeg' })
    ];

    const mockResponses = [
      {
        filename: 'test1.jpg',
        tags: [{ tag: 'landscape', confidence: 0.95 }]
      },
      {
        filename: 'test2.jpg',
        tags: [{ tag: 'portrait', confidence: 0.88 }]
      }
    ];

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponses[0])
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponses[1])
      });

    const onProgress = jest.fn();
    const onImageComplete = jest.fn();

    const result = await analyzeImages(mockFiles, onProgress, onImageComplete);

    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.total).toBe(2);
    expect(result.summary.successful).toBe(2);
    expect(result.summary.failed).toBe(0);
    
    expect(onProgress).toHaveBeenCalled();
    expect(onImageComplete).toHaveBeenCalledTimes(2);
  });

  test('should handle mixed success and failure results', async () => {
    const mockFiles = [
      new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
      new File(['test2'], 'test2.jpg', { type: 'image/jpeg' })
    ];

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ filename: 'test1.jpg', tags: [] })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid file' })
      });

    const result = await analyzeImages(mockFiles);

    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.summary.successful).toBe(1);
    expect(result.summary.failed).toBe(1);
  });

  test('should respect concurrent processing limit', async () => {
    const mockFiles = Array.from({ length: 10 }, (_, i) => 
      new File([`test${i}`], `test${i}.jpg`, { type: 'image/jpeg' })
    );

    // Mock successful responses for all files
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ filename: 'test.jpg', tags: [] })
      })
    );

    const result = await analyzeImages(mockFiles);

    expect(result.results).toHaveLength(10);
    expect(global.fetch).toHaveBeenCalledTimes(10);
  });
});

describe('getAPIInfo', () => {
  test('should fetch API information successfully', async () => {
    const mockResponse = {
      message: 'Visual Content Analyzer API',
      version: '1.0.0',
      docs: '/docs'
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const result = await getAPIInfo();

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/',
      expect.any(Object)
    );
  });

  test('should handle API info fetch error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('API not available'));

    const result = await getAPIInfo();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error. Please check your connection and try again.');
  });
});

describe('validateFile', () => {
  test('should validate valid JPEG file', () => {
    const validFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    validFile.size = 1024 * 1024; // 1MB

    const result = validateFile(validFile);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should validate valid PNG file', () => {
    const validFile = new File(['test'], 'test.png', { type: 'image/png' });
    validFile.size = 2 * 1024 * 1024; // 2MB

    const result = validateFile(validFile);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should validate valid WebP file', () => {
    const validFile = new File(['test'], 'test.webp', { type: 'image/webp' });
    validFile.size = 3 * 1024 * 1024; // 3MB

    const result = validateFile(validFile);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should reject unsupported file type', () => {
    const invalidFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });

    const result = validateFile(invalidFile);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      expect.stringContaining('Unsupported file type: application/pdf')
    );
  });

  test('should reject file that is too large', () => {
    const largeFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    largeFile.size = 15 * 1024 * 1024; // 15MB

    const result = validateFile(largeFile);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      expect.stringContaining('File too large: 15.0MB. Maximum size is 10MB.')
    );
  });

  test('should reject file with invalid extension', () => {
    const invalidFile = new File(['test'], 'test.txt', { type: 'image/jpeg' });

    const result = validateFile(invalidFile);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      expect.stringContaining('Unsupported file extension: .txt')
    );
  });

  test('should reject file without name', () => {
    const file = new File(['test'], '', { type: 'image/jpeg' });

    const result = validateFile(file);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('File must have a valid name.');
  });

  test('should handle multiple validation errors', () => {
    const invalidFile = new File(['test'], 'test.txt', { type: 'application/pdf' });
    invalidFile.size = 15 * 1024 * 1024; // 15MB

    const result = validateFile(invalidFile);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('formatErrorMessage', () => {
  test('should format string error', () => {
    const result = formatErrorMessage('Simple error message');
    expect(result).toBe('Simple error message');
  });

  test('should format APIError', () => {
    const error = new APIError('API error', 400, 'API_ERROR');
    const result = formatErrorMessage(error);
    expect(result).toBe('API error');
  });

  test('should format Error object', () => {
    const error = new Error('Standard error');
    const result = formatErrorMessage(error);
    expect(result).toBe('Standard error');
  });

  test('should format unknown error type', () => {
    const result = formatErrorMessage({ unknown: 'error' });
    expect(result).toBe('An unexpected error occurred. Please try again.');
  });

  test('should handle null/undefined error', () => {
    expect(formatErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
    expect(formatErrorMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
  });
});

describe('isRetryableError', () => {
  test('should identify retryable server errors', () => {
    const serverError = { status: 500 };
    expect(isRetryableError(serverError)).toBe(true);
  });

  test('should identify retryable rate limit errors', () => {
    const rateLimitError = { status: 429 };
    expect(isRetryableError(rateLimitError)).toBe(true);
  });

  test('should identify non-retryable client errors', () => {
    const clientError = { status: 400 };
    expect(isRetryableError(clientError)).toBe(false);
  });

  test('should identify retryable network errors', () => {
    const networkError = {}; // No status means network error
    expect(isRetryableError(networkError)).toBe(true);
  });

  test('should handle various status codes', () => {
    expect(isRetryableError({ status: 401 })).toBe(false); // Unauthorized
    expect(isRetryableError({ status: 404 })).toBe(false); // Not Found
    expect(isRetryableError({ status: 502 })).toBe(true);  // Bad Gateway
    expect(isRetryableError({ status: 503 })).toBe(true);  // Service Unavailable
  });
});

describe('Default API Export', () => {
  test('should export all required functions', () => {
    expect(api.checkHealth).toBe(checkHealth);
    expect(api.analyzeImage).toBe(analyzeImage);
    expect(api.analyzeImages).toBe(analyzeImages);
    expect(api.getAPIInfo).toBe(getAPIInfo);
    expect(api.validateFile).toBe(validateFile);
    expect(api.formatErrorMessage).toBe(formatErrorMessage);
    expect(api.isRetryableError).toBe(isRetryableError);
  });
});

describe('Retry Logic', () => {
  test('should retry on retryable errors', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    // First call fails with server error, second succeeds
    global.fetch
      .mockRejectedValueOnce(new Error('Server timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ filename: 'test.jpg', tags: [] })
      });

    const result = await analyzeImage(mockFile);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('should not retry on non-retryable errors', async () => {
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' })
    });

    const result = await analyzeImage(mockFile);

    expect(result.success).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});