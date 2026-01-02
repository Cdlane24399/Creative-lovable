/**
 * Task Graph Executor
 *
 * Provides dependency-aware execution engine for task graphs with:
 * - Parallel task execution with configurable concurrency
 * - Progress tracking and callbacks
 * - Recovery strategy integration
 * - Checkpointing support
 */

import type { Task, TaskGraph, TaskStatus } from "../context-types"
import type {
  ExecutionAnalysis,
  TaskExecutionResult,
  TaskProgressCallback,
  TaskCheckpoint,
  TaskGraphOptions,
  RecoveryDecision,
} from "./types"
import {
  analyzeExecution,
  updateTaskStatus,
  incrementRetryCount,
  getTaskGraphStats,
  cloneTaskGraph,
} from "./task-graph"
import { selectRecoveryStrategy, executeRecovery } from "./recovery-strategies"

// =============================================================================
// Types
// =============================================================================

/**
 * Function that executes a single task
 */
export type TaskExecutor = (
  task: Task,
  context: TaskExecutionContext
) => Promise<TaskExecutionResult>

/**
 * Context provided to task executors
 */
export interface TaskExecutionContext {
  graph: TaskGraph
  checkpoint?: TaskCheckpoint
  previousResults: Map<string, TaskExecutionResult>
  abortSignal?: AbortSignal
}

/**
 * Options for running a task graph
 */
export interface RunOptions extends TaskGraphOptions {
  executor: TaskExecutor
  onProgress?: TaskProgressCallback
  onCheckpoint?: (checkpoint: TaskCheckpoint) => void | Promise<void>
  abortSignal?: AbortSignal
}

/**
 * Result of running a task graph
 */
export interface RunResult {
  success: boolean
  graph: TaskGraph
  results: Map<string, TaskExecutionResult>
  checkpoints: TaskCheckpoint[]
  stats: ReturnType<typeof getTaskGraphStats>
  aborted: boolean
  error?: string
}

// =============================================================================
// Execution State
// =============================================================================

/**
 * Internal execution state
 */
interface ExecutionState {
  graph: TaskGraph
  results: Map<string, TaskExecutionResult>
  checkpoints: TaskCheckpoint[]
  inProgress: Set<string>
  checkpointCounter: number
  startTime: number
  aborted: boolean
}

// =============================================================================
// Main Execution
// =============================================================================

/**
 * Run a task graph to completion
 */
