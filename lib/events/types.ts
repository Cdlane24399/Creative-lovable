/**
 * Event System Type Definitions
 *
 * Provides typed events for cache invalidation and state synchronization
 * across different parts of the application.
 */

// =============================================================================
// Cache Event Types
// =============================================================================

/**
 * Event emitted when a project is updated
 */
export interface ProjectUpdatedEvent {
  type: "PROJECT_UPDATED"
  projectId: string
  fields?: string[] // Which fields were updated
  timestamp: number
}

/**
 * Event emitted when sandbox state changes
 */
export interface SandboxStateChangedEvent {
  type: "SANDBOX_STATE_CHANGED"
  projectId: string
  sandboxId?: string
  state: "created" | "connected" | "disconnected" | "destroyed" | "paused" | "resumed"
  timestamp: number
}

/**
 * Event emitted when dev server state changes
 */
export interface DevServerStateEvent {
  type: "DEV_SERVER_STATE"
  projectId: string
  isRunning: boolean
  port?: number
  url?: string
  timestamp: number
}

/**
 * Event emitted when files change in a sandbox
 */
export interface FilesChangedEvent {
  type: "FILES_CHANGED"
  projectId: string
  sandboxId?: string
  paths: string[]
  action: "created" | "updated" | "deleted" | "synced"
  timestamp: number
}

/**
 * Event emitted when agent context changes
 */
export interface ContextChangedEvent {
  type: "CONTEXT_CHANGED"
  projectId: string
  changes: Array<"files" | "dependencies" | "buildStatus" | "serverState" | "plan" | "taskGraph">
  timestamp: number
}

/**
 * Event emitted when a tool execution completes
 */
export interface ToolExecutionEvent {
  type: "TOOL_EXECUTION"
  projectId: string
  toolName: string
  success: boolean
  durationMs: number
  timestamp: number
}

/**
 * Event emitted when build status changes
 */
export interface BuildStatusEvent {
  type: "BUILD_STATUS"
  projectId: string
  hasErrors: boolean
  hasWarnings: boolean
  errorCount: number
  warningCount: number
  timestamp: number
}

/**
 * Union type of all cache events
 */
export type CacheEvent =
  | ProjectUpdatedEvent
  | SandboxStateChangedEvent
  | DevServerStateEvent
  | FilesChangedEvent
  | ContextChangedEvent
  | ToolExecutionEvent
  | BuildStatusEvent

/**
 * Event handler function type
 */
export type CacheEventHandler<T extends CacheEvent = CacheEvent> = (event: T) => void | Promise<void>

/**
 * Subscription object returned when subscribing to events
 */
export interface EventSubscription {
  unsubscribe: () => void
}

// =============================================================================
// Event Filter Types
// =============================================================================

/**
 * Filter options for subscribing to specific events
 */
export interface EventFilter {
  /** Filter by event type(s) */
  types?: CacheEvent["type"][]
  /** Filter by project ID(s) */
  projectIds?: string[]
  /** Filter by sandbox ID(s) */
  sandboxIds?: string[]
}

/**
 * Check if an event matches a filter
 */
export function eventMatchesFilter(event: CacheEvent, filter: EventFilter): boolean {
  // Check type filter
  if (filter.types && filter.types.length > 0) {
    if (!filter.types.includes(event.type)) {
      return false
    }
  }

  // Check project ID filter
  if (filter.projectIds && filter.projectIds.length > 0) {
    if (!filter.projectIds.includes(event.projectId)) {
      return false
    }
  }

  // Check sandbox ID filter (only for events that have sandboxId)
  if (filter.sandboxIds && filter.sandboxIds.length > 0) {
    const sandboxId = "sandboxId" in event ? event.sandboxId : undefined
    if (!sandboxId || !filter.sandboxIds.includes(sandboxId)) {
      return false
    }
  }

  return true
}

// =============================================================================
// Event Creation Helpers
// =============================================================================

/**
 * Create a project updated event
 */
export function createProjectUpdatedEvent(
  projectId: string,
  fields?: string[]
): ProjectUpdatedEvent {
  return {
    type: "PROJECT_UPDATED",
    projectId,
    fields,
    timestamp: Date.now(),
  }
}

/**
 * Create a sandbox state changed event
 */
export function createSandboxStateChangedEvent(
  projectId: string,
  state: SandboxStateChangedEvent["state"],
  sandboxId?: string
): SandboxStateChangedEvent {
  return {
    type: "SANDBOX_STATE_CHANGED",
    projectId,
    sandboxId,
    state,
    timestamp: Date.now(),
  }
}

/**
 * Create a dev server state event
 */
export function createDevServerStateEvent(
  projectId: string,
  isRunning: boolean,
  url?: string,
  port?: number
): DevServerStateEvent {
  return {
    type: "DEV_SERVER_STATE",
    projectId,
    isRunning,
    url,
    port,
    timestamp: Date.now(),
  }
}

/**
 * Create a files changed event
 */
export function createFilesChangedEvent(
  projectId: string,
  paths: string[],
  action: FilesChangedEvent["action"],
  sandboxId?: string
): FilesChangedEvent {
  return {
    type: "FILES_CHANGED",
    projectId,
    sandboxId,
    paths,
    action,
    timestamp: Date.now(),
  }
}

/**
 * Create a context changed event
 */
export function createContextChangedEvent(
  projectId: string,
  changes: ContextChangedEvent["changes"]
): ContextChangedEvent {
  return {
    type: "CONTEXT_CHANGED",
    projectId,
    changes,
    timestamp: Date.now(),
  }
}

/**
 * Create a tool execution event
 */
export function createToolExecutionEvent(
  projectId: string,
  toolName: string,
  success: boolean,
  durationMs: number
): ToolExecutionEvent {
  return {
    type: "TOOL_EXECUTION",
    projectId,
    toolName,
    success,
    durationMs,
    timestamp: Date.now(),
  }
}

/**
 * Create a build status event
 */
export function createBuildStatusEvent(
  projectId: string,
  hasErrors: boolean,
  hasWarnings: boolean,
  errorCount: number,
  warningCount: number
): BuildStatusEvent {
  return {
    type: "BUILD_STATUS",
    projectId,
    hasErrors,
    hasWarnings,
    errorCount,
    warningCount,
    timestamp: Date.now(),
  }
}
