/**
 * Base Repository
 * 
 * Provides common database operations and patterns for all repositories.
 * Uses the Neon serverless driver with tagged template literals for safe queries.
 * 
 * Best Practices Applied:
 * - Consistent error handling with custom error classes
 * - Type-safe query results
 * - Connection pooling awareness
 * - Standardized CRUD operations
 * 
 * Note: Due to Neon's tagged template literal syntax, dynamic table names
 * cannot be used. Each repository must implement table-specific queries.
 */

import { getDb } from "../neon"
import { DatabaseError, NotFoundError, ValidationError } from "@/lib/errors"

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
 * 
 * Note: Neon serverless driver requires tagged template literals,
 * so most methods should be overridden in concrete repositories.
 */
export abstract class BaseRepository<T extends BaseEntity> {
  protected readonly tableName: string
  
  constructor(tableName: string) {
    this.tableName = tableName
  }

  /**
   * Execute a query with standardized error handling
   */
  protected async executeQuery<R>(
    queryFn: (sql: ReturnType<typeof getDb>) => Promise<R>,
    operationName: string
  ): Promise<R> {
    try {
      const sql = getDb()
      return await queryFn(sql)
    } catch (error) {
      console.error(`[${this.tableName}] ${operationName} failed:`, error)
      
      if (error instanceof DatabaseError || 
          error instanceof NotFoundError || 
          error instanceof ValidationError) {
        throw error
      }
      
      throw new DatabaseError(
        `${operationName} failed: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  /**
   * Find a single entity by ID
   * Must be overridden in concrete repositories due to Neon's tagged template syntax
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
   * Must be overridden in concrete repositories
   */
  abstract exists(id: string): Promise<boolean>

  /**
   * Delete an entity by ID
   * Must be overridden in concrete repositories
   */
  abstract delete(id: string): Promise<boolean>

  /**
   * Count total entities
   * Must be overridden in concrete repositories
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
  return JSON.stringify(value)
}
