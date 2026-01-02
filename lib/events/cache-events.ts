/**
 * Cache Event Bus
 *
 * Provides a centralized event system for cache invalidation and
 * state synchronization across different parts of the application.
 *
 * Features:
 * - Type-safe event emission and subscription
 * - Event filtering by type, project, or sandbox
 * - Async event handlers
 * - Event history for debugging
 */

import type {
  CacheEvent,
  CacheEventHandler,
  EventSubscription,
  EventFilter,
} from "./types"
import { eventMatchesFilter } from "./types"

// Re-export types and helpers
export * from "./types"

// =============================================================================
// Event Bus Configuration
// =============================================================================

/** Maximum number of events to keep in history */
const MAX_EVENT_HISTORY = 100

/** Enable debug logging */
const DEBUG = process.env.NODE_ENV === "development"

// =============================================================================
// Event Bus State
// =============================================================================

/** All registered event handlers */
const handlers = new Map<symbol, { handler: CacheEventHandler; filter?: EventFilter }>()

/** Event history for debugging */
const eventHistory: CacheEvent[] = []

/** Handler execution stats */
const handlerStats = new Map<symbol, { calls: number; errors: number; lastCall?: number }>()

// =============================================================================
// Event Emission
// =============================================================================

/**
 * Emit a cache event to all registered handlers
 */
export async function emitCacheEvent(event: CacheEvent): Promise<void> {
  if (DEBUG) {
    console.log(`[cache-events] Emitting ${event.type} for project ${event.projectId}`)
  }

  // Add to history
  eventHistory.push(event)
  if (eventHistory.length > MAX_EVENT_HISTORY) {
    eventHistory.shift()
  }

  // Call all matching handlers
  const promises: Promise<void>[] = []

  for (const [id, { handler, filter }] of handlers) {
    // Check if event matches filter
    if (filter && !eventMatchesFilter(event, filter)) {
      continue
    }

    // Track stats
    const stats = handlerStats.get(id) || { calls: 0, errors: 0 }
    stats.calls++
    stats.lastCall = Date.now()
    handlerStats.set(id, stats)

    // Execute handler
    const promise = Promise.resolve()
      .then(() => handler(event))
      .catch((error) => {
        console.error(`[cache-events] Handler error for ${event.type}:`, error)
        stats.errors++
      })

    promises.push(promise)
  }

  // Wait for all handlers to complete
  await Promise.allSettled(promises)
}

/**
 * Emit multiple events in sequence
 */
export async function emitCacheEvents(events: CacheEvent[]): Promise<void> {
  for (const event of events) {
    await emitCacheEvent(event)
  }
}

/**
 * Emit event without waiting for handlers (fire-and-forget)
 */
export function emitCacheEventAsync(event: CacheEvent): void {
  emitCacheEvent(event).catch((error) => {
    console.error(`[cache-events] Async emit error:`, error)
  })
}

// =============================================================================
// Event Subscription
// =============================================================================

/**
 * Subscribe to cache events
 */
export function onCacheEvent(
  handler: CacheEventHandler,
  filter?: EventFilter
): EventSubscription {
  const id = Symbol("cache-event-handler")

  handlers.set(id, { handler, filter })
  handlerStats.set(id, { calls: 0, errors: 0 })

  return {
    unsubscribe: () => {
      handlers.delete(id)
      handlerStats.delete(id)
    },
  }
}

/**
 * Subscribe to a specific event type
 */
export function onCacheEventType<T extends CacheEvent["type"]>(
  type: T,
  handler: CacheEventHandler<Extract<CacheEvent, { type: T }>>,
  additionalFilter?: Omit<EventFilter, "types">
): EventSubscription {
  return onCacheEvent(
    handler as CacheEventHandler,
    { ...additionalFilter, types: [type] }
  )
}

/**
 * Subscribe to events for a specific project
 */
export function onProjectEvents(
  projectId: string,
  handler: CacheEventHandler,
  types?: CacheEvent["type"][]
): EventSubscription {
  return onCacheEvent(handler, { projectIds: [projectId], types })
}

/**
 * Subscribe to events for a specific sandbox
 */
export function onSandboxEvents(
  sandboxId: string,
  handler: CacheEventHandler,
  types?: CacheEvent["type"][]
): EventSubscription {
  return onCacheEvent(handler, { sandboxIds: [sandboxId], types })
}

