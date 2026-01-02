/**
 * Cache Module
 * 
 * @deprecated This file is maintained for backward compatibility.
 * Use the new cache manager from lib/cache instead:
 * 
 * ```typescript
 * import { getCacheManager } from "@/lib/cache"
 * ```
 */

export {
  projectCache,
  projectsListCache,
  messagesCache,
  invalidateProjectCache,
  getCacheStats,
} from "./cache/cache-manager"