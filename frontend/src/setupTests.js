/**
 * Test setup configuration for React Testing Library and Jest.
 * 
 * Configures testing utilities, mocks, and global test environment
 * for the Visual Content Analyzer frontend test suite.
 */

import '@testing-library/jest-dom';

// Mock environment variables
process.env.REACT_APP_API_URL = 'http://localhost:8000';

// Mock fetch globally for API tests
global.fetch = jest.fn();

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = jest.fn();

// Mock FileReader for file upload tests
global.FileReader = jest.fn(() => ({
  readAsDataURL: jest.fn(),
  result: 'data:image/jpeg;base64,test-image-data',
  onload: null,
  onerror: null,
}));

// Mock IntersectionObserver for components that might use it
global.IntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// Mock ResizeObserver for responsive components
global.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// Suppress console errors for cleaner test output
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is deprecated')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  
  // Clean up any remaining timers
  jest.clearAllTimers();
  
  // Reset fetch mock
  if (global.fetch.mockClear) {
    global.fetch.mockClear();
  }
});