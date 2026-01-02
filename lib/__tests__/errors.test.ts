import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  DatabaseError,
  formatErrorResponse,
  logError,
} from '../errors'

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default status code', () => {
      const error = new AppError('Test error')
      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBe(500)
      expect(error.isOperational).toBe(true)
    })

    it('should create error with custom status code and code', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR')
      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBe(400)
      expect(error.code).toBe('TEST_ERROR')
    })
  })

  describe('ValidationError', () => {
    it('should create validation error with field errors', () => {
      const errors = { name: ['Required'], email: ['Invalid format'] }
      const error = new ValidationError('Validation failed', errors)
      expect(error.message).toBe('Validation failed')
      expect(error.statusCode).toBe(400)
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.errors).toEqual(errors)
    })
  })

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError()
      expect(error.message).toBe('Authentication required')
      expect(error.statusCode).toBe(401)
      expect(error.code).toBe('AUTHENTICATION_ERROR')
    })
  })

  describe('AuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new AuthorizationError('Access denied')
      expect(error.message).toBe('Access denied')
      expect(error.statusCode).toBe(403)
      expect(error.code).toBe('AUTHORIZATION_ERROR')
    })
  })

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('User')
      expect(error.message).toBe('User not found')
      expect(error.statusCode).toBe(404)
      expect(error.code).toBe('NOT_FOUND_ERROR')
    })
  })

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('Too many requests', 60)
      expect(error.message).toBe('Too many requests')
      expect(error.statusCode).toBe(429)
      expect(error.code).toBe('RATE_LIMIT_ERROR')
      expect(error.retryAfter).toBe(60)
    })
  })

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Connection failed')
      expect(error.message).toBe('Connection failed')
      expect(error.statusCode).toBe(500)
      expect(error.code).toBe('DATABASE_ERROR')
    })
  })

  describe('formatErrorResponse', () => {
    it('should format AppError response', () => {
      const error = new ValidationError('Invalid input', { field: ['error'] })
      const response = formatErrorResponse(error)
      expect(response).toEqual({
        error: 'Invalid input',
        code: 'VALIDATION_ERROR',
        details: { field: ['error'] },
        timestamp: expect.any(String),
      })
    })

    it('should format unknown error response', () => {
      const error = new Error('Unknown error')
      const response = formatErrorResponse(error)
      expect(response).toEqual({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: expect.any(String),
      })
    })
  })

  describe('logError', () => {
    const originalConsoleWarn = console.warn
    const originalConsoleError = console.error

    beforeEach(() => {
      console.warn = jest.fn()
      console.error = jest.fn()
    })

    afterEach(() => {
      console.warn = originalConsoleWarn
      console.error = originalConsoleError
    })

    it('should log operational errors as warnings', () => {
      const error = new ValidationError('Test')
      logError(error)
      expect(console.warn).toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })

    it('should log programming errors as errors', () => {
      const error = new Error('Programming error')
      // @ts-ignore - accessing private property for testing
      error.isOperational = false
      logError(error)
      expect(console.error).toHaveBeenCalled()
    })
  })
})