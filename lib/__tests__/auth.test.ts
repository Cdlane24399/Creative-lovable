import { NextRequest } from 'next/server'
import { authenticateRequest, withAuth } from '../auth'
import { AuthenticationError, AuthorizationError } from '../errors'

// Mock environment
const originalEnv = process.env

describe('Authentication', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, API_KEY: 'test-api-key' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('authenticateRequest', () => {
    it('should authenticate with valid API key in header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'test-api-key' }
      })

      const result = await authenticateRequest(request)
      expect(result.isAuthenticated).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should authenticate with valid API key in authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'authorization': 'Bearer test-api-key' }
      })

      const result = await authenticateRequest(request)
      expect(result.isAuthenticated).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject without API key', async () => {
      const request = new NextRequest('http://localhost:3000/api/test')

      const result = await authenticateRequest(request)
      expect(result.isAuthenticated).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.status).toBe(401)
    })

    it('should reject with invalid API key', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'invalid-key' }
      })

      const result = await authenticateRequest(request)
      expect(result.isAuthenticated).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.status).toBe(403)
    })

    it('should reject when API_KEY not set in production mode', async () => {
      delete process.env.API_KEY
      // Use Object.defineProperty to override read-only NODE_ENV
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true })
      const request = new NextRequest('http://localhost:3000/api/test')

      const result = await authenticateRequest(request)
      // SECURITY: In production, must reject when API_KEY not configured
      expect(result.isAuthenticated).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.status).toBe(500)
    })

    it('should allow requests in development mode when API_KEY not set', async () => {
      delete process.env.API_KEY
      // Use Object.defineProperty to override read-only NODE_ENV
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true })
      const request = new NextRequest('http://localhost:3000/api/test')

      const result = await authenticateRequest(request)
      // In development, allow for easier testing
      expect(result.isAuthenticated).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('withAuth', () => {
    it('should call handler when authenticated', async () => {
      const mockHandler = jest.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withAuth(mockHandler)

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'test-api-key' }
      })

      const result = await wrappedHandler(request)
      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(result.status).toBe(200)
    })

    it('should return error when not authenticated', async () => {
      const mockHandler = jest.fn()
      const wrappedHandler = withAuth(mockHandler)

      const request = new NextRequest('http://localhost:3000/api/test')

      const result = await wrappedHandler(request)
      expect(mockHandler).not.toHaveBeenCalled()
      expect(result.status).toBe(401)
    })

    it('should handle handler errors', async () => {
      const mockHandler = jest.fn().mockRejectedValue(new Error('Handler error'))
      const wrappedHandler = withAuth(mockHandler)

      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: { 'x-api-key': 'test-api-key' }
      })

      await expect(wrappedHandler(request)).rejects.toThrow('Handler error')
    })
  })
})