export async function runTaskGraph(
  graph: TaskGraph,
  options: RunOptions
): Promise<RunResult> {
  const {
    executor,
    onProgress,
    onCheckpoint,
    maxParallel = 3,
    enableCheckpoints = true,
    checkpointInterval = 5,
    abortSignal,
  } = options

  // Clone the graph to avoid mutations
  const workingGraph = cloneTaskGraph(graph)

  // Initialize state
  const state: ExecutionState = {
    graph: workingGraph,
    results: new Map(),
    checkpoints: [],
    inProgress: new Set(),
    checkpointCounter: 0,
    startTime: Date.now(),
    aborted: false,
  }

  // Check for abort signal
  if (abortSignal?.aborted) {
    return createAbortedResult(state)
  }

  // Set up abort listener
  const abortHandler = () => {
    state.aborted = true
  }
  abortSignal?.addEventListener("abort", abortHandler)

  try {
    // Main execution loop
    while (!state.aborted) {
      const analysis = analyzeExecution(state.graph)

      // Check if complete
      if (analysis.isComplete) {
        break
      }

      // Check if stuck (no executable tasks and nothing in progress)
      if (!analysis.canContinue && state.inProgress.size === 0) {
        // Try recovery for failed tasks
        const recovered = await attemptRecovery(state, analysis, options)
        if (!recovered) {
          break // Can't continue
        }
        continue
      }

      // Get next tasks to execute
      const available = maxParallel - state.inProgress.size
      const toExecute = analysis.executable.slice(0, available)

      if (toExecute.length === 0 && state.inProgress.size === 0) {
        break // Nothing more to do
      }

      // Execute tasks in parallel
      const promises = toExecute.map((taskId) =>
        executeTask(state, taskId, executor, onProgress, abortSignal)
      )

      // Wait for at least one task to complete
      if (promises.length > 0) {
        await Promise.race(promises)
      } else if (state.inProgress.size > 0) {
        // Wait a bit if tasks are in progress but none completed yet
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Create checkpoint if needed
      if (enableCheckpoints) {
        state.checkpointCounter++
        if (state.checkpointCounter >= checkpointInterval) {
          state.checkpointCounter = 0
          const checkpoint = createCheckpoint(state)
          state.checkpoints.push(checkpoint)
          await onCheckpoint?.(checkpoint)
        }
      }
    }
  } finally {
    abortSignal?.removeEventListener("abort", abortHandler)
  }

  // Create final result
  return createResult(state)
}

/**
 * Execute a single task
 */
async function executeTask(
  state: ExecutionState,
  taskId: string,
  executor: TaskExecutor,
  onProgress?: TaskProgressCallback,
  abortSignal?: AbortSignal
): Promise<void> {
  const task = state.graph.tasks[taskId]
  if (!task) return

  // Mark as in progress
  state.inProgress.add(taskId)
  updateTaskStatus(state.graph, taskId, "in_progress")
  onProgress?.(taskId, "starting", `Starting: ${task.description}`)

  const context: TaskExecutionContext = {
    graph: state.graph,
    previousResults: state.results,
    abortSignal,
  }

  try {
    // Check for abort before executing
    if (abortSignal?.aborted || state.aborted) {
      throw new Error("Execution aborted")
    }

    // Execute the task
    const result = await executor(task, context)
    state.results.set(taskId, result)

    if (result.success) {
      updateTaskStatus(state.graph, taskId, "completed")
      onProgress?.(taskId, "completed", `Completed: ${task.description}`)
    } else {
      updateTaskStatus(state.graph, taskId, "failed", result.error)
      onProgress?.(taskId, "failed", `Failed: ${task.description} - ${result.error}`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const result: TaskExecutionResult = {
      taskId,
      success: false,
      error: errorMessage,
      durationMs: 0,
      timestamp: new Date(),
    }
    state.results.set(taskId, result)
    updateTaskStatus(state.graph, taskId, "failed", errorMessage)
    onProgress?.(taskId, "failed", `Error: ${task.description} - ${errorMessage}`)
  } finally {
    state.inProgress.delete(taskId)
  }
}

// =============================================================================
// Recovery
// =============================================================================

/**
 * Attempt to recover from failed tasks
 */
async function attemptRecovery(
  state: ExecutionState,
  analysis: ExecutionAnalysis,
  options: RunOptions
): Promise<boolean> {
  const { onProgress } = options

  // Get failed tasks that can be recovered
  const failedTasks = analysis.failed
    .map((id) => state.graph.tasks[id])
    .filter((t): t is Task => t !== undefined)

  for (const task of failedTasks) {
    // Check if max retries reached
    if (task.retryCount >= task.maxRetries) {
      continue
    }

    // Select recovery strategy
    const result = state.results.get(task.id)
    const decision = selectRecoveryStrategy(task, result, state.graph)

    if (!decision) continue

    // Execute recovery
    const recovered = await executeRecovery(state.graph, decision)

    if (recovered) {
      onProgress?.(task.id, "starting", `Retrying: ${task.description}`)
      return true
    }
  }

  return false
}

// =============================================================================
// Checkpointing
// =============================================================================

/**
 * Create a checkpoint of the current state
 */
function createCheckpoint(state: ExecutionState): TaskCheckpoint {
  const analysis = analyzeExecution(state.graph)

  // Collect task outputs
  const taskOutputs: Record<string, Record<string, unknown>> = {}
  for (const [taskId, result] of state.results) {
    if (result.success && result.output) {
      taskOutputs[taskId] = result.output
    }
  }

  return {
    id: `checkpoint_${Date.now()}`,
    taskId: analysis.completed[analysis.completed.length - 1] || "",
    timestamp: new Date(),
    state: {
      completedTasks: analysis.completed,
      failedTasks: analysis.failed,
      taskOutputs,
    },
  }
}

/**
 * Restore from a checkpoint
 */
export function restoreFromCheckpoint(
  graph: TaskGraph,
  checkpoint: TaskCheckpoint
): TaskGraph {
  const restored = cloneTaskGraph(graph)

  // Reset all tasks to pending
  for (const task of Object.values(restored.tasks)) {
    task.status = "pending"
    task.error = undefined
    task.startedAt = undefined
    task.completedAt = undefined
  }

  // Mark completed tasks
  for (const taskId of checkpoint.state.completedTasks) {
    const task = restored.tasks[taskId]
    if (task) {
      task.status = "completed"
    }
  }

  restored.updatedAt = new Date()
  return restored
}

// =============================================================================
// Result Creation
// =============================================================================

/**
 * Create final run result
 */
function createResult(state: ExecutionState): RunResult {
  const stats = getTaskGraphStats(state.graph)
  const analysis = analyzeExecution(state.graph)

  return {
    success: analysis.isComplete && analysis.failed.length === 0,
    graph: state.graph,
    results: state.results,
    checkpoints: state.checkpoints,
    stats,
    aborted: state.aborted,
  }
}

/**
 * Create aborted run result
 */
function createAbortedResult(state: ExecutionState): RunResult {
  return {
    success: false,
    graph: state.graph,
    results: state.results,
    checkpoints: state.checkpoints,
    stats: getTaskGraphStats(state.graph),
    aborted: true,
    error: "Execution aborted",
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a simple executor from a function map
 */
export function createSimpleExecutor(
  handlers: Record<string, (task: Task) => Promise<Record<string, unknown> | void>>
): TaskExecutor {
  return async (task, context) => {
    const startTime = Date.now()

    try {
      // Find handler by task metadata or default
      const handlerName = (task.metadata?.handler as string) || "default"
      const handler = handlers[handlerName] || handlers.default

      if (!handler) {
        throw new Error(`No handler found for task: ${task.id}`)
      }

      const output = await handler(task)

      return {
        taskId: task.id,
        success: true,
        output: output || {},
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      }
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
        timestamp: new Date(),
      }
    }
  }
}

/**
 * Run a single task without the full graph execution
 */
export async function runSingleTask(
  graph: TaskGraph,
  taskId: string,
  executor: TaskExecutor,
  abortSignal?: AbortSignal
): Promise<TaskExecutionResult> {
  const task = graph.tasks[taskId]
  if (!task) {
    return {
      taskId,
      success: false,
      error: `Task not found: ${taskId}`,
      durationMs: 0,
      timestamp: new Date(),
    }
  }

  const context: TaskExecutionContext = {
    graph,
    previousResults: new Map(),
    abortSignal,
  }

  const startTime = Date.now()

  try {
    return await executor(task, context)
  } catch (error) {
    return {
      taskId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
      timestamp: new Date(),
    }
  }
}

/**
 * Dry run - analyze what would be executed without actually running
 */
export function dryRun(graph: TaskGraph): {
  executionOrder: string[][]
  totalSteps: number
} {
  const workingGraph = cloneTaskGraph(graph)
  const executionOrder: string[][] = []

  while (true) {
    const analysis = analyzeExecution(workingGraph)

    if (analysis.executable.length === 0) {
      break
    }

    executionOrder.push([...analysis.executable])

    // Mark executable as completed
    for (const taskId of analysis.executable) {
      updateTaskStatus(workingGraph, taskId, "completed")
    }
  }

  return {
    executionOrder,
    totalSteps: executionOrder.length,
  }
}
