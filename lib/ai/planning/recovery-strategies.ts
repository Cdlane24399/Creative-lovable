/**
 * Recovery Strategies for Task Graph Execution
 *
 * Provides intelligent recovery from task failures with:
 * - Multiple recovery strategy types
 * - Error pattern matching
 * - Configurable retry policies
 * - Rollback support
 */

import type { Task, TaskGraph } from "../context-types"
import type {
  RecoveryConfig,
  RecoveryDecision,
  RecoveryStrategyType,
  TaskExecutionResult,
} from "./types"
import { incrementRetryCount, resetTask, updateTaskStatus } from "./task-graph"
import { 
  calculateDelay as calculateDelayFromRetry,
  isTransientError as isTransientErrorFromRetry,
  isPermanentError as isPermanentErrorFromRetry 
} from "@/lib/utils/retry"

// =============================================================================
// Error Pattern Matching
// =============================================================================

/**
 * Error patterns and their recommended recovery strategies
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp
  strategy: RecoveryConfig
  description: string
}> = [
  // Network/timeout errors - retry with backoff
  {
    pattern: /timeout|ETIMEDOUT|ECONNREFUSED|network/i,
    strategy: { type: "retry", maxAttempts: 3, backoffMs: 2000, maxBackoffMs: 10000 },
    description: "Network/timeout error - retry with backoff",
  },
  // Rate limiting - retry with longer backoff
  {
    pattern: /rate.?limit|too.?many.?requests|429/i,
    strategy: { type: "retry", maxAttempts: 3, backoffMs: 5000, maxBackoffMs: 30000 },
    description: "Rate limiting - retry with longer backoff",
  },
  // Resource not found - skip
  {
    pattern: /not.?found|404|ENOENT/i,
    strategy: { type: "skip", markDependentsBlocked: true },
    description: "Resource not found - skip task",
  },
  // Permission errors - escalate
  {
    pattern: /permission|forbidden|403|EACCES/i,
    strategy: { type: "escalate", message: "Permission denied - manual intervention required" },
    description: "Permission error - escalate to user",
  },
  // Out of memory - abort
  {
    pattern: /out.?of.?memory|OOM|heap/i,
    strategy: { type: "abort", reason: "Out of memory" },
    description: "Out of memory - abort execution",
  },
  // Syntax/validation errors - skip (can't retry)
  {
    pattern: /syntax|parse|invalid|malformed/i,
    strategy: { type: "skip", markDependentsBlocked: true },
    description: "Syntax/validation error - skip task",
  },
]

/**
 * Match an error message to a recovery strategy
 */
export function matchErrorToStrategy(errorMessage: string): RecoveryConfig | null {
  for (const { pattern, strategy } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return strategy
    }
  }
  return null
}

// =============================================================================
// Recovery Strategy Selection
// =============================================================================

/**
 * Select the best recovery strategy for a failed task
 */
export function selectRecoveryStrategy(
  task: Task,
  result: TaskExecutionResult | undefined,
  graph: TaskGraph
): RecoveryDecision | null {
  const attemptedStrategies: RecoveryStrategyType[] = []
  const errorMessage = result?.error || task.error || ""

  // Check if max retries reached
  if (task.retryCount >= task.maxRetries) {
    // Can't retry anymore, try skip
    if (canSkipTask(task, graph)) {
      return {
        taskId: task.id,
        strategy: { type: "skip", markDependentsBlocked: true },
        reason: `Max retries (${task.maxRetries}) reached, skipping task`,
        attemptedStrategies: ["retry"],
      }
    }
    return null // Can't recover
  }

  // Try to match error pattern
  const patternMatch = matchErrorToStrategy(errorMessage)
  if (patternMatch) {
    return {
      taskId: task.id,
      strategy: patternMatch,
      reason: `Error pattern matched: ${errorMessage}`,
      attemptedStrategies,
    }
  }

  // Default: retry with exponential backoff
  const backoffMs = Math.min(
    1000 * Math.pow(2, task.retryCount),
    30000
  )

  return {
    taskId: task.id,
    strategy: {
      type: "retry",
      maxAttempts: task.maxRetries,
      backoffMs,
      maxBackoffMs: 30000,
    },
    reason: `Default retry strategy with ${backoffMs}ms backoff`,
    attemptedStrategies,
  }
}

/**
 * Check if a task can be safely skipped
 */
