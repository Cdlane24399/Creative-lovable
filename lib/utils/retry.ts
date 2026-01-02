/**
 * Retry Utilities with Exponential Backoff
 *
 * Provides robust retry mechanisms for handling transient failures
 * with configurable backoff strategies and error classification.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number
  /** Base delay between retries (ms) */
  baseDelayMs: number
  /** Maximum delay between retries (ms) */
  maxDelayMs: number
  /** Whether to add jitter to delays */
  jitter: boolean
  /** Backoff multiplier (default: 2 for exponential) */
  backoffMultiplier?: number
  /** Custom function to determine if should retry */
  shouldRetry?: (error: Error, attempt: number) => boolean
  /** Callback for retry attempts */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: Error
  attempts: number
  totalDelayMs: number
}

/**
 * Abort controller for cancellable retries
 */
export interface RetryController {
  abort: () => void
  signal: AbortSignal
}

// =============================================================================
// Default Configurations
// =============================================================================

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: true,
  backoffMultiplier: 2,
  shouldRetry: () => true,
  onRetry: () => {},
}

/**
 * Pre-configured retry policies for common scenarios
 */
export const RETRY_POLICIES = {
  /** For API calls and network requests */
  network: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    jitter: true,
    backoffMultiplier: 2,
  } as RetryConfig,

  /** For rate-limited APIs */
  rateLimited: {
    maxAttempts: 5,
    baseDelayMs: 5000,
    maxDelayMs: 60000,
    jitter: true,
    backoffMultiplier: 2,
  } as RetryConfig,

  /** For database operations */
  database: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    jitter: false,
    backoffMultiplier: 2,
  } as RetryConfig,

  /** For file operations */
  fileOperation: {
    maxAttempts: 2,
    baseDelayMs: 200,
    maxDelayMs: 2000,
    jitter: false,
    backoffMultiplier: 2,
  } as RetryConfig,

  /** For E2B sandbox operations */
  sandbox: {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 15000,
    jitter: true,
    backoffMultiplier: 2,
  } as RetryConfig,

  /** For npm install */
  npmInstall: {
    maxAttempts: 3,
    baseDelayMs: 3000,
    maxDelayMs: 30000,
    jitter: true,
    backoffMultiplier: 2,
  } as RetryConfig,

  /** Quick retry for fast operations */
  quick: {
    maxAttempts: 2,
    baseDelayMs: 100,
    maxDelayMs: 500,
    jitter: false,
    backoffMultiplier: 2,
  } as RetryConfig,
} as const

// =============================================================================
// Core Retry Function
// =============================================================================

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const { maxAttempts, shouldRetry, onRetry } = mergedConfig

  let lastError: Error | undefined
  let attempt = 0

  while (attempt < maxAttempts) {
    attempt++

    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if we should retry
      if (attempt >= maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, mergedConfig)

      // Call retry callback
      onRetry(lastError, attempt, delayMs)

      // Wait before retrying
      await sleep(delayMs)
    }
  }

  throw lastError || new Error("Max retry attempts reached")
}

/**
 * Execute a function with retry and return detailed result
 */
export async function withRetryResult<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const { maxAttempts, shouldRetry, onRetry } = mergedConfig

  let lastError: Error | undefined
  let attempt = 0
  let totalDelayMs = 0

  while (attempt < maxAttempts) {
    attempt++

    try {
      const result = await fn()
      return {
        success: true,
        result,
        attempts: attempt,
        totalDelayMs,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if we should retry
      if (attempt >= maxAttempts || !shouldRetry(lastError, attempt)) {
        break
      }

      // Calculate delay
      const delayMs = calculateDelay(attempt, mergedConfig)
      totalDelayMs += delayMs

      // Call retry callback
      onRetry(lastError, attempt, delayMs)

      // Wait before retrying
      await sleep(delayMs)
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,
    totalDelayMs,
  }
}

/**
 * Execute a function with retry and abort support
 */
export async function withRetryAbortable<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  config: Partial<RetryConfig> = {},
  controller?: RetryController
): Promise<T> {
  const abortController = new AbortController()
  const signal = controller?.signal || abortController.signal

  // Forward abort if external controller provided
  if (controller) {
    controller.signal.addEventListener("abort", () => {
      abortController.abort()
    })
  }

  return withRetry(
    async () => {
      if (signal.aborted) {
        throw new Error("Operation aborted")
      }
      return fn(signal)
    },
    {
      ...config,
      shouldRetry: (error, attempt) => {
        if (signal.aborted) return false
        return config.shouldRetry?.(error, attempt) ?? true
      },
    }
  )
}

// =============================================================================
// Delay Calculation
// =============================================================================

/**
 * Calculate delay for a retry attempt
 */
export function calculateDelay(
  attempt: number,
  config: Pick<RetryConfig, "baseDelayMs" | "maxDelayMs" | "jitter" | "backoffMultiplier">
): number {
  const { baseDelayMs, maxDelayMs, jitter, backoffMultiplier = 2 } = config

  // Exponential backoff
  let delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1)

  // Cap at max delay
  delay = Math.min(delay, maxDelayMs)

  // Add jitter (±25%)
  if (jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5
    delay = Math.round(delay * jitterFactor)
  }

  return delay
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================================================
// Error Classification
// =============================================================================

/**
 * Common error patterns and their retry recommendations
 */
