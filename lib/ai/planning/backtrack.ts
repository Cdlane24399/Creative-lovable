/**
 * Backtracking Implementation for Task Graph Execution
 *
 * Provides the ability to rollback to previous states and retry
 * with different approaches when task execution fails.
 */

import type { Task, TaskGraph } from "../context-types"
import type { TaskCheckpoint, ExecutionAnalysis } from "./types"
import {
  analyzeExecution,
  updateTaskStatus,
  resetTask,
  cloneTaskGraph,
  getTaskDependencyInfo,
} from "./task-graph"

// =============================================================================
// Types
// =============================================================================

/**
 * Backtrack point with state snapshot
 */
export interface BacktrackPoint {
  id: string
  taskId: string
  timestamp: Date
  graph: TaskGraph
  reason?: string
  attempt: number
}

/**
 * Options for backtracking
 */
export interface BacktrackOptions {
  /** Maximum number of backtrack points to keep */
  maxPoints?: number
  /** Whether to create automatic backtrack points */
  autoCheckpoint?: boolean
  /** Minimum tasks between auto checkpoints */
  checkpointInterval?: number
}

/**
 * Backtrack history manager
 */
export interface BacktrackHistory {
  points: BacktrackPoint[]
  currentIndex: number
}

// =============================================================================
// Backtrack Point Management
// =============================================================================

/**
 * Create a new backtrack point
 */
