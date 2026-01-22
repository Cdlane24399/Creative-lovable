// Jest setup file
// This file runs before each test suite

// Mock environment variables
process.env.API_KEY = 'test-api-key'
process.env.NEON_DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.E2B_TEMPLATE_ID = 'test-template'

// Mock external dependencies
jest.mock('@vercel/kv', () => ({
  kv: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  },
}))

jest.mock('@neondatabase/serverless', () => ({
  neon: jest.fn(() => jest.fn()),
}))

// Mock E2B
jest.mock('e2b', () => ({
  Sandbox: {
    create: jest.fn(),
    connect: jest.fn(),
  },
}))

// Global test utilities
global.testUtils = {
  // Helper to create mock requests
  createMockRequest: (options = {}) => ({
    url: 'http://localhost:3000/api/test',
    method: 'GET',
    headers: new Map(),
    json: jest.fn(),
    ...options,
  }),

  // Helper to create mock responses
  createMockResponse: () => ({
    json: jest.fn(),
    status: jest.fn(),
    headers: new Map(),
  }),
}
