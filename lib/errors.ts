/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly code?: string

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.isOperational = true
    this.code = code

    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR")
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Insufficient permissions") {
    super(message, 403, "AUTHORIZATION_ERROR")
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  public readonly errors: Record<string, string[]>

  constructor(message: string = "Validation failed", errors: Record<string, string[]> = {}) {
    super(message, 400, "VALIDATION_ERROR")
    this.errors = errors
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND_ERROR")
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number

  constructor(message: string = "Rate limit exceeded", retryAfter: number) {
    super(message, 429, "RATE_LIMIT_ERROR")
    this.retryAfter = retryAfter
  }
}

/**
 * Database errors
 */
export class DatabaseError extends AppError {
  constructor(message: string = "Database operation failed") {
    super(message, 500, "DATABASE_ERROR")
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string = "External service error") {
    super(`${service}: ${message}`, 502, "EXTERNAL_SERVICE_ERROR")
  }
}

/**
 * Sandbox errors
 */
export class SandboxError extends AppError {
  constructor(message: string = "Sandbox operation failed") {
    super(message, 500, "SANDBOX_ERROR")
  }
}

/**
 * File system errors
 */
export class FileSystemError extends AppError {
  constructor(message: string = "File system operation failed") {
    super(message, 500, "FILE_SYSTEM_ERROR")
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AppError {
  constructor(message: string = "Configuration error") {
    super(message, 500, "CONFIGURATION_ERROR")
    // Override the operational flag for configuration errors
    Object.defineProperty(this, 'isOperational', { value: false, writable: false })
  }
}

/**
 * Error response formatter
 */
export function formatErrorResponse(error: Error): {
  error: string
  code?: string
  details?: any
  timestamp: string
} {
  const baseResponse = {
    error: error.message,
    timestamp: new Date().toISOString(),
  }

  if (error instanceof AppError) {
    return {
      ...baseResponse,
      code: error.code,
      ...(error instanceof ValidationError && { details: error.errors }),
      ...(error instanceof RateLimitError && { retryAfter: error.retryAfter }),
    }
  }

  // For unknown errors, don't expose internal details
  return {
    ...baseResponse,
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  }
}

/**
 * Error logging utility
 */
export function logError(error: Error, context?: Record<string, any>): void {
  const logData = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error instanceof AppError && {
      statusCode: error.statusCode,
      code: error.code,
      isOperational: error.isOperational,
    }),
    ...context,
    timestamp: new Date().toISOString(),
  }

  if (error instanceof AppError && error.isOperational) {
    console.warn("Operational error:", logData)
  } else {
    console.error("Programming error:", logData)
  }
}

/**
 * Async error wrapper for API routes
 */
export function asyncErrorHandler<T extends any[]>(
  fn: (...args: T) => Promise<any>
) {
  return async (...args: T) => {
    try {
      return await fn(...args)
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), {
        route: args[0]?.url || "unknown",
        method: args[0]?.method || "unknown",
      })

      if (error instanceof AppError) {
        return new Response(JSON.stringify(formatErrorResponse(error)), {
          status: error.statusCode,
          headers: {
            "Content-Type": "application/json",
            ...(error instanceof RateLimitError && {
              "Retry-After": error.retryAfter.toString(),
            }),
          },
        })
      }

      // Unknown error
      const internalError = new AppError("Internal server error", 500, "INTERNAL_ERROR")
      return new Response(JSON.stringify(formatErrorResponse(internalError)), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
  }
}