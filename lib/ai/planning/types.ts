/**
 * Planning System Type Definitions
 *
 * Types for the enhanced task graph planning system with dependencies,
 * sub-tasks, and recovery strategies.
 */

// Re-export core types from context-types
export type { TaskStatus, Task, TaskGraph } from "../context-types"

// =============================================================================
// Task Creation Types
// =============================================================================

/**
 * Input for creating a new task
 */
export interface CreateTaskInput {
  description: string
  dependencies?: string[] // Task IDs that must complete first
  metadata?: Record<string, unknown>
  maxRetries?: number
}

/**
 * Input for creating a complete task graph
 */
export interface CreateTaskGraphInput {
  goal: string
  tasks: CreateTaskInput[]
}

// =============================================================================
// Task Execution Types
// =============================================================================

/**
 * Result of analyzing a task graph for execution
 */
export interface ExecutionAnalysis {
  /** Tasks that can be executed now (all dependencies satisfied) */
  executable: string[]
  /** Tasks waiting on dependencies */
  blocked: string[]
  /** Tasks currently in progress */
  inProgress: string[]
  /** Tasks that have completed */
  completed: string[]
  /** Tasks that have failed */
  failed: string[]
  /** Tasks that were skipped */
  skipped: string[]
  /** Whether the graph can continue execution */
  canContinue: boolean
  /** Whether the goal is achieved */
  isComplete: boolean
  /** Progress percentage (0-100) */
  progress: number
}

/**
 * Result of executing a single task
 */
export interface TaskExecutionResult {
  taskId: string
  success: boolean
  error?: string
  output?: Record<string, unknown>
  durationMs: number
  timestamp: Date
}

/**
 * Callback for task execution progress
 */
export type TaskProgressCallback = (
  taskId: string,
  phase: "starting" | "in_progress" | "completed" | "failed",
  message?: string
) => void

// =============================================================================
// Recovery Strategy Types
// =============================================================================

/**
 * Recovery strategy when a task fails
 */
export type RecoveryStrategyType =
  | "retry" // Retry the failed task
  | "skip" // Skip the task and continue
  | "rollback" // Rollback to a checkpoint
  | "escalate" // Ask AI for intervention
  | "abort" // Abort the entire plan

/**
 * Configuration for retry recovery
 */
export interface RetryRecoveryConfig {
  type: "retry"
  maxAttempts: number
  backoffMs?: number
  maxBackoffMs?: number
}

/**
 * Configuration for skip recovery
 */
export interface SkipRecoveryConfig {
  type: "skip"
  fallbackTaskId?: string // Optional task to execute instead
  markDependentsBlocked?: boolean
}

/**
 * Configuration for rollback recovery
 */
export interface RollbackRecoveryConfig {
  type: "rollback"
  checkpointTaskId: string // Task to rollback to
  resetState?: boolean
}

/**
 * Configuration for escalate recovery
 */
export interface EscalateRecoveryConfig {
  type: "escalate"
  message?: string
  context?: Record<string, unknown>
}

/**
 * Configuration for abort recovery
 */
export interface AbortRecoveryConfig {
  type: "abort"
  reason?: string
}

/**
 * Union of all recovery configurations
 */
export type RecoveryConfig =
  | RetryRecoveryConfig
  | SkipRecoveryConfig
  | RollbackRecoveryConfig
  | EscalateRecoveryConfig
  | AbortRecoveryConfig

/**
 * Recovery decision for a failed task
 */
export interface RecoveryDecision {
  taskId: string
  strategy: RecoveryConfig
  reason: string
  attemptedStrategies: RecoveryStrategyType[]
}

// =============================================================================
// Checkpoint Types
// =============================================================================

/**
 * A checkpoint in the task graph execution
 */
export interface TaskCheckpoint {
  id: string
  taskId: string
  timestamp: Date
  state: {
    completedTasks: string[]
    failedTasks: string[]
    taskOutputs: Record<string, Record<string, unknown>>
  }
}

// =============================================================================
// Task Graph Events
// =============================================================================

/**
 * Event emitted when task state changes
 */
export interface TaskStateChangeEvent {
  type: "TASK_STATE_CHANGE"
  taskId: string
  previousStatus: string
  newStatus: string
  timestamp: Date
}

/**
 * Event emitted when graph execution completes
 */
export interface GraphCompletionEvent {
  type: "GRAPH_COMPLETION"
  graphId: string
  success: boolean
  completedTasks: number
  failedTasks: number
  duration: number
  timestamp: Date
}

/**
 * Event emitted when recovery is triggered
 */
export interface RecoveryTriggeredEvent {
  type: "RECOVERY_TRIGGERED"
  taskId: string
  strategy: RecoveryStrategyType
  attempt: number
  timestamp: Date
}

/**
 * Union of all task graph events
 */
export type TaskGraphEvent =
  | TaskStateChangeEvent
  | GraphCompletionEvent
  | RecoveryTriggeredEvent

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Result of validating a task graph
 */
export interface TaskGraphValidation {
  isValid: boolean
  errors: TaskGraphValidationError[]
  warnings: TaskGraphValidationWarning[]
}

/**
 * Validation error
 */
export interface TaskGraphValidationError {
  type: "MISSING_DEPENDENCY" | "CIRCULAR_DEPENDENCY" | "DUPLICATE_TASK_ID" | "EMPTY_GRAPH"
  message: string
  taskIds?: string[]
}

/**
 * Validation warning
 */
export interface TaskGraphValidationWarning {
  type: "UNREACHABLE_TASK" | "LONG_DEPENDENCY_CHAIN" | "NO_ROOT_TASKS"
  message: string
  taskIds?: string[]
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Options for task graph operations
 */
export interface TaskGraphOptions {
  /** Maximum parallel task execution */
  maxParallel?: number
  /** Default max retries per task */
  defaultMaxRetries?: number
  /** Enable checkpointing */
  enableCheckpoints?: boolean
  /** Checkpoint interval (number of completed tasks) */
  checkpointInterval?: number
}

/**
 * Statistics about task graph execution
 */
export interface TaskGraphStats {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  skippedTasks: number
  inProgressTasks: number
  pendingTasks: number
  blockedTasks: number
  totalRetries: number
  totalDurationMs: number
  averageTaskDurationMs: number
}

/**
 * Task dependency information
 */
export interface TaskDependencyInfo {
  taskId: string
  directDependencies: string[]
  allDependencies: string[] // Including transitive
  directDependents: string[] // Tasks that depend on this
  allDependents: string[] // Including transitive
  depth: number // Distance from root
}
