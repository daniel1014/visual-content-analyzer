/**
 * Jest configuration for Visual Content Analyzer Frontend
 * 
 * Configures Jest for React Testing Library, coverage reporting,
 * and frontend-specific testing requirements.
 */

module.exports = {
  // Test environment
  testEnvironment: 'jsdom',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  
  // Module name mapping for CSS modules and assets
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub',
  },
  
  // File extensions
  moduleFileExtensions: ['js', 'jsx', 'json', 'ts', 'tsx'],
  
  // Transform configuration
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }]
      ]
    }],
    '^.+\\.css$': 'jest-transform-stub',
  },
  
  // Test patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx}'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/build/',
    '<rootDir>/public/'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/reportWebVitals.js',
    '!src/**/*.stories.{js,jsx}',
    '!src/**/__tests__/**',
    '!src/**/*.test.{js,jsx}',
    '!src/**/*.spec.{js,jsx}',
  ],
  
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'clover'
  ],
  
  coverageDirectory: 'coverage',
  
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80
    },
    'src/components/': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'src/services/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Globals
  globals: {
    'process.env.NODE_ENV': 'test',
    'process.env.REACT_APP_API_URL': 'http://localhost:8000'
  },
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Test timeout
  testTimeout: 10000,
  
  // Mock modules
  modulePathIgnorePatterns: ['<rootDir>/build/'],
  
  // Watch mode configuration
  watchPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/build/'],
  
  // Error handling
  errorOnDeprecated: true,
  
  // Snapshot serializers for better snapshot testing
  snapshotSerializers: ['@testing-library/jest-dom/serializers'],
  
  // Custom matchers
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  
  // Additional configuration for React Testing Library
  testEnvironmentOptions: {
    url: 'http://localhost:3000'
  },
  
  // Mock file system for file upload tests
  moduleDirectories: ['node_modules', '<rootDir>/src'],
  
  // Transform ignore patterns for node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(react-dropzone|other-esm-packages)/)'
  ],
  
  // Reporting
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-reports',
      outputName: 'junit.xml',
      ancestorSeparator: ' › ',
      uniqueOutputName: 'false',
      suiteNameTemplate: '{filepath}',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],
  
  // Custom test sequencer for performance
  testSequencer: '@jest/test-sequencer',
  
  // Resolve modules
  resolver: undefined,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Max workers for parallel testing
  maxWorkers: '50%',
  
  // Cache directory
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  
  // Collect coverage from these paths
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/index.js',
    '!src/setupTests.js',
    '!src/reportWebVitals.js',
    '!src/**/*.stories.{js,jsx}',
    '!src/**/__tests__/**',
    '!src/**/*.test.{js,jsx}',
    '!src/**/*.spec.{js,jsx}',
    '!**/node_modules/**',
    '!**/coverage/**'
  ]
};