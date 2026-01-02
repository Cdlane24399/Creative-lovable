/**
 * Sandbox State Machine
 * 
 * Manages sandbox lifecycle with proper state transitions.
 * Replaces ad-hoc if/else logic with a formal state machine.
 * 
 * States:
 * - idle: No sandbox exists
 * - creating: Sandbox is being created
 * - active: Sandbox is running and ready
 * - paused: Sandbox is paused (state preserved)
 * - expired: Sandbox has expired/timed out
 * - error: Sandbox is in error state
 * 
 * Usage:
 * ```typescript
 * const machine = getSandboxStateMachine()
 * 
 * // Create a new sandbox
 * await machine.transition(projectId, 'CREATE')
 * 
 * // Check current state
 * const state = machine.getState(projectId)
 * 
 * // Subscribe to state changes
 * machine.onStateChange(projectId, (newState, oldState) => {
 *   console.log(`Sandbox ${projectId} transitioned from ${oldState} to ${newState}`)
 * })
 * ```
 */

import type { Sandbox } from "e2b"

// =============================================================================
// Types
// =============================================================================

/**
 * Possible sandbox states
 */
export type SandboxState = 
  | "idle"      // No sandbox exists
  | "creating"  // Sandbox is being created
  | "active"    // Sandbox is running and ready
  | "paused"    // Sandbox is paused (state preserved)
  | "expired"   // Sandbox has expired/timed out
  | "error"     // Sandbox is in error state

/**
 * Events that can trigger state transitions
 */
export type SandboxEvent = 
  | "CREATE"    // Start creating a sandbox
  | "CREATED"   // Sandbox was created successfully
  | "PAUSE"     // Pause the sandbox
  | "PAUSED"    // Sandbox was paused successfully
  | "RESUME"    // Resume a paused sandbox
  | "RESUMED"   // Sandbox was resumed successfully
  | "EXPIRE"    // Sandbox has expired
  | "ERROR"     // An error occurred
  | "RETRY"     // Retry after error
  | "CLEANUP"   // Clean up the sandbox

/**
 * State machine transition map
 */
type TransitionMap = {
  [K in SandboxState]: Partial<Record<SandboxEvent, SandboxState>>
}

/**
 * Sandbox context with metadata
 */
export interface SandboxContext {
  projectId: string
  state: SandboxState
  sandboxId?: string
  sandboxUrl?: string
  error?: string
  lastActivity: Date
  createdAt?: Date
  pausedAt?: Date
  retryCount: number
}

/**
 * State change handler
 */
export type StateChangeHandler = (
  newState: SandboxState,
  oldState: SandboxState,
  context: SandboxContext
) => void

// =============================================================================
// State Machine Definition
// =============================================================================

/**
 * Valid state transitions
 */
const transitions: TransitionMap = {
  idle: {
    CREATE: "creating",
  },
  creating: {
    CREATED: "active",
    ERROR: "error",
  },
  active: {
    PAUSE: "paused",
    EXPIRE: "expired",
    ERROR: "error",
    CLEANUP: "idle",
  },
  paused: {
    RESUME: "active",
    EXPIRE: "expired",
    CLEANUP: "idle",
  },
  expired: {
    CREATE: "creating",  // Recreate after expiration
    CLEANUP: "idle",
  },
  error: {
    RETRY: "creating",
    CLEANUP: "idle",
  },
}

/**
 * Maximum retry attempts before giving up
 */
const MAX_RETRIES = 3

// =============================================================================
// State Machine Implementation
// =============================================================================

export class SandboxStateMachine {
  private contexts: Map<string, SandboxContext> = new Map()
  private handlers: Map<string, StateChangeHandler[]> = new Map()

  /**
   * Get or create context for a project
   */
  private getContext(projectId: string): SandboxContext {
    let context = this.contexts.get(projectId)
    if (!context) {
      context = {
        projectId,
        state: "idle",
        lastActivity: new Date(),
        retryCount: 0,
      }
      this.contexts.set(projectId, context)
    }
    return context
  }

  /**
   * Get current state for a project
   */
  getState(projectId: string): SandboxState {
    return this.getContext(projectId).state
  }

  /**
   * Get full context for a project
   */
  getFullContext(projectId: string): SandboxContext {
    return { ...this.getContext(projectId) }
  }

  /**
   * Check if a transition is valid
   */
  canTransition(projectId: string, event: SandboxEvent): boolean {
    const context = this.getContext(projectId)
    const nextState = transitions[context.state][event]
    return nextState !== undefined
  }

  /**
   * Get available events for current state
   */
  getAvailableEvents(projectId: string): SandboxEvent[] {
    const context = this.getContext(projectId)
    return Object.keys(transitions[context.state]) as SandboxEvent[]
  }

