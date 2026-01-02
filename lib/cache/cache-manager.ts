/**
 * Unified Cache Manager
 * 
 * Centralized cache management with:
 * - Consistent TTLs across cache types
 * - Unified invalidation logic
 * - Event emission for cache operations
 * - Fallback to no-op when KV not configured
 * 
 * Usage:
 * ```typescript
 * const cache = getCacheManager()
 * 
 * // Get cached data
 * const project = await cache.getProject(projectId)
 * 
 * // Invalidate all caches for a project
 * await cache.invalidateProject(projectId)
 * ```
 */

import { kv } from "@vercel/kv"

// =============================================================================
// Configuration
// =============================================================================

/** Cache TTL in seconds */
const CACHE_TTL = {
  PROJECT: 60,          // 1 minute for project data
  PROJECTS_LIST: 60,    // 1 minute for project lists
  MESSAGES: 30,         // 30 seconds for messages (more volatile)
  CONTEXT: 120,         // 2 minutes for context (less volatile)
} as const

/** Cache key prefixes */
const CACHE_KEYS = {
  PROJECT: "project:",
  PROJECTS_LIST: "projects:list:",
  MESSAGES: "messages:",
  CONTEXT: "context:",
} as const

// =============================================================================
// Types
// =============================================================================

export interface CacheStats {
  connected: boolean
  status: "healthy" | "unhealthy" | "disabled"
  message?: string
  error?: string
}

export interface CacheEvent {
  type: "get" | "set" | "delete" | "invalidate"
  key: string
  success: boolean
  timestamp: Date
}

type CacheEventHandler = (event: CacheEvent) => void

// =============================================================================
// Cache Manager Implementation
// =============================================================================

export class CacheManager {
  private readonly isConfigured: boolean
  private eventHandlers: CacheEventHandler[] = []

  constructor() {
    this.isConfigured = !!(
      process.env.KV_REST_API_URL && 
      process.env.KV_REST_API_TOKEN
    )
  }

  /**
   * Check if cache is configured
   */
  get enabled(): boolean {
    return this.isConfigured
  }

  /**
   * Subscribe to cache events
   */
  onEvent(handler: CacheEventHandler): () => void {
    this.eventHandlers.push(handler)
    return () => {
      this.eventHandlers = this.eventHandlers.filter(h => h !== handler)
    }
  }

  /**
   * Emit a cache event
   */
  private emit(event: Omit<CacheEvent, "timestamp">): void {
    const fullEvent = { ...event, timestamp: new Date() }
    this.eventHandlers.forEach(handler => {
      try {
        handler(fullEvent)
      } catch (e) {
        console.warn("[CacheManager] Event handler error:", e)
      }
    })
  }

  // ===========================================================================
  // Generic Cache Operations
  // ===========================================================================

  /**
   * Get a value from cache
   */
  private async get<T>(key: string): Promise<T | null> {
    if (!this.isConfigured) return null

    try {
      const data = await kv.get(key)
      this.emit({ type: "get", key, success: true })
      return data as T
    } catch (error) {
      console.warn(`[CacheManager] Get failed for ${key}:`, error)
      this.emit({ type: "get", key, success: false })
      return null
    }
  }

  /**
   * Set a value in cache
   */
  private async set(key: string, value: unknown, ttl: number): Promise<void> {
    if (!this.isConfigured) return

    try {
      await kv.set(key, value, { ex: ttl })
      this.emit({ type: "set", key, success: true })
    } catch (error) {
      console.warn(`[CacheManager] Set failed for ${key}:`, error)
      this.emit({ type: "set", key, success: false })
    }
  }

  /**
   * Delete a value from cache
   */
  private async delete(key: string): Promise<void> {
    if (!this.isConfigured) return

    try {
      await kv.del(key)
      this.emit({ type: "delete", key, success: true })
    } catch (error) {
      console.warn(`[CacheManager] Delete failed for ${key}:`, error)
      this.emit({ type: "delete", key, success: false })
    }
  }

  /**
   * Delete all keys matching a pattern
   */
  private async deletePattern(pattern: string): Promise<number> {
    if (!this.isConfigured) return 0

    try {
      const keys = await kv.keys(pattern)
      if (keys.length > 0) {
        await kv.del(...keys)
      }
      return keys.length
    } catch (error) {
      console.warn(`[CacheManager] Delete pattern failed for ${pattern}:`, error)
      return 0
    }
  }

  // ===========================================================================
  // Project Cache Operations
  // ===========================================================================

  /**
   * Get cached project data
   */
  async getProject(projectId: string): Promise<{ project: unknown } | null> {
    return this.get(`${CACHE_KEYS.PROJECT}${projectId}`)
  }

  /**
   * Cache project data
   */
  async setProject(projectId: string, data: { project: unknown }): Promise<void> {
    await this.set(`${CACHE_KEYS.PROJECT}${projectId}`, data, CACHE_TTL.PROJECT)
  }