/**
 * Subscribe to an event once, then automatically unsubscribe
 */
export function onceCacheEvent(
  handler: CacheEventHandler,
  filter?: EventFilter
): EventSubscription {
  const subscription = onCacheEvent(
    async (event) => {
      subscription.unsubscribe()
      await handler(event)
    },
    filter
  )
  return subscription
}

// =============================================================================
// Event History & Debugging
// =============================================================================

/**
 * Get recent event history
 */
export function getEventHistory(limit?: number): readonly CacheEvent[] {
  const events = [...eventHistory]
  if (limit && limit < events.length) {
    return events.slice(-limit)
  }
  return events
}

/**
 * Get events for a specific project
 */
export function getProjectEventHistory(
  projectId: string,
  limit?: number
): CacheEvent[] {
  const events = eventHistory.filter((e) => e.projectId === projectId)
  if (limit && limit < events.length) {
    return events.slice(-limit)
  }
  return events
}

/**
 * Get handler statistics
 */
export function getHandlerStats(): Map<string, { calls: number; errors: number; lastCall?: number }> {
  const stats = new Map<string, { calls: number; errors: number; lastCall?: number }>()
  let index = 0
  for (const [, stat] of handlerStats) {
    stats.set(`handler-${index++}`, stat)
  }
  return stats
}

/**
 * Get number of registered handlers
 */
export function getHandlerCount(): number {
  return handlers.size
}

/**
 * Clear event history
 */
export function clearEventHistory(): void {
  eventHistory.length = 0
}

/**
 * Remove all handlers (for testing)
 */
export function clearAllHandlers(): void {
  handlers.clear()
  handlerStats.clear()
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Wait for a specific event to occur
 */
export function waitForEvent(
  filter: EventFilter,
  timeoutMs?: number
): Promise<CacheEvent> {
  return new Promise((resolve, reject) => {
    let timeoutId: NodeJS.Timeout | undefined

    const subscription = onCacheEvent(
      (event) => {
        if (timeoutId) clearTimeout(timeoutId)
        subscription.unsubscribe()
        resolve(event)
      },
      filter
    )

    if (timeoutMs) {
      timeoutId = setTimeout(() => {
        subscription.unsubscribe()
        reject(new Error(`Timeout waiting for event: ${JSON.stringify(filter)}`))
      }, timeoutMs)
    }
  })
}

/**
 * Collect events for a duration
 */
export async function collectEvents(
  filter: EventFilter,
  durationMs: number
): Promise<CacheEvent[]> {
  const collected: CacheEvent[] = []

  const subscription = onCacheEvent(
    (event) => {
      collected.push(event)
    },
    filter
  )

  await new Promise((resolve) => setTimeout(resolve, durationMs))

  subscription.unsubscribe()
  return collected
}

// =============================================================================
// Integration Helpers
// =============================================================================

/**
 * Create a debounced event emitter
 * Useful for batching rapid events
 */
export function createDebouncedEmitter(
  debounceMs: number
): {
  emit: (event: CacheEvent) => void
  flush: () => Promise<void>
} {
  const pending = new Map<string, CacheEvent>()
  let timeoutId: NodeJS.Timeout | undefined

  const flush = async () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }

    const events = Array.from(pending.values())
    pending.clear()

    for (const event of events) {
      await emitCacheEvent(event)
    }
  }

  const emit = (event: CacheEvent) => {
    // Use projectId + type as key to dedupe
    const key = `${event.projectId}:${event.type}`
    pending.set(key, event)

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(flush, debounceMs)
  }

  return { emit, flush }
}

/**
 * Create a throttled event emitter
 * Emits at most once per interval
 */
export function createThrottledEmitter(
  intervalMs: number
): {
  emit: (event: CacheEvent) => void
  reset: () => void
} {
  const lastEmitted = new Map<string, number>()

  const emit = (event: CacheEvent) => {
    const key = `${event.projectId}:${event.type}`
    const last = lastEmitted.get(key) || 0
    const now = Date.now()

    if (now - last >= intervalMs) {
      lastEmitted.set(key, now)
      emitCacheEventAsync(event)
    }
  }

  const reset = () => {
    lastEmitted.clear()
  }

  return { emit, reset }
}
