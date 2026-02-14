import { logger } from "@/lib/logger";
/**
 * Unified Cache Manager
 *
 * Centralized cache management with:
 * - Consistent TTLs across cache types
 * - Unified invalidation logic
 * - Event emission for cache operations
 * - In-memory LRU fallback when Redis not configured
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

import { Redis } from "@upstash/redis";

// =============================================================================
// Configuration
// =============================================================================

/** Cache TTL in seconds - Production-appropriate values */
const CACHE_TTL = {
  PROJECT: 300, // 5 minutes for project data (was 60s)
  PROJECTS_LIST: 180, // 3 minutes for project lists (was 60s)
  MESSAGES: 300, // 5 minutes for messages (append-only, invalidated on save)
  CONTEXT: 600, // 10 minutes for context (was 120s)
} as const;

/** Cache key prefixes */
const CACHE_KEYS = {
  PROJECT: "project:",
  PROJECTS_LIST: "projects:list:",
  MESSAGES: "messages:",
  CONTEXT: "context:",
} as const;

/** Max entries for in-memory LRU cache */
const LRU_MAX_ENTRIES = 500;

type RedisConnectionConfig = {
  url: string;
  token: string;
};

const getRedisConfig = (): RedisConnectionConfig | null => {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    return { url: upstashUrl, token: upstashToken };
  }

  const redisUrl = process.env.REDIS_URL;
  const redisToken = process.env.REDIS_TOKEN;

  if (redisUrl && redisToken) {
    return { url: redisUrl, token: redisToken };
  }

  return null;
};

// =============================================================================
// In-Memory LRU Cache (Fallback)
// =============================================================================

interface LRUEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple LRU cache implementation for fallback when Redis is unavailable
 */
class LRUCache {
  private cache = new Map<string, LRUEntry<unknown>>();
  private readonly maxSize: number;

