/**
 * Custom error classes for the web builder agent.
 * Provides structured error information for better debugging and user feedback.
 */

/**
 * Base error class for web builder agent errors.
 * Provides structured error information for better debugging and user feedback.
 */
export class WebBuilderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = "WebBuilderError"
  }
}

/** Error thrown when file path validation fails */
export class InvalidPathError extends WebBuilderError {
  constructor(rawPath: string) {
    super(`Invalid file path: "${rawPath}"`, "INVALID_PATH", { rawPath })
    this.name = "InvalidPathError"
  }
}

/** Error thrown when sandbox operations fail */
export class SandboxError extends WebBuilderError {
  constructor(operation: string, cause?: Error) {
    super(
      `Sandbox operation failed: ${operation}`,
      "SANDBOX_ERROR",
      { operation, cause: cause?.message }
    )
    this.name = "SandboxError"
  }
}