  /**
   * Invalidate project cache
   */
  async invalidateProjectCache(projectId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.PROJECT}${projectId}`)
    this.emit({ type: "invalidate", key: `project:${projectId}`, success: true })
  }

  // ===========================================================================
  // Projects List Cache Operations
  // ===========================================================================

  /**
   * Get cached projects list
   */
  async getProjectsList(filters: { 
    starred?: boolean
    limit?: number
    offset?: number 
  }): Promise<{ projects: unknown[] } | null> {
    const key = `${CACHE_KEYS.PROJECTS_LIST}${JSON.stringify(filters)}`
    return this.get(key)
  }

  /**
   * Cache projects list
   */
  async setProjectsList(
    filters: { starred?: boolean; limit?: number; offset?: number },
    data: { projects: unknown[] }
  ): Promise<void> {
    const key = `${CACHE_KEYS.PROJECTS_LIST}${JSON.stringify(filters)}`
    await this.set(key, data, CACHE_TTL.PROJECTS_LIST)
  }

  /**
   * Invalidate all projects list caches
   */
  async invalidateProjectsListCache(): Promise<void> {
    await this.deletePattern(`${CACHE_KEYS.PROJECTS_LIST}*`)
    this.emit({ type: "invalidate", key: "projects:list:*", success: true })
  }

  // ===========================================================================
  // Messages Cache Operations
  // ===========================================================================

  /**
   * Get cached messages for a project
   */
  async getMessages(projectId: string): Promise<unknown[] | null> {
    return this.get(`${CACHE_KEYS.MESSAGES}${projectId}`)
  }

  /**
   * Cache messages for a project
   */
  async setMessages(projectId: string, messages: unknown[]): Promise<void> {
    await this.set(`${CACHE_KEYS.MESSAGES}${projectId}`, messages, CACHE_TTL.MESSAGES)
  }

  /**
   * Invalidate messages cache for a project
   */
  async invalidateMessagesCache(projectId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.MESSAGES}${projectId}`)
    this.emit({ type: "invalidate", key: `messages:${projectId}`, success: true })
  }

  // ===========================================================================
  // Context Cache Operations
  // ===========================================================================

  /**
   * Get cached context for a project
   */
  async getContext(projectId: string): Promise<unknown | null> {
    return this.get(`${CACHE_KEYS.CONTEXT}${projectId}`)
  }

  /**
   * Cache context for a project
   */
  async setContext(projectId: string, context: unknown): Promise<void> {
    await this.set(`${CACHE_KEYS.CONTEXT}${projectId}`, context, CACHE_TTL.CONTEXT)
  }

  /**
   * Invalidate context cache for a project
   */
  async invalidateContextCache(projectId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.CONTEXT}${projectId}`)
    this.emit({ type: "invalidate", key: `context:${projectId}`, success: true })
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Invalidate all caches for a project
   */
  async invalidateAllForProject(projectId: string): Promise<void> {
    await Promise.all([
      this.invalidateProjectCache(projectId),
      this.invalidateMessagesCache(projectId),
      this.invalidateContextCache(projectId),
      this.invalidateProjectsListCache(),
    ])
    
    console.log(`[CacheManager] Invalidated all caches for project ${projectId}`)
  }

  /**
   * Clear all caches (use with caution)
   */
  async clearAll(): Promise<void> {
    if (!this.isConfigured) return

    try {
      await Promise.all([
        this.deletePattern(`${CACHE_KEYS.PROJECT}*`),
        this.deletePattern(`${CACHE_KEYS.PROJECTS_LIST}*`),
        this.deletePattern(`${CACHE_KEYS.MESSAGES}*`),
        this.deletePattern(`${CACHE_KEYS.CONTEXT}*`),
      ])
      console.log("[CacheManager] Cleared all caches")
    } catch (error) {
      console.error("[CacheManager] Failed to clear all caches:", error)
    }
  }

  // ===========================================================================
  // Health & Stats
  // ===========================================================================

  /**
   * Check cache health
   */
  async getStats(): Promise<CacheStats> {
    if (!this.isConfigured) {
      return {
        connected: false,
        status: "disabled",
        message: "Vercel KV not configured (optional)",
      }
    }

    try {
      // Test connection with a simple ping
      await kv.set("__cache_health__", "ok", { ex: 1 })
      return {
        connected: true,
        status: "healthy",
      }
    } catch (error) {
      return {
        connected: false,
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let cacheManagerInstance: CacheManager | null = null

/**
 * Get the singleton CacheManager instance
 */
export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager()
  }
  return cacheManagerInstance
}

// =============================================================================
// Backward Compatibility Exports
// =============================================================================

// These match the old cache.ts exports for backward compatibility

export const projectCache = {
  async get(projectId: string) {
    return getCacheManager().getProject(projectId)
  },
  async set(projectId: string, data: any) {
    await getCacheManager().setProject(projectId, data)
  },
  async invalidate(projectId: string) {
    await getCacheManager().invalidateProjectCache(projectId)
  },
}

export const projectsListCache = {
  async get(filters: { starred?: boolean; limit?: number; offset?: number }) {
    return getCacheManager().getProjectsList(filters)
  },
  async set(filters: { starred?: boolean; limit?: number; offset?: number }, data: any) {
    await getCacheManager().setProjectsList(filters, data)
  },
  async invalidate() {
    await getCacheManager().invalidateProjectsListCache()
  },
}

export const messagesCache = {
  async get(projectId: string) {
    return getCacheManager().getMessages(projectId)
  },
  async set(projectId: string, data: any) {
    await getCacheManager().setMessages(projectId, data)
  },
  async invalidate(projectId: string) {
    await getCacheManager().invalidateMessagesCache(projectId)
  },
}

export async function invalidateProjectCache(projectId: string): Promise<void> {
  await getCacheManager().invalidateAllForProject(projectId)
}

export async function getCacheStats() {
  return getCacheManager().getStats()
}