  constructor(maxSize: number = LRU_MAX_ENTRIES) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value as T;
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deletePattern(pattern: string): number {
    // Optimize for common prefix* patterns by using startsWith instead of regex
    const isSimplePrefix =
      pattern.endsWith("*") && !pattern.slice(0, -1).includes("*");
    const prefix = isSimplePrefix ? pattern.slice(0, -1) : "";
    let count = 0;

    for (const key of this.cache.keys()) {
      const matches = isSimplePrefix
        ? key.startsWith(prefix)
        : new RegExp("^" + pattern.replace(/\*/g, ".*") + "$").test(key);
      if (matches) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// =============================================================================
// Types
// =============================================================================

export interface CacheStats {
  connected: boolean;
  status: "healthy" | "unhealthy" | "disabled";
  message?: string;
  error?: string;
}

export interface CacheEvent {
  type: "get" | "set" | "delete" | "invalidate";
  key: string;
  success: boolean;
  timestamp: Date;
}

type CacheEventHandler = (event: CacheEvent) => void;

// =============================================================================
// Cache Manager Implementation
// =============================================================================

export class CacheManager {
  private readonly isConfigured: boolean;
  private readonly redisConfig: RedisConnectionConfig | null;
  private redisClient: Redis | null = null;
  private readonly lruCache: LRUCache;
  private eventHandlers: CacheEventHandler[] = [];

  constructor() {
    this.redisConfig = getRedisConfig();
    this.isConfigured = !!this.redisConfig;
    // Always create LRU cache as fallback
    this.lruCache = new LRUCache(LRU_MAX_ENTRIES);
  }

  /**
   * Check if Redis cache is configured (LRU fallback always available)
   */
  get enabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Check if cache is functional (Redis or LRU fallback)
   */
  get available(): boolean {
    return true; // LRU fallback always available
  }

  /**
   * Subscribe to cache events
   */
  onEvent(handler: CacheEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Emit a cache event
   */
  private emit(event: Omit<CacheEvent, "timestamp">): void {
    const fullEvent = { ...event, timestamp: new Date() };
    this.eventHandlers.forEach((handler) => {
      try {
        handler(fullEvent);
      } catch (e) {
        logger.warn("[CacheManager] Event handler error", {}, e);
      }
    });
  }

  private getRedisClient(): Redis {
    if (!this.redisConfig) {
      throw new Error("Redis not configured");
    }

    if (!this.redisClient) {
      this.redisClient = new Redis(this.redisConfig);
    }

    return this.redisClient;
  }

  /**
   * Get the raw Redis client for atomic operations (e.g. INCR for rate limiting).
   * Returns null when Redis is not configured.
   */
  getRedisClientForAtomicOps(): Redis | null {
    if (!this.isConfigured) return null;
    try {
      return this.getRedisClient();
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Generic Cache Operations
  // ===========================================================================

  /**
   * Get a value from cache (Redis or LRU fallback)
   */
  private async get<T>(key: string): Promise<T | null> {
    // Try Redis first if configured
    if (this.isConfigured) {
      try {
        const redis = this.getRedisClient();
        const data = await redis.get(key);
        this.emit({ type: "get", key, success: true });
        if (data !== null) {
          return data as T;
        }
      } catch (error) {
        logger.warn("[CacheManager] Redis get failed, using LRU fallback", { key }, error);
      }
    }

    // Fallback to LRU
    const lruData = this.lruCache.get<T>(key);
    this.emit({ type: "get", key, success: lruData !== null });
    return lruData;
  }

  /**
   * Set a value in cache (Redis and LRU)
   */
  private async set(key: string, value: unknown, ttl: number): Promise<void> {
    // Always set in LRU
    this.lruCache.set(key, value, ttl);

    // Also try Redis if configured
    if (this.isConfigured) {
      try {
        const redis = this.getRedisClient();
        await redis.set(key, value, { ex: ttl });
        this.emit({ type: "set", key, success: true });
      } catch (error) {
        logger.warn("[CacheManager] Redis set failed", { key }, error);
        this.emit({ type: "set", key, success: false });
      }
    } else {
      this.emit({ type: "set", key, success: true });
    }
  }

  /**
   * Delete a value from cache (Redis and LRU)
   */
  private async delete(key: string): Promise<void> {
    // Always delete from LRU
    this.lruCache.delete(key);

    // Also try Redis if configured
    if (this.isConfigured) {
      try {
        const redis = this.getRedisClient();
        await redis.del(key);
        this.emit({ type: "delete", key, success: true });
      } catch (error) {
        logger.warn("[CacheManager] Redis delete failed", { key }, error);
        this.emit({ type: "delete", key, success: false });
      }
    } else {
      this.emit({ type: "delete", key, success: true });
    }
  }

  /**
   * Delete all keys matching a pattern (Redis and LRU)
   * Uses SCAN instead of KEYS to avoid blocking Redis server
   */
  private async deletePattern(pattern: string): Promise<number> {
    // Always delete from LRU
    const lruCount = this.lruCache.deletePattern(pattern);

    // Also try Redis if configured
    if (this.isConfigured) {
      try {
        const redis = this.getRedisClient();
        let totalDeleted = 0;
        let cursor = 0;

        // Use SCAN with cursor iteration instead of KEYS (which blocks Redis)
        do {
          const [nextCursor, keys] = await redis.scan(cursor, {
            match: pattern,
            count: 100,
          });
          cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;
          if (keys.length > 0) {
            await redis.del(...keys);
            totalDeleted += keys.length;
          }
        } while (cursor !== 0);

        return Math.max(totalDeleted, lruCount);
      } catch (error) {
        logger.warn("[CacheManager] Redis delete pattern failed", { pattern }, error);
        return lruCount;
      }
    }

    return lruCount;
  }

  // ===========================================================================
  // Project Cache Operations
  // ===========================================================================

  /**
   * Get cached project data
   */
  async getProject(projectId: string): Promise<{ project: unknown } | null> {
    return this.get(`${CACHE_KEYS.PROJECT}${projectId}`);
  }

  /**
   * Cache project data
   */
  async setProject(
    projectId: string,
    data: { project: unknown },
  ): Promise<void> {
    await this.set(
      `${CACHE_KEYS.PROJECT}${projectId}`,
      data,
      CACHE_TTL.PROJECT,
    );
  }

  /**
   * Invalidate project cache
   */
  async invalidateProjectCache(projectId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.PROJECT}${projectId}`);
    this.emit({
      type: "invalidate",
      key: `project:${projectId}`,
      success: true,
    });
  }

  // ===========================================================================
  // Projects List Cache Operations
  // ===========================================================================

  /**
   * Get cached projects list
   */
  async getProjectsList(filters: {
    starred?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ projects: unknown[] } | null> {
    const key = `${CACHE_KEYS.PROJECTS_LIST}${JSON.stringify(filters)}`;
    return this.get(key);
  }

  /**
   * Cache projects list
   */
  async setProjectsList(
    filters: { starred?: boolean; limit?: number; offset?: number },
    data: { projects: unknown[] },
  ): Promise<void> {
    const key = `${CACHE_KEYS.PROJECTS_LIST}${JSON.stringify(filters)}`;
    await this.set(key, data, CACHE_TTL.PROJECTS_LIST);
  }

  /**
   * Invalidate all projects list caches
   */
  async invalidateProjectsListCache(): Promise<void> {
    await this.deletePattern(`${CACHE_KEYS.PROJECTS_LIST}*`);
    this.emit({ type: "invalidate", key: "projects:list:*", success: true });
  }

  // ===========================================================================
  // Messages Cache Operations
  // ===========================================================================

  /**
   * Get cached messages for a project
   */
  async getMessages(projectId: string): Promise<unknown[] | null> {
    return this.get(`${CACHE_KEYS.MESSAGES}${projectId}`);
  }

  /**
   * Cache messages for a project
   */
  async setMessages(projectId: string, messages: unknown[]): Promise<void> {
    await this.set(
      `${CACHE_KEYS.MESSAGES}${projectId}`,
      messages,
      CACHE_TTL.MESSAGES,
    );
  }

  /**
   * Invalidate messages cache for a project
   */
  async invalidateMessagesCache(projectId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.MESSAGES}${projectId}`);
    this.emit({
      type: "invalidate",
      key: `messages:${projectId}`,
      success: true,
    });
  }

  // ===========================================================================
  // Context Cache Operations
  // ===========================================================================

  /**
   * Get cached context for a project
   */
  async getContext(projectId: string): Promise<unknown | null> {
    return this.get(`${CACHE_KEYS.CONTEXT}${projectId}`);
  }

  /**
   * Cache context for a project
   */
  async setContext(projectId: string, context: unknown): Promise<void> {
    await this.set(
      `${CACHE_KEYS.CONTEXT}${projectId}`,
      context,
      CACHE_TTL.CONTEXT,
    );
  }

  /**
   * Invalidate context cache for a project
   */
  async invalidateContextCache(projectId: string): Promise<void> {
    await this.delete(`${CACHE_KEYS.CONTEXT}${projectId}`);
    this.emit({
      type: "invalidate",
      key: `context:${projectId}`,
      success: true,
    });
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
    ]);

    logger.info("[CacheManager] Invalidated all caches for project", { projectId });
  }

  /**
   * Clear all caches (use with caution)
   */
  async clearAll(): Promise<void> {
    if (!this.isConfigured) return;

    try {
      await Promise.all([
        this.deletePattern(`${CACHE_KEYS.PROJECT}*`),
        this.deletePattern(`${CACHE_KEYS.PROJECTS_LIST}*`),
        this.deletePattern(`${CACHE_KEYS.MESSAGES}*`),
        this.deletePattern(`${CACHE_KEYS.CONTEXT}*`),
      ]);
      logger.info("[CacheManager] Cleared all caches");
    } catch (error) {
      logger.error("[CacheManager] Failed to clear all caches", {}, error);
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
        message: "Redis not configured (optional)",
      };
    }

    try {
      // Test connection with a simple ping
      const redis = this.getRedisClient();
      await redis.set("__cache_health__", "ok", { ex: 1 });
      return {
        connected: true,
        status: "healthy",
      };
    } catch (error) {
      return {
        connected: false,
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let cacheManagerInstance: CacheManager | null = null;

/**
 * Get the singleton CacheManager instance
 */
export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();
  }
  return cacheManagerInstance;
}

// =============================================================================
// Backward Compatibility Exports
// =============================================================================

// These match the old cache.ts exports for backward compatibility

export const projectCache = {
  async get(projectId: string) {
    return getCacheManager().getProject(projectId);
  },
  async set(projectId: string, data: { project: unknown }) {
    await getCacheManager().setProject(projectId, data);
  },
  async invalidate(projectId: string) {
    await getCacheManager().invalidateProjectCache(projectId);
  },
};

export const projectsListCache = {
  async get(filters: { starred?: boolean; limit?: number; offset?: number }) {
    return getCacheManager().getProjectsList(filters);
  },
  async set(
    filters: { starred?: boolean; limit?: number; offset?: number },
    data: { projects: unknown[] },
  ) {
    await getCacheManager().setProjectsList(filters, data);
  },
  async invalidate() {
    await getCacheManager().invalidateProjectsListCache();
  },
};

export const messagesCache = {
  async get(projectId: string) {
    return getCacheManager().getMessages(projectId);
  },
  async set(projectId: string, data: unknown[]) {
    await getCacheManager().setMessages(projectId, data);
  },
  async invalidate(projectId: string) {
    await getCacheManager().invalidateMessagesCache(projectId);
  },
};

export async function invalidateProjectCache(projectId: string): Promise<void> {
  await getCacheManager().invalidateAllForProject(projectId);
}

export async function getCacheStats() {
  return getCacheManager().getStats();
}
