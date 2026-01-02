/**
 * Task Graph Data Structure
 *
 * Provides a DAG (Directed Acyclic Graph) implementation for task planning
 * with dependency management, validation, and execution analysis.
 */

import type { Task, TaskGraph, TaskStatus } from "../context-types"
import type {
  CreateTaskInput,
  CreateTaskGraphInput,
  ExecutionAnalysis,
  TaskGraphValidation,
  TaskGraphValidationError,
  TaskGraphValidationWarning,
  TaskDependencyInfo,
  TaskGraphStats,
} from "./types"

// =============================================================================
// ID Generation
// =============================================================================

let taskIdCounter = 0

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `task_${Date.now()}_${++taskIdCounter}`
}

/**
 * Generate a unique graph ID
 */
export function generateGraphId(): string {
  return `graph_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// =============================================================================
// Task Creation
// =============================================================================

/**
 * Create a new task
 */
export function createTask(input: CreateTaskInput, id?: string): Task {
  return {
    id: id || generateTaskId(),
    description: input.description,
    status: "pending",
    dependencies: input.dependencies || [],
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    metadata: input.metadata,
  }
}

/**
 * Create a new task graph
 */
export function createTaskGraph(input: CreateTaskGraphInput): TaskGraph {
  const tasks: Record<string, Task> = {}
  const taskIds: string[] = []

  // Create all tasks first
  for (const taskInput of input.tasks) {
    const task = createTask(taskInput)
    tasks[task.id] = task
    taskIds.push(task.id)
  }

  // Find root tasks (no dependencies or dependencies are external)
  const rootTasks = taskIds.filter((id) => {
    const task = tasks[id]
    return (
      task.dependencies.length === 0 ||
      task.dependencies.every((depId) => !tasks[depId])
    )
  })

  return {
    id: generateGraphId(),
    goal: input.goal,
    rootTasks,
    tasks,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Create an empty task graph
 */
export function createEmptyTaskGraph(goal: string): TaskGraph {
  return {
    id: generateGraphId(),
    goal,
    rootTasks: [],
    tasks: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// =============================================================================
// Task Graph Modification
// =============================================================================

/**
 * Add a task to the graph
 */
export function addTask(graph: TaskGraph, input: CreateTaskInput): Task {
  const task = createTask(input)
  graph.tasks[task.id] = task
  graph.updatedAt = new Date()

  // If no dependencies, add to root tasks
  if (task.dependencies.length === 0) {
    graph.rootTasks.push(task.id)
  }

  return task
}

/**
 * Remove a task from the graph
 */
export function removeTask(graph: TaskGraph, taskId: string): boolean {
  if (!graph.tasks[taskId]) {
    return false
  }

  // Remove from tasks
  delete graph.tasks[taskId]

  // Remove from root tasks
  graph.rootTasks = graph.rootTasks.filter((id) => id !== taskId)

  // Remove from other tasks' dependencies
  for (const task of Object.values(graph.tasks)) {
    task.dependencies = task.dependencies.filter((id) => id !== taskId)
  }

  graph.updatedAt = new Date()
  return true
}

/**
 * Add a dependency to a task
 */
export function addDependency(
  graph: TaskGraph,
  taskId: string,
  dependencyId: string
): boolean {
  const task = graph.tasks[taskId]
  if (!task) return false

  // Check if dependency exists
  if (!graph.tasks[dependencyId]) return false

  // Check for self-dependency
  if (taskId === dependencyId) return false

  // Check if already a dependency
  if (task.dependencies.includes(dependencyId)) return false

  // Check for circular dependency
  if (wouldCreateCycle(graph, taskId, dependencyId)) return false

  task.dependencies.push(dependencyId)

  // Remove from root tasks if it was there
  graph.rootTasks = graph.rootTasks.filter((id) => id !== taskId)

  graph.updatedAt = new Date()
  return true
}

/**
 * Remove a dependency from a task
 */
export function removeDependency(
  graph: TaskGraph,
  taskId: string,
  dependencyId: string
): boolean {
  const task = graph.tasks[taskId]
  if (!task) return false

  const index = task.dependencies.indexOf(dependencyId)
  if (index === -1) return false

  task.dependencies.splice(index, 1)

  // If no more dependencies, add to root tasks
  if (task.dependencies.length === 0 && !graph.rootTasks.includes(taskId)) {
    graph.rootTasks.push(taskId)
  }

  graph.updatedAt = new Date()
  return true
}

// =============================================================================
// Task Status Management
// =============================================================================

/**
 * Update task status
 */
export function updateTaskStatus(
  graph: TaskGraph,
  taskId: string,
  status: TaskStatus,
  error?: string
): boolean {
  const task = graph.tasks[taskId]
  if (!task) return false

  task.status = status
  graph.updatedAt = new Date()

  switch (status) {
    case "in_progress":
      task.startedAt = new Date()
      break
    case "completed":
    case "failed":
    case "skipped":
      task.completedAt = new Date()
      if (error) task.error = error
      break
  }

  // Update blocked status for dependent tasks
  updateBlockedStatus(graph)

  return true
}

/**
 * Increment retry count for a task
 */
export function incrementRetryCount(graph: TaskGraph, taskId: string): number {
  const task = graph.tasks[taskId]
  if (!task) return -1

  task.retryCount++
  task.status = "pending"
  task.error = undefined
  graph.updatedAt = new Date()

  return task.retryCount
}

/**
 * Reset a task to pending state
 */
export function resetTask(graph: TaskGraph, taskId: string): boolean {
  const task = graph.tasks[taskId]
  if (!task) return false

  task.status = "pending"
  task.error = undefined
  task.startedAt = undefined
  task.completedAt = undefined
  graph.updatedAt = new Date()

  return true
}

/**
 * Update blocked status for all tasks
 */
function updateBlockedStatus(graph: TaskGraph): void {
  for (const task of Object.values(graph.tasks)) {
    if (task.status !== "pending") continue

    // Check if any dependency has failed
    const hasFailedDep = task.dependencies.some((depId) => {
      const dep = graph.tasks[depId]
      return dep && dep.status === "failed"
    })

    if (hasFailedDep) {
      task.status = "blocked"
    }
  }
}

// =============================================================================
// Execution Analysis
// =============================================================================

/**
 * Analyze the graph for execution
 */
export function analyzeExecution(graph: TaskGraph): ExecutionAnalysis {
  const tasks = Object.values(graph.tasks)

  const completed = tasks.filter((t) => t.status === "completed").map((t) => t.id)
  const failed = tasks.filter((t) => t.status === "failed").map((t) => t.id)
  const skipped = tasks.filter((t) => t.status === "skipped").map((t) => t.id)
  const inProgress = tasks.filter((t) => t.status === "in_progress").map((t) => t.id)
  const blocked = tasks.filter((t) => t.status === "blocked").map((t) => t.id)

  // Find executable tasks (pending with all dependencies completed)
  const executable = tasks
    .filter((task) => {
      if (task.status !== "pending") return false

      return task.dependencies.every((depId) => {
        const dep = graph.tasks[depId]
        return dep && dep.status === "completed"
      })
    })
    .map((t) => t.id)

  // Calculate progress
  const totalTasks = tasks.length
  const finishedTasks = completed.length + failed.length + skipped.length
  const progress = totalTasks > 0 ? Math.round((finishedTasks / totalTasks) * 100) : 0

  // Check if complete
  const isComplete = tasks.every(
    (t) => t.status === "completed" || t.status === "skipped"
  )

  // Can continue if there are executable or in-progress tasks
  const canContinue = executable.length > 0 || inProgress.length > 0

  return {
    executable,
    blocked,
    inProgress,
    completed,
    failed,
    skipped,
    canContinue,
    isComplete,
    progress,
  }
}

/**
 * Get the next tasks to execute
 */
export function getNextExecutableTasks(
  graph: TaskGraph,
  maxParallel: number = 1
): string[] {
  const analysis = analyzeExecution(graph)

  // Don't return more than maxParallel - current in-progress
  const available = maxParallel - analysis.inProgress.length
  if (available <= 0) return []

  return analysis.executable.slice(0, available)
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a task graph
 */
export function validateTaskGraph(graph: TaskGraph): TaskGraphValidation {
  const errors: TaskGraphValidationError[] = []
  const warnings: TaskGraphValidationWarning[] = []

  const taskIds = Object.keys(graph.tasks)

  // Check for empty graph
  if (taskIds.length === 0) {
    errors.push({
      type: "EMPTY_GRAPH",
      message: "Task graph has no tasks",
    })
    return { isValid: false, errors, warnings }
  }

  // Check for duplicate task IDs (shouldn't happen with object keys)
  const seenIds = new Set<string>()
  for (const id of taskIds) {
    if (seenIds.has(id)) {
      errors.push({
        type: "DUPLICATE_TASK_ID",
        message: `Duplicate task ID: ${id}`,
        taskIds: [id],
      })
    }
    seenIds.add(id)
  }

  // Check for missing dependencies
  for (const task of Object.values(graph.tasks)) {
    for (const depId of task.dependencies) {
      if (!graph.tasks[depId]) {
        errors.push({
          type: "MISSING_DEPENDENCY",
          message: `Task "${task.id}" depends on non-existent task "${depId}"`,
          taskIds: [task.id, depId],
        })
      }
    }
  }

  // Check for circular dependencies
  const cycles = findCycles(graph)
  for (const cycle of cycles) {
    errors.push({
      type: "CIRCULAR_DEPENDENCY",
      message: `Circular dependency detected: ${cycle.join(" -> ")}`,
      taskIds: cycle,
    })
  }

  // Check for no root tasks
  if (graph.rootTasks.length === 0 && taskIds.length > 0) {
    warnings.push({
      type: "NO_ROOT_TASKS",
      message: "No root tasks defined (all tasks have dependencies)",
      taskIds: taskIds,
    })
  }

  // Check for unreachable tasks
  const reachable = getReachableTasks(graph)
  const unreachable = taskIds.filter((id) => !reachable.has(id))
  if (unreachable.length > 0) {
    warnings.push({
      type: "UNREACHABLE_TASK",
      message: `Unreachable tasks: ${unreachable.join(", ")}`,
      taskIds: unreachable,
    })
  }

  // Check for long dependency chains
  const maxDepth = getMaxDependencyDepth(graph)
  if (maxDepth > 10) {
    warnings.push({
      type: "LONG_DEPENDENCY_CHAIN",
      message: `Long dependency chain detected (depth: ${maxDepth})`,
    })
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Check if adding a dependency would create a cycle
 */
export function wouldCreateCycle(
  graph: TaskGraph,
  taskId: string,
  dependencyId: string
): boolean {
  // If taskId is reachable from dependencyId, adding this edge creates a cycle
  const visited = new Set<string>()
  const queue = [dependencyId]

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current === taskId) {
      return true
    }

    if (visited.has(current)) continue
    visited.add(current)

    const task = graph.tasks[current]
    if (task) {
      queue.push(...task.dependencies)
    }
  }

  return false
}

/**
 * Find all cycles in the graph
 */
function findCycles(graph: TaskGraph): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const path: string[] = []

  function dfs(taskId: string): void {
    if (recursionStack.has(taskId)) {
      // Found a cycle
      const cycleStart = path.indexOf(taskId)
      cycles.push([...path.slice(cycleStart), taskId])
      return
    }

    if (visited.has(taskId)) return

    visited.add(taskId)
    recursionStack.add(taskId)
    path.push(taskId)

    const task = graph.tasks[taskId]
    if (task) {
      for (const depId of task.dependencies) {
        dfs(depId)
      }
    }

    path.pop()
    recursionStack.delete(taskId)
  }

  for (const taskId of Object.keys(graph.tasks)) {
    dfs(taskId)
  }

  return cycles
}

/**
 * Get all tasks reachable from root tasks
 */
function getReachableTasks(graph: TaskGraph): Set<string> {
  const reachable = new Set<string>()
  const queue = [...graph.rootTasks]

  while (queue.length > 0) {
    const current = queue.shift()!

    if (reachable.has(current)) continue
    reachable.add(current)

    // Find tasks that depend on this one
    for (const [id, task] of Object.entries(graph.tasks)) {
      if (task.dependencies.includes(current) && !reachable.has(id)) {
        queue.push(id)
      }
    }
  }

  return reachable
}

/**
 * Get maximum dependency depth
 */
function getMaxDependencyDepth(graph: TaskGraph): number {
  const depths = new Map<string, number>()

  function getDepth(taskId: string, visited: Set<string>): number {
    if (visited.has(taskId)) return 0 // Cycle detected
    if (depths.has(taskId)) return depths.get(taskId)!

    visited.add(taskId)

    const task = graph.tasks[taskId]
    if (!task || task.dependencies.length === 0) {
      depths.set(taskId, 0)
      return 0
    }

    const maxDepDepth = Math.max(
      ...task.dependencies.map((depId) => getDepth(depId, visited))
    )

    const depth = maxDepDepth + 1
    depths.set(taskId, depth)
    return depth
  }

  let maxDepth = 0
  for (const taskId of Object.keys(graph.tasks)) {
    maxDepth = Math.max(maxDepth, getDepth(taskId, new Set()))
  }

  return maxDepth
}

// =============================================================================
// Dependency Analysis
// =============================================================================

/**
 * Get dependency information for a task
 */
export function getTaskDependencyInfo(
  graph: TaskGraph,
  taskId: string
): TaskDependencyInfo | null {
  const task = graph.tasks[taskId]
  if (!task) return null

  // Get all dependencies (including transitive)
  const allDependencies = new Set<string>()
  const queue = [...task.dependencies]

  while (queue.length > 0) {
    const depId = queue.shift()!
    if (allDependencies.has(depId)) continue
    allDependencies.add(depId)

    const depTask = graph.tasks[depId]
    if (depTask) {
      queue.push(...depTask.dependencies)
    }
  }

  // Get direct dependents
  const directDependents: string[] = []
  for (const [id, t] of Object.entries(graph.tasks)) {
    if (t.dependencies.includes(taskId)) {
      directDependents.push(id)
    }
  }

  // Get all dependents (including transitive)
  const allDependents = new Set<string>()
  const depQueue = [...directDependents]

  while (depQueue.length > 0) {
    const depId = depQueue.shift()!
    if (allDependents.has(depId)) continue
    allDependents.add(depId)

    for (const [id, t] of Object.entries(graph.tasks)) {
      if (t.dependencies.includes(depId) && !allDependents.has(id)) {
        depQueue.push(id)
      }
    }
  }

  // Calculate depth
  const depth = getTaskDepth(graph, taskId)

  return {
    taskId,
    directDependencies: task.dependencies,
    allDependencies: Array.from(allDependencies),
    directDependents,
    allDependents: Array.from(allDependents),
    depth,
  }
}

/**
 * Get depth of a task (distance from root)
 */
function getTaskDepth(graph: TaskGraph, taskId: string): number {
  const task = graph.tasks[taskId]
  if (!task) return -1

  if (task.dependencies.length === 0) return 0

  let maxDepth = 0
  for (const depId of task.dependencies) {
    const depDepth = getTaskDepth(graph, depId)
    if (depDepth >= 0) {
      maxDepth = Math.max(maxDepth, depDepth + 1)
    }
  }

  return maxDepth
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get statistics about the task graph
 */
export function getTaskGraphStats(graph: TaskGraph): TaskGraphStats {
  const tasks = Object.values(graph.tasks)

  const completed = tasks.filter((t) => t.status === "completed")
  const failed = tasks.filter((t) => t.status === "failed")
  const skipped = tasks.filter((t) => t.status === "skipped")
  const inProgress = tasks.filter((t) => t.status === "in_progress")
  const pending = tasks.filter((t) => t.status === "pending")
  const blocked = tasks.filter((t) => t.status === "blocked")

  // Calculate durations
  let totalDurationMs = 0
  let completedWithDuration = 0

  for (const task of tasks) {
    if (task.startedAt && task.completedAt) {
      totalDurationMs += task.completedAt.getTime() - task.startedAt.getTime()
      completedWithDuration++
    }
  }

  // Calculate total retries
  const totalRetries = tasks.reduce((sum, t) => sum + t.retryCount, 0)

  return {
    totalTasks: tasks.length,
    completedTasks: completed.length,
    failedTasks: failed.length,
    skippedTasks: skipped.length,
    inProgressTasks: inProgress.length,
    pendingTasks: pending.length,
    blockedTasks: blocked.length,
    totalRetries,
    totalDurationMs,
    averageTaskDurationMs:
      completedWithDuration > 0 ? totalDurationMs / completedWithDuration : 0,
  }
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Clone a task graph (deep copy)
 */
export function cloneTaskGraph(graph: TaskGraph): TaskGraph {
  return {
    id: graph.id,
    goal: graph.goal,
    rootTasks: [...graph.rootTasks],
    tasks: Object.fromEntries(
      Object.entries(graph.tasks).map(([id, task]) => [
        id,
        {
          ...task,
          dependencies: [...task.dependencies],
          subtasks: task.subtasks?.map((st) => ({ ...st })),
          metadata: task.metadata ? { ...task.metadata } : undefined,
          startedAt: task.startedAt ? new Date(task.startedAt) : undefined,
          completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
        },
      ])
    ),
    createdAt: new Date(graph.createdAt),
    updatedAt: new Date(graph.updatedAt),
  }
}