  /**
   * Perform a state transition
   */
  transition(
    projectId: string,
    event: SandboxEvent,
    data?: Partial<SandboxContext>
  ): { success: boolean; state: SandboxState; error?: string } {
    const context = this.getContext(projectId)
    const oldState = context.state
    const nextState = transitions[oldState][event]

    // Invalid transition
    if (nextState === undefined) {
      return {
        success: false,
        state: oldState,
        error: `Invalid transition: ${oldState} + ${event}`,
      }
    }

    // Check retry limit for ERROR -> RETRY
    if (event === "RETRY" && context.retryCount >= MAX_RETRIES) {
      return {
        success: false,
        state: "error",
        error: `Max retries (${MAX_RETRIES}) exceeded`,
      }
    }

    // Update context
    const updatedContext: SandboxContext = {
      ...context,
      ...data,
      state: nextState,
      lastActivity: new Date(),
    }

    // Track specific state data
    switch (nextState) {
      case "creating":
        if (event === "RETRY") {
          updatedContext.retryCount = context.retryCount + 1
        } else {
          updatedContext.retryCount = 0
        }
        break
      case "active":
        updatedContext.createdAt = updatedContext.createdAt || new Date()
        break
      case "paused":
        updatedContext.pausedAt = new Date()
        break
      case "error":
        // Error is passed in data
        break
      case "idle":
        // Reset everything
        updatedContext.sandboxId = undefined
        updatedContext.sandboxUrl = undefined
        updatedContext.error = undefined
        updatedContext.createdAt = undefined
        updatedContext.pausedAt = undefined
        updatedContext.retryCount = 0
        break
    }

    this.contexts.set(projectId, updatedContext)

    // Notify handlers
    this.notifyHandlers(projectId, nextState, oldState, updatedContext)

    return {
      success: true,
      state: nextState,
    }
  }

  /**
   * Subscribe to state changes for a project
   */
  onStateChange(projectId: string, handler: StateChangeHandler): () => void {
    const handlers = this.handlers.get(projectId) || []
    handlers.push(handler)
    this.handlers.set(projectId, handlers)

    // Return unsubscribe function
    return () => {
      const currentHandlers = this.handlers.get(projectId) || []
      this.handlers.set(
        projectId,
        currentHandlers.filter(h => h !== handler)
      )
    }
  }

  /**
   * Notify all handlers of state change
   */
  private notifyHandlers(
    projectId: string,
    newState: SandboxState,
    oldState: SandboxState,
    context: SandboxContext
  ): void {
    const handlers = this.handlers.get(projectId) || []
    for (const handler of handlers) {
      try {
        handler(newState, oldState, context)
      } catch (error) {
        console.error(`[SandboxStateMachine] Handler error:`, error)
      }
    }
  }

  /**
   * Mark sandbox as created
   */
  markCreated(projectId: string, sandboxId: string, sandboxUrl?: string): void {
    this.transition(projectId, "CREATED", {
      sandboxId,
      sandboxUrl,
    })
  }

  /**
   * Mark sandbox as having an error
   */
  markError(projectId: string, error: string): void {
    this.transition(projectId, "ERROR", { error })
  }

  /**
   * Mark sandbox as expired
   */
  markExpired(projectId: string): void {
    this.transition(projectId, "EXPIRE")
  }

  /**
   * Cleanup a sandbox
   */
  cleanup(projectId: string): void {
    this.transition(projectId, "CLEANUP")
    this.handlers.delete(projectId)
    this.contexts.delete(projectId)
  }

  /**
   * Check if sandbox is in a ready state
   */
  isReady(projectId: string): boolean {
    return this.getState(projectId) === "active"
  }

  /**
   * Check if sandbox can be used (active or can be created)
   */
  isUsable(projectId: string): boolean {
    const state = this.getState(projectId)
    return state === "active" || state === "idle" || state === "expired"
  }

  /**
   * Get all sandbox contexts (for monitoring)
   */
  getAllContexts(): Map<string, SandboxContext> {
    return new Map(this.contexts)
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    total: number
    byState: Record<SandboxState, number>
  } {
    const byState: Record<SandboxState, number> = {
      idle: 0,
      creating: 0,
      active: 0,
      paused: 0,
      expired: 0,
      error: 0,
    }

    for (const context of this.contexts.values()) {
      byState[context.state]++
    }

    return {
      total: this.contexts.size,
      byState,
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let stateMachineInstance: SandboxStateMachine | null = null

/**
 * Get the singleton SandboxStateMachine instance
 */
export function getSandboxStateMachine(): SandboxStateMachine {
  if (!stateMachineInstance) {
    stateMachineInstance = new SandboxStateMachine()
  }
  return stateMachineInstance
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if we should attempt to create/reconnect a sandbox
 */
export function shouldAttemptConnection(projectId: string): boolean {
  const machine = getSandboxStateMachine()
  const state = machine.getState(projectId)
  
  return state === "idle" || state === "expired" || 
    (state === "error" && machine.getFullContext(projectId).retryCount < MAX_RETRIES)
}

/**
 * Check if sandbox needs restoration
 */
export function needsRestoration(projectId: string): boolean {
  const machine = getSandboxStateMachine()
  const state = machine.getState(projectId)
  
  return state === "expired"
}

/**
 * Utility to wait for sandbox to be ready
 */
export function waitForReady(
  projectId: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  return new Promise((resolve) => {
    const machine = getSandboxStateMachine()
    
    // Already ready
    if (machine.isReady(projectId)) {
      resolve(true)
      return
    }

    // Set timeout
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve(false)
    }, timeoutMs)

    // Subscribe to changes
    const unsubscribe = machine.onStateChange(projectId, (newState) => {
      if (newState === "active") {
        clearTimeout(timeout)
        unsubscribe()
        resolve(true)
      } else if (newState === "error" || newState === "idle") {
        clearTimeout(timeout)
        unsubscribe()
        resolve(false)
      }
    })
  })
}