function canSkipTask(task: Task, graph: TaskGraph): boolean {
  // Check metadata for skip policy
  if (task.metadata?.canSkip === false) {
    return false
  }

  // Check if this is a critical task
  if (task.metadata?.critical === true) {
    return false
  }

  // By default, tasks can be skipped
  return true
}

// =============================================================================
// Recovery Execution
// =============================================================================

/**
 * Execute a recovery strategy
 */
export async function executeRecovery(
  graph: TaskGraph,
  decision: RecoveryDecision
): Promise<boolean> {
  const { taskId, strategy } = decision
  const task = graph.tasks[taskId]

  if (!task) {
    return false
  }

  switch (strategy.type) {
    case "retry":
      return executeRetryRecovery(graph, task, strategy)

    case "skip":
      return executeSkipRecovery(graph, task, strategy)

    case "rollback":
      return executeRollbackRecovery(graph, task, strategy)

    case "escalate":
      return executeEscalateRecovery(graph, task, strategy)

    case "abort":
      return executeAbortRecovery(graph, task, strategy)

    default:
      return false
  }
}

/**
 * Execute retry recovery
 */
async function executeRetryRecovery(
  graph: TaskGraph,
  task: Task,
  config: { type: "retry"; maxAttempts: number; backoffMs?: number; maxBackoffMs?: number }
): Promise<boolean> {
  // Check if we can still retry
  if (task.retryCount >= config.maxAttempts) {
    return false
  }

  // Apply backoff if specified
  if (config.backoffMs) {
    const backoff = Math.min(
      config.backoffMs * Math.pow(2, task.retryCount),
      config.maxBackoffMs || 30000
    )
    await new Promise((resolve) => setTimeout(resolve, backoff))
  }

  // Increment retry count and reset status
  incrementRetryCount(graph, task.id)

  return true
}

/**
 * Execute skip recovery
 */
async function executeSkipRecovery(
  graph: TaskGraph,
  task: Task,
  config: { type: "skip"; fallbackTaskId?: string; markDependentsBlocked?: boolean }
): Promise<boolean> {
  // Mark task as skipped
  updateTaskStatus(graph, task.id, "skipped")

  // Mark dependent tasks as blocked if requested
  if (config.markDependentsBlocked) {
    for (const t of Object.values(graph.tasks)) {
      if (t.dependencies.includes(task.id)) {
        updateTaskStatus(graph, t.id, "blocked")
      }
    }
  }

  // TODO: Execute fallback task if specified

  return true
}

/**
 * Execute rollback recovery
 */
async function executeRollbackRecovery(
  graph: TaskGraph,
  task: Task,
  config: { type: "rollback"; checkpointTaskId: string; resetState?: boolean }
): Promise<boolean> {
  const checkpointTask = graph.tasks[config.checkpointTaskId]
  if (!checkpointTask) {
    return false
  }

  // Find all tasks that come after the checkpoint
  const tasksToReset = findTasksAfterCheckpoint(graph, config.checkpointTaskId)

  // Reset those tasks
  for (const taskId of tasksToReset) {
    resetTask(graph, taskId)
  }

  return true
}

/**
 * Execute escalate recovery
 */
async function executeEscalateRecovery(
  graph: TaskGraph,
  task: Task,
  config: { type: "escalate"; message?: string; context?: Record<string, unknown> }
): Promise<boolean> {
  // Mark task as blocked (waiting for intervention)
  updateTaskStatus(graph, task.id, "blocked")

  // Store escalation info in task metadata
  task.metadata = {
    ...task.metadata,
    escalated: true,
    escalationMessage: config.message,
    escalationContext: config.context,
    escalatedAt: new Date().toISOString(),
  }

  // Return false because we can't continue automatically
  return false
}

/**
 * Execute abort recovery
 */
