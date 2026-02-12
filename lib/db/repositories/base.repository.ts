import { createAdminClient } from "@/lib/supabase/admin"
import { DatabaseError, NotFoundError, ValidationError } from "@/lib/errors"
import { SupabaseClient } from "@supabase/supabase-js"

// =============================================================================
// Types
// =============================================================================

/**
 * Common database row with timestamps
 */
export interface BaseEntity {
  id: string
  created_at: string
}

/**
 * Query options for find operations
 */
export interface FindOptions {
  limit?: number
  offset?: number
  orderBy?: string
  orderDir?: "ASC" | "DESC"
}

/**
 * Result type for paginated queries
 */
export interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

/**
 * Result type for mutations
 */
export interface MutationResult<T> {
  success: boolean
  data?: T
  error?: string
}

// =============================================================================
// Base Repository Class
// =============================================================================

/**
 * Abstract base repository providing common database operations.
 * Extend this class for specific entity repositories.
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected readonly tableName: string
  
  constructor(tableName: string) {
    this.tableName = tableName
  }

  /**
   * Get Supabase admin client (bypasses RLS)
   */
  protected async getClient(): Promise<SupabaseClient> {
    return createAdminClient()
  }

  /**
   * Handle database errors
   */
  protected handleError(error: unknown, operationName: string): never {
    console.error(`[${this.tableName}] ${operationName} failed:`, error)
    
    if (error instanceof DatabaseError || 
        error instanceof NotFoundError || 
        error instanceof ValidationError) {
      throw error
    }
    
    const message = error instanceof Error ? error.message : "Unknown error"
    throw new DatabaseError(
      `${operationName} failed: ${message}`
    )
  }

  /**
   * Retry an operation with exponential backoff for transient errors.
   * Retries on deadlock (40P01) and Supabase timeout (PGRST301).
   */
  protected async withRetry<R>(
    operation: () => Promise<R>,
    maxRetries: number = 3,
  ): Promise<R> {
    const TRANSIENT_CODES = new Set(['PGRST301', '40P01'])
    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (err: unknown) {
        lastError = err
        const code = (err as { code?: string })?.code
        if (!code || !TRANSIENT_CODES.has(code) || attempt === maxRetries) {
          throw err
        }
        const delayMs = Math.min(100 * Math.pow(2, attempt), 2000)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    throw lastError
  }

  /**
   * Find a single entity by ID
   */
  abstract findById(id: string): Promise<T | null>

  /**
   * Find a single entity by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<T> {
    const entity = await this.findById(id)
    if (!entity) {
      throw new NotFoundError(`${this.tableName} with id ${id}`)
    }
    return entity
  }

  /**
   * Check if an entity exists by ID
   */
  abstract exists(id: string): Promise<boolean>

  /**
   * Delete an entity by ID
   */
  abstract delete(id: string): Promise<boolean>

  /**
   * Count total entities
   */
  abstract count(): Promise<number>
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a UUID v4 for new entities
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Parse JSON safely with fallback
 */
export function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  if (typeof value === "object" && value !== null) {
    return value as T
  }
  return fallback
}

/**
 * Stringify JSON for storage
 */
export function toJsonString(value: unknown): string {
  if (typeof value === "string") return value
  return JSON.stringify(value)
}
