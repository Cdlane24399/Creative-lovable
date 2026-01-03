/**
 * Timeout utilities for async operations
 * 
 * Provides wrappers to prevent operations from hanging indefinitely
 */

/**
 * Default timeouts for various operations (in milliseconds)
 */
export const OPERATION_TIMEOUTS = {
  /** Sandbox operations (file read/write, commands) */
  SANDBOX_OPERATION: 30_000, // 30 seconds
  /** AI model calls */
  AI_CALL: 60_000, // 60 seconds
  /** Database queries */
  DB_QUERY: 10_000, // 10 seconds
  /** File system operations */
  FILE_OPERATION: 15_000, // 15 seconds
  /** Dev server startup */
  DEV_SERVER_START: 120_000, // 2 minutes
  /** Package installation */
  PACKAGE_INSTALL: 300_000, // 5 minutes
} as const

export type OperationType = keyof typeof OPERATION_TIMEOUTS

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly timeoutMs: number
  ) {
    super(`Operation "${operation}" timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
  }
}

/**
 * Wrap an async function with a timeout
 * 
 * @param fn - The async function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name for error messages
 * @returns The result of fn, or throws TimeoutError
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs))
    }, timeoutMs)

    fn()
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

/**
 * Wrap an async function with a standard operation timeout
 * 
 * @param fn - The async function to wrap  
 * @param operationType - Type of operation for default timeout
 * @param operationName - Optional name override for error messages
 */
export async function withOperationTimeout<T>(
  fn: () => Promise<T>,
  operationType: OperationType,
  operationName?: string
): Promise<T> {
  const timeoutMs = OPERATION_TIMEOUTS[operationType]
  const name = operationName ?? operationType
  return withTimeout(fn, timeoutMs, name)
}

/**
 * Create a timeout-wrapped version of an async function
 * Useful for wrapping sandbox operations
 */
export function createTimeoutWrapper<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  timeoutMs: number,
  operationName: string
): (...args: TArgs) => Promise<TReturn> {
  return (...args: TArgs) => withTimeout(() => fn(...args), timeoutMs, operationName)
}

/**
 * AbortSignal-based timeout for fetch-like operations
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}