async function executeAbortRecovery(
  graph: TaskGraph,
  task: Task,
  config: { type: "abort"; reason?: string }
): Promise<boolean> {
  // Mark all pending/in_progress tasks as blocked
  for (const t of Object.values(graph.tasks)) {
    if (t.status === "pending" || t.status === "in_progress") {
      updateTaskStatus(graph, t.id, "blocked")
    }
  }

  // Store abort reason
  task.metadata = {
    ...task.metadata,
    abortReason: config.reason,
    abortedAt: new Date().toISOString(),
  }

  // Return false because we're aborting
  return false
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find all tasks that depend on the checkpoint task (directly or transitively)
 */
function findTasksAfterCheckpoint(graph: TaskGraph, checkpointTaskId: string): string[] {
  const result: string[] = []
  const visited = new Set<string>()

  function visit(taskId: string): void {
    if (visited.has(taskId)) return
    visited.add(taskId)

    // Find tasks that depend on this one
    for (const [id, task] of Object.entries(graph.tasks)) {
      if (task.dependencies.includes(taskId)) {
        result.push(id)
        visit(id)
      }
    }
  }

  visit(checkpointTaskId)
  return result
}

/**
 * Calculate recommended retry delay based on attempt number
 * @deprecated Use calculateDelay from @/lib/utils/retry instead
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000,
  jitter: boolean = true
): number {
  // Delegate to centralized retry utility
  return calculateDelayFromRetry(attempt, { baseDelayMs, maxDelayMs, jitter, backoffMultiplier: 2 })
}

/**
 * Determine if an error is transient (likely to succeed on retry)
 * @deprecated Use isTransientError from @/lib/utils/retry instead
 */
export function isTransientError(errorMessage: string): boolean {
  return isTransientErrorFromRetry(new Error(errorMessage))
}

/**
 * Determine if an error is permanent (retry won't help)
 * @deprecated Use isPermanentError from @/lib/utils/retry instead
 */
export function isPermanentError(errorMessage: string): boolean {
  return isPermanentErrorFromRetry(new Error(errorMessage))
}

// =============================================================================
// Recovery Strategy Builder
// =============================================================================

/**
 * Builder for creating custom recovery strategies
 */
export class RecoveryStrategyBuilder {
  private strategies: Array<{
    condition: (task: Task, error?: string) => boolean
    strategy: RecoveryConfig
  }> = []

  /**
   * Add a retry strategy for matching errors
   */
  retryOn(
    pattern: RegExp,
    options: { maxAttempts?: number; backoffMs?: number; maxBackoffMs?: number } = {}
  ): this {
    this.strategies.push({
      condition: (_, error) => pattern.test(error || ""),
      strategy: {
        type: "retry",
        maxAttempts: options.maxAttempts ?? 3,
        backoffMs: options.backoffMs ?? 1000,
        maxBackoffMs: options.maxBackoffMs ?? 30000,
      },
    })
    return this
  }

  /**
   * Add a skip strategy for matching errors
   */
  skipOn(pattern: RegExp, markDependentsBlocked = true): this {
    this.strategies.push({
      condition: (_, error) => pattern.test(error || ""),
      strategy: {
        type: "skip",
        markDependentsBlocked,
      },
    })
    return this
  }

  /**
   * Add an escalate strategy for matching errors
   */
  escalateOn(pattern: RegExp, message?: string): this {
    this.strategies.push({
      condition: (_, error) => pattern.test(error || ""),
      strategy: {
        type: "escalate",
        message,
      },
    })
    return this
  }

  /**
   * Add an abort strategy for matching errors
   */
  abortOn(pattern: RegExp, reason?: string): this {
    this.strategies.push({
      condition: (_, error) => pattern.test(error || ""),
      strategy: {
        type: "abort",
        reason,
      },
    })
    return this
  }

  /**
   * Add a strategy for critical tasks
   */
  forCriticalTasks(strategy: RecoveryConfig): this {
    this.strategies.push({
      condition: (task) => task.metadata?.critical === true,
      strategy,
    })
    return this
  }

  /**
   * Select strategy for a task
   */
  select(task: Task, error?: string): RecoveryConfig | null {
    for (const { condition, strategy } of this.strategies) {
      if (condition(task, error)) {
        return strategy
      }
    }
    return null
  }
}

/**
 * Create a default recovery strategy builder
 */
export function createDefaultRecoveryBuilder(): RecoveryStrategyBuilder {
  return new RecoveryStrategyBuilder()
    .retryOn(/timeout|ETIMEDOUT|ECONNREFUSED|network/i, {
      maxAttempts: 3,
      backoffMs: 2000,
    })
    .retryOn(/rate.?limit|429/i, {
      maxAttempts: 3,
      backoffMs: 5000,
      maxBackoffMs: 60000,
    })
    .skipOn(/not.?found|404|ENOENT/i)
    .escalateOn(/permission|forbidden|403/i, "Permission denied")
    .abortOn(/out.?of.?memory|OOM/i, "Out of memory")
}