export function createBacktrackPoint(
  graph: TaskGraph,
  taskId: string,
  reason?: string,
  attempt: number = 0
): BacktrackPoint {
  return {
    id: `bp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    taskId,
    timestamp: new Date(),
    graph: cloneTaskGraph(graph),
    reason,
    attempt,
  }
}

/**
 * Create a backtrack history manager
 */
export function createBacktrackHistory(
  options: BacktrackOptions = {}
): BacktrackHistory {
  return {
    points: [],
    currentIndex: -1,
  }
}

/**
 * Add a backtrack point to history
 */
export function addBacktrackPoint(
  history: BacktrackHistory,
  point: BacktrackPoint,
  maxPoints: number = 10
): void {
  // Remove any points after current index (we're creating a new branch)
  if (history.currentIndex < history.points.length - 1) {
    history.points = history.points.slice(0, history.currentIndex + 1)
  }

  // Add new point
  history.points.push(point)

  // Trim if exceeds max
  if (history.points.length > maxPoints) {
    history.points.shift()
  }

  // Update current index
  history.currentIndex = history.points.length - 1
}

/**
 * Get the most recent backtrack point
 */
export function getLatestBacktrackPoint(
  history: BacktrackHistory
): BacktrackPoint | null {
  if (history.points.length === 0) {
    return null
  }
  return history.points[history.points.length - 1]
}

/**
 * Find a suitable backtrack point for a failed task
 */
export function findBacktrackPoint(
  history: BacktrackHistory,
  failedTaskId: string,
  graph: TaskGraph
): BacktrackPoint | null {
  if (history.points.length === 0) {
    return null
  }

  // Get dependency info for the failed task
  const depInfo = getTaskDependencyInfo(graph, failedTaskId)
  if (!depInfo) {
    return null
  }

  // Find the most recent point where the failed task was still pending
  for (let i = history.points.length - 1; i >= 0; i--) {
    const point = history.points[i]
    const task = point.graph.tasks[failedTaskId]

    if (task && task.status === "pending") {
      return point
    }
  }

  // If not found, find a point before any of its dependencies
  for (let i = history.points.length - 1; i >= 0; i--) {
    const point = history.points[i]

    // Check if any dependency of the failed task was still pending at this point
    const hasPendingDep = depInfo.directDependencies.some((depId) => {
      const dep = point.graph.tasks[depId]
      return dep && dep.status === "pending"
    })

    if (hasPendingDep) {
      return point
    }
  }

  // Return the first point as last resort
  return history.points[0]
}

// =============================================================================
// Backtracking Operations
// =============================================================================

/**
 * Backtrack to a specific point
 */
export function backtrackTo(
  history: BacktrackHistory,
  pointId: string
): TaskGraph | null {
  const index = history.points.findIndex((p) => p.id === pointId)
  if (index === -1) {
    return null
  }

  history.currentIndex = index
  return cloneTaskGraph(history.points[index].graph)
}

/**
 * Backtrack to the previous point
 */
export function backtrackOnce(history: BacktrackHistory): TaskGraph | null {
  if (history.currentIndex <= 0) {
    return null
  }

  history.currentIndex--
  return cloneTaskGraph(history.points[history.currentIndex].graph)
}

/**
 * Backtrack multiple steps
 */
export function backtrackSteps(
  history: BacktrackHistory,
  steps: number
): TaskGraph | null {
  const newIndex = Math.max(0, history.currentIndex - steps)
  if (newIndex === history.currentIndex) {
    return null
  }

  history.currentIndex = newIndex
  return cloneTaskGraph(history.points[history.currentIndex].graph)
}

/**
 * Backtrack to start
 */
export function backtrackToStart(history: BacktrackHistory): TaskGraph | null {
  if (history.points.length === 0) {
    return null
  }

  history.currentIndex = 0
  return cloneTaskGraph(history.points[0].graph)
}

// =============================================================================
// Recovery Backtracking
// =============================================================================

/**
 * Result of attempting recovery through backtracking
 */
export interface BacktrackRecoveryResult {
  success: boolean
  graph?: TaskGraph
  point?: BacktrackPoint
  tasksReset: string[]
  message: string
}

/**
 * Attempt to recover from a failed task by backtracking
 */
export function attemptBacktrackRecovery(
  history: BacktrackHistory,
  graph: TaskGraph,
  failedTaskId: string,
  maxAttempts: number = 3
): BacktrackRecoveryResult {
  const task = graph.tasks[failedTaskId]
  if (!task) {
    return {
      success: false,
      tasksReset: [],
      message: `Task not found: ${failedTaskId}`,
    }
  }

  // Check if we've exceeded max backtrack attempts for this task
  const recentBacktracks = history.points.filter(
    (p) => p.taskId === failedTaskId
  ).length

  if (recentBacktracks >= maxAttempts) {
    return {
      success: false,
      tasksReset: [],
      message: `Max backtrack attempts (${maxAttempts}) reached for task ${failedTaskId}`,
    }
  }

  // Find suitable backtrack point
  const point = findBacktrackPoint(history, failedTaskId, graph)
  if (!point) {
    return {
      success: false,
      tasksReset: [],
      message: "No suitable backtrack point found",
    }
  }

  // Restore from point
  const restoredGraph = cloneTaskGraph(point.graph)

  // Find tasks that were reset
  const tasksReset: string[] = []
  for (const [taskId, task] of Object.entries(graph.tasks)) {
    const originalTask = restoredGraph.tasks[taskId]
    if (originalTask && task.status !== originalTask.status) {
      tasksReset.push(taskId)
    }
  }

  // Create a new backtrack point for this recovery attempt
  const newPoint = createBacktrackPoint(
    graph,
    failedTaskId,
    `Recovery attempt for failed task`,
    recentBacktracks + 1
  )
  addBacktrackPoint(history, newPoint)

  return {
    success: true,
    graph: restoredGraph,
    point,
    tasksReset,
    message: `Backtracked to point ${point.id}, reset ${tasksReset.length} tasks`,
  }
}

// =============================================================================
// Selective Reset
// =============================================================================

/**
 * Reset a task and optionally its dependents
 */
export function resetTaskAndDependents(
  graph: TaskGraph,
  taskId: string,
  includeDependents: boolean = true
): string[] {
  const resetTasks: string[] = []

  // Reset the target task
  if (resetTask(graph, taskId)) {
    resetTasks.push(taskId)
  }

  if (!includeDependents) {
    return resetTasks
  }

  // Find and reset all dependent tasks
  const dependents = findAllDependents(graph, taskId)
  for (const depId of dependents) {
    if (resetTask(graph, depId)) {
      resetTasks.push(depId)
    }
  }

  return resetTasks
}

/**
 * Reset all tasks from a certain point onward
 */
export function resetTasksFrom(
  graph: TaskGraph,
  fromTaskId: string
): string[] {
  const resetTasks: string[] = []
  const toReset = new Set<string>()

  // Start with the target task
  toReset.add(fromTaskId)

  // Find all tasks that depend on this one (directly or transitively)
  const dependents = findAllDependents(graph, fromTaskId)
  for (const depId of dependents) {
    toReset.add(depId)
  }

  // Reset all identified tasks
  for (const taskId of toReset) {
    if (resetTask(graph, taskId)) {
      resetTasks.push(taskId)
    }
  }

  return resetTasks
}

/**
 * Find all tasks that depend on the given task (transitively)
 */
function findAllDependents(graph: TaskGraph, taskId: string): string[] {
  const dependents = new Set<string>()
  const queue = [taskId]

  while (queue.length > 0) {
    const current = queue.shift()!

    for (const [id, task] of Object.entries(graph.tasks)) {
      if (task.dependencies.includes(current) && !dependents.has(id)) {
        dependents.add(id)
        queue.push(id)
      }
    }
  }

  return Array.from(dependents)
}

// =============================================================================
// Checkpoint Integration
// =============================================================================

/**
 * Convert a checkpoint to a backtrack point
 */
export function checkpointToBacktrackPoint(
  checkpoint: TaskCheckpoint,
  graph: TaskGraph
): BacktrackPoint {
  // Create a graph state from the checkpoint
  const restoredGraph = cloneTaskGraph(graph)

  // Reset all tasks
  for (const task of Object.values(restoredGraph.tasks)) {
    task.status = "pending"
    task.error = undefined
    task.startedAt = undefined
    task.completedAt = undefined
  }

  // Mark completed tasks
  for (const taskId of checkpoint.state.completedTasks) {
    const task = restoredGraph.tasks[taskId]
    if (task) {
      task.status = "completed"
    }
  }

  // Mark failed tasks as blocked (they failed before)
  for (const taskId of checkpoint.state.failedTasks) {
    const task = restoredGraph.tasks[taskId]
    if (task) {
      task.status = "blocked"
    }
  }

  restoredGraph.updatedAt = new Date()

  return {
    id: `bp_from_${checkpoint.id}`,
    taskId: checkpoint.taskId,
    timestamp: checkpoint.timestamp,
    graph: restoredGraph,
    reason: "Converted from checkpoint",
    attempt: 0,
  }
}

// =============================================================================
// Analysis
// =============================================================================

/**
 * Analyze backtrack history
 */
export function analyzeBacktrackHistory(history: BacktrackHistory): {
  totalPoints: number
  currentPosition: number
  canBacktrack: boolean
  canForward: boolean
  taskBacktrackCounts: Record<string, number>
} {
  const taskCounts: Record<string, number> = {}

  for (const point of history.points) {
    taskCounts[point.taskId] = (taskCounts[point.taskId] || 0) + 1
  }

  return {
    totalPoints: history.points.length,
    currentPosition: history.currentIndex,
    canBacktrack: history.currentIndex > 0,
    canForward: history.currentIndex < history.points.length - 1,
    taskBacktrackCounts: taskCounts,
  }
}

/**
 * Get the most frequently backtracked tasks
 */
export function getMostBacktrackedTasks(
  history: BacktrackHistory,
  limit: number = 5
): Array<{ taskId: string; count: number }> {
  const counts = new Map<string, number>()

  for (const point of history.points) {
    counts.set(point.taskId, (counts.get(point.taskId) || 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([taskId, count]) => ({ taskId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
