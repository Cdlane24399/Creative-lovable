/**
 * Formatting and type utility functions for the web builder agent.
 * Provides consistent error handling and type checking utilities.
 */

/** Result type for tool operations */
export type ToolResult<T = Record<string, unknown>> =
  | ({ success: true } & T)
  | { success: false; error: string }

/**
 * Creates a standardized error result for tool responses.
 * Ensures consistent error formatting across all tools.
 */
export function createErrorResult(error: unknown, context?: Record<string, unknown>): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    success: false,
    error: message,
    ...context,
  }
}

/**
 * Measures execution time and returns formatted duration.
 */
export function formatDuration(startTime: Date): string {
  const ms = Date.now() - startTime.getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * Type guard to check if a value is a non-null object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