const ERROR_PATTERNS = {
  transient: [
    /timeout/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /network/i,
    /ENOTFOUND/i,
    /socket hang up/i,
    /429/,
    /503/,
    /502/,
    /504/,
    /temporary/i,
    /busy/i,
    /overloaded/i,
  ],
  permanent: [
    /not found/i,
    /404/,
    /permission/i,
    /forbidden/i,
    /403/,
    /401/,
    /unauthorized/i,
    /invalid/i,
    /malformed/i,
    /syntax/i,
    /ENOENT/i,
    /EACCES/i,
    /EPERM/i,
  ],
}

/**
 * Check if an error is transient (likely to succeed on retry)
 */
export function isTransientError(error: Error): boolean {
  const message = error.message
  return ERROR_PATTERNS.transient.some((pattern) => pattern.test(message))
}

/**
 * Check if an error is permanent (retry won't help)
 */
export function isPermanentError(error: Error): boolean {
  const message = error.message
  return ERROR_PATTERNS.permanent.some((pattern) => pattern.test(message))
}

/**
 * Create a shouldRetry function that only retries transient errors
 */
export function retryOnlyTransient(): (error: Error, attempt: number) => boolean {
  return (error) => isTransientError(error) && !isPermanentError(error)
}

/**
 * Create a shouldRetry function that retries on specific error patterns
 */
export function retryOnPatterns(
  patterns: RegExp[]
): (error: Error, attempt: number) => boolean {
  return (error) => patterns.some((pattern) => pattern.test(error.message))
}

// =============================================================================
// Retry Decorators
// =============================================================================

/**
 * Create a retry-wrapped version of a function
 */
export function withRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withRetry(() => fn(...args), config)
  }) as T
}

/**
 * Create a circuit breaker for a function
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    failureThreshold?: number
    resetTimeout?: number
  } = {}
): {
  call: T
  getState: () => "closed" | "open" | "half-open"
  reset: () => void
} {
  const { failureThreshold = 5, resetTimeout = 30000 } = options

  let failures = 0
  let lastFailureTime = 0
  let state: "closed" | "open" | "half-open" = "closed"

  const call = (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    // Check if circuit should be reset
    if (state === "open" && Date.now() - lastFailureTime >= resetTimeout) {
      state = "half-open"
    }

    // If open, fail fast
    if (state === "open") {
      throw new Error("Circuit breaker is open")
    }

    try {
      const result = await fn(...args)
      // Success - reset failures
      failures = 0
      state = "closed"
      return result
    } catch (error) {
      failures++
      lastFailureTime = Date.now()

      if (failures >= failureThreshold) {
        state = "open"
      }

      throw error
    }
  }) as T

  return {
    call,
    getState: () => state,
    reset: () => {
      failures = 0
      state = "closed"
    },
  }
}

// =============================================================================
// Batch Retry
// =============================================================================

/**
 * Execute multiple operations with retry, collecting results
 */
export async function withRetryBatch<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<RetryConfig> = {},
  options: {
    concurrency?: number
    stopOnFirstError?: boolean
  } = {}
): Promise<Array<RetryResult<T>>> {
  const { concurrency = 5, stopOnFirstError = false } = options
  const results: Array<RetryResult<T>> = []

  // Process in batches
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency)

    const batchResults = await Promise.all(
      batch.map((op) => withRetryResult(op, config))
    )

    results.push(...batchResults)

    // Check if we should stop
    if (stopOnFirstError && batchResults.some((r) => !r.success)) {
      break
    }
  }

  return results
}

// =============================================================================
// Retry Builder
// =============================================================================

/**
 * Fluent builder for retry configuration
 */
export class RetryBuilder {
  private config: Partial<RetryConfig> = {}

  /**
   * Set maximum attempts
   */
  attempts(n: number): this {
    this.config.maxAttempts = n
    return this
  }

  /**
   * Set base delay
   */
  delay(ms: number): this {
    this.config.baseDelayMs = ms
    return this
  }

  /**
   * Set max delay
   */
  maxDelay(ms: number): this {
    this.config.maxDelayMs = ms
    return this
  }

  /**
   * Enable/disable jitter
   */
  withJitter(enabled: boolean = true): this {
    this.config.jitter = enabled
    return this
  }

  /**
   * Set backoff multiplier
   */
  backoff(multiplier: number): this {
    this.config.backoffMultiplier = multiplier
    return this
  }

  /**
   * Set retry condition
   */
  retryIf(fn: (error: Error, attempt: number) => boolean): this {
    this.config.shouldRetry = fn
    return this
  }

  /**
   * Only retry transient errors
   */
  transientOnly(): this {
    this.config.shouldRetry = retryOnlyTransient()
    return this
  }

  /**
   * Set retry callback
   */
  onRetry(fn: (error: Error, attempt: number, delayMs: number) => void): this {
    this.config.onRetry = fn
    return this
  }

  /**
   * Use a predefined policy
   */
  usePolicy(policy: keyof typeof RETRY_POLICIES): this {
    Object.assign(this.config, RETRY_POLICIES[policy])
    return this
  }

  /**
   * Execute with the configured retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, this.config)
  }

  /**
   * Execute with result
   */
  async executeWithResult<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    return withRetryResult(fn, this.config)
  }

  /**
   * Get the configuration
   */
  build(): RetryConfig {
    return { ...DEFAULT_CONFIG, ...this.config }
  }
}

/**
 * Create a new retry builder
 */
export function retry(): RetryBuilder {
  return new RetryBuilder()
}
