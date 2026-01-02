/**
 * Cache Layer Index
 * 
 * Unified cache management exports.
 * Use CacheManager for new code, backward-compatible exports for existing code.
 */

export {
  CacheManager,
  getCacheManager,
  // Backward-compatible exports
  projectCache,
  projectsListCache,
  messagesCache,
  invalidateProjectCache,
  getCacheStats,
  type CacheStats,
  type CacheEvent,
} from "./cache-manager"
