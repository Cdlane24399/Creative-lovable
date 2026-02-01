/**
 * Cache Module (DEPRECATED)
 *
 * @deprecated This file is maintained for backward compatibility only.
 * It will be removed in a future major version.
 *
 * ## Migration Guide
 *
 * Replace imports from this file with the new cache manager:
 *
 * ### Before:
 * ```typescript
 * import { projectCache, invalidateProjectCache } from "@/lib/cache"
 * ```
 *
 * ### After:
 * ```typescript
 * import { getCacheManager } from "@/lib/cache/cache-manager"
 *
 * const cache = getCacheManager()
 * const project = await cache.projects.get(projectId)
 * await cache.projects.invalidate(projectId)
 * ```
 *
 * ## New Cache Manager Features
 * - Redis integration with LRU fallback
 * - Structured event system
 * - Better TypeScript support
 * - Configurable TTL per cache type
 *
 * @see lib/cache/cache-manager.ts For the new implementation
 * @see lib/cache/README.md For detailed documentation
 */

export {
  projectCache,
  projectsListCache,
  messagesCache,
  invalidateProjectCache,
  getCacheStats,
} from "./cache/cache-manager"