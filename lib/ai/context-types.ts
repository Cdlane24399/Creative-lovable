/**
 * Shared Type Definitions for Agent Context System
 *
 * These types are used across the agent context, persistence layer,
 * and planning system for consistent data structures.
 */

// =============================================================================
// Core Context Types
// =============================================================================

/**
 * File information with content tracking
 */
export interface FileInfo {
  path: string
  content?: string
  contentHash?: string // MD5/SHA hash for efficient change detection
  lastModified: Date
  action?: "created" | "updated" | "deleted"
}

/**
 * Build status tracking
 */
export interface BuildStatus {
  hasErrors: boolean
  hasWarnings: boolean
  errors: string[]
  warnings: string[]
  lastChecked: Date
}

/**
 * Dev server state
 */
export interface ServerState {
  isRunning: boolean
  port: number
  url?: string
  logs: string[]
  lastStarted?: Date
}

/**
 * Tool execution history for learning and diagnostics
 */
export interface ToolExecution {
  toolName: string
  input: Record<string, unknown>
  output?: Record<string, unknown>
  success: boolean
  error?: string
  timestamp: Date
  durationMs: number
}

// =============================================================================
// Task Graph Types (Planning System)
// =============================================================================

/**
 * Task status in the execution lifecycle
 */
export type TaskStatus =
  | "pending" // Not yet started
  | "in_progress" // Currently executing
  | "completed" // Successfully finished
  | "failed" // Execution failed
  | "blocked" // Waiting on dependencies
  | "skipped" // Skipped due to recovery strategy

/**
 * Individual task in the task graph
 */
export interface Task {
  id: string
  description: string
  status: TaskStatus
  dependencies: string[] // Task IDs that must complete first
  subtasks?: Task[] // Nested sub-tasks
  retryCount: number
  maxRetries: number
  error?: string
  startedAt?: Date
  completedAt?: Date
  metadata?: Record<string, unknown>
}

/**
 * Task graph representing a complete plan
 */
export interface TaskGraph {
  id: string
  goal: string
  rootTasks: string[] // IDs of top-level tasks
  tasks: Record<string, Task> // All tasks by ID
  createdAt: Date
  updatedAt: Date
}

// =============================================================================
// Agent Context (Complete State)
// =============================================================================

/**
 * Complete agent context for a project
 */
export interface AgentContext {
  // Project identification
  projectId: string
  projectName?: string
  projectDir?: string

  // Current state awareness
  files: Map<string, FileInfo>
  dependencies: Map<string, string> // package -> version
  buildStatus?: BuildStatus
  serverState?: ServerState

  // Execution history for learning
  toolHistory: ToolExecution[]
  errorHistory: string[]

  // Planning state (legacy - for backward compatibility)
  currentPlan?: string[]
  completedSteps: string[]

  // Task graph (new planning system)
  taskGraph?: TaskGraph

  // Sandbox reference
  sandboxId?: string

  // Metadata
  createdAt: Date
  lastActivity: Date

  // Persistence tracking
  isDirty?: boolean // Needs to be saved to database
}

// =============================================================================
// Serialized Types (for Database Storage)
// =============================================================================

/**
 * Serialized file info for JSON storage
 */
export interface SerializedFileInfo {
  path: string
  content?: string
  contentHash?: string
  lastModified?: string // ISO date string
  action?: "created" | "updated" | "deleted"
}

/**
 * Serialized build status for JSON storage
 */
export interface SerializedBuildStatus {
  hasErrors: boolean
  hasWarnings: boolean
  errors: string[]
  warnings: string[]
  lastChecked: string // ISO date string
}

/**
 * Serialized server state for JSON storage
 */
export interface SerializedServerState {
  isRunning: boolean
  port: number
  url?: string
  logs: string[]
  lastStarted?: string // ISO date string
}

/**
 * Serialized tool execution for JSON storage
 */
export interface SerializedToolExecution {
  toolName: string
  input: Record<string, unknown>
  output?: Record<string, unknown>
  success: boolean
  error?: string
  timestamp: string // ISO date string
  durationMs: number
}

/**
 * Serialized task for JSON storage
 */
export interface SerializedTask {
  id: string
  description: string
  status: TaskStatus
  dependencies: string[]
  subtasks?: SerializedTask[]
  retryCount: number
  maxRetries: number
  error?: string
  startedAt?: string
  completedAt?: string
  metadata?: Record<string, unknown>
}

/**
 * Serialized task graph for JSON storage
 */
export interface SerializedTaskGraph {
  id: string
  goal: string
  rootTasks: string[]
  tasks: Record<string, SerializedTask>
  createdAt: string
  updatedAt: string
}

/**
 * Database row for agent_context table
 */
export interface AgentContextRow {
  project_id: string
  project_name: string | null
  project_dir: string | null
  sandbox_id: string | null
  files: Record<string, SerializedFileInfo>
  dependencies: Record<string, string>
  build_status: SerializedBuildStatus | null
  server_state: SerializedServerState | null
  tool_history: SerializedToolExecution[]
  error_history: string[]
  current_plan: string[] | null
  completed_steps: string[]
  task_graph: SerializedTaskGraph | null
  updated_at: string
}

// =============================================================================
// Serialization Utilities
// =============================================================================

/**
 * Convert AgentContext to database row format
 */
export function serializeContext(context: AgentContext): Omit<AgentContextRow, "updated_at"> {
  return {
    project_id: context.projectId,
    project_name: context.projectName ?? null,
    project_dir: context.projectDir ?? null,
    sandbox_id: context.sandboxId ?? null,
    files: serializeFilesMap(context.files),
    dependencies: Object.fromEntries(context.dependencies),
    build_status: context.buildStatus ? serializeBuildStatus(context.buildStatus) : null,
    server_state: context.serverState ? serializeServerState(context.serverState) : null,
    tool_history: context.toolHistory.map(serializeToolExecution),
    error_history: context.errorHistory,
    current_plan: context.currentPlan ?? null,
    completed_steps: context.completedSteps,
    task_graph: context.taskGraph ? serializeTaskGraph(context.taskGraph) : null,
  }
}

/**
 * Convert database row to AgentContext
 */
export function deserializeContext(row: AgentContextRow): AgentContext {
  return {
    projectId: row.project_id,
    projectName: row.project_name ?? undefined,
    projectDir: row.project_dir ?? undefined,
    sandboxId: row.sandbox_id ?? undefined,
    files: deserializeFilesMap(row.files),
    dependencies: new Map(Object.entries(row.dependencies)),
    buildStatus: row.build_status ? deserializeBuildStatus(row.build_status) : undefined,
    serverState: row.server_state ? deserializeServerState(row.server_state) : undefined,
    toolHistory: row.tool_history.map(deserializeToolExecution),
    errorHistory: row.error_history,
    currentPlan: row.current_plan ?? undefined,
    completedSteps: row.completed_steps,
    taskGraph: row.task_graph ? deserializeTaskGraph(row.task_graph) : undefined,
    createdAt: new Date(row.updated_at), // Use updated_at as approximation
    lastActivity: new Date(row.updated_at),
    isDirty: false,
  }
}

// =============================================================================
// Helper Serialization Functions
// =============================================================================

function serializeFilesMap(files: Map<string, FileInfo>): Record<string, SerializedFileInfo> {
  const result: Record<string, SerializedFileInfo> = {}
  for (const [path, info] of files) {
    result[path] = {
      path: info.path,
      content: info.content,
      contentHash: info.contentHash,
      lastModified: info.lastModified?.toISOString(),
      action: info.action,
    }
  }
  return result
}

function deserializeFilesMap(files: Record<string, SerializedFileInfo>): Map<string, FileInfo> {
  const result = new Map<string, FileInfo>()
  for (const [path, info] of Object.entries(files)) {
    result.set(path, {
      path: info.path,
      content: info.content,
      contentHash: info.contentHash,
      lastModified: info.lastModified ? new Date(info.lastModified) : new Date(),
      action: info.action,
    })
  }
  return result
}

function serializeBuildStatus(status: BuildStatus): SerializedBuildStatus {
  return {
    hasErrors: status.hasErrors,
    hasWarnings: status.hasWarnings,
    errors: status.errors,
    warnings: status.warnings,
    lastChecked: status.lastChecked.toISOString(),
  }
}

function deserializeBuildStatus(status: SerializedBuildStatus): BuildStatus {
  return {
    hasErrors: status.hasErrors,
    hasWarnings: status.hasWarnings,
    errors: status.errors,
    warnings: status.warnings,
    lastChecked: new Date(status.lastChecked),
  }
}

function serializeServerState(state: ServerState): SerializedServerState {
  return {
    isRunning: state.isRunning,
    port: state.port,
    url: state.url,
    logs: state.logs,
    lastStarted: state.lastStarted?.toISOString(),
  }
}

function deserializeServerState(state: SerializedServerState): ServerState {
  return {
    isRunning: state.isRunning,
    port: state.port,
    url: state.url,
    logs: state.logs,
    lastStarted: state.lastStarted ? new Date(state.lastStarted) : undefined,
  }
}

function serializeToolExecution(exec: ToolExecution): SerializedToolExecution {
  return {
    toolName: exec.toolName,
    input: exec.input,
    output: exec.output,
    success: exec.success,
    error: exec.error,
    timestamp: exec.timestamp.toISOString(),
    durationMs: exec.durationMs,
  }
}

function deserializeToolExecution(exec: SerializedToolExecution): ToolExecution {
  return {
    toolName: exec.toolName,
    input: exec.input,
    output: exec.output,
    success: exec.success,
    error: exec.error,
    timestamp: new Date(exec.timestamp),
    durationMs: exec.durationMs,
  }
}

function serializeTask(task: Task): SerializedTask {
  return {
    id: task.id,
    description: task.description,
    status: task.status,
    dependencies: task.dependencies,
    subtasks: task.subtasks?.map(serializeTask),
    retryCount: task.retryCount,
    maxRetries: task.maxRetries,
    error: task.error,
    startedAt: task.startedAt?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    metadata: task.metadata,
  }
}

function deserializeTask(task: SerializedTask): Task {
  return {
    id: task.id,
    description: task.description,
    status: task.status,
    dependencies: task.dependencies,
    subtasks: task.subtasks?.map(deserializeTask),
    retryCount: task.retryCount,
    maxRetries: task.maxRetries,
    error: task.error,
    startedAt: task.startedAt ? new Date(task.startedAt) : undefined,
    completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
    metadata: task.metadata,
  }
}

function serializeTaskGraph(graph: TaskGraph): SerializedTaskGraph {
  const tasks: Record<string, SerializedTask> = {}
  for (const [id, task] of Object.entries(graph.tasks)) {
    tasks[id] = serializeTask(task)
  }
  return {
    id: graph.id,
    goal: graph.goal,
    rootTasks: graph.rootTasks,
    tasks,
    createdAt: graph.createdAt.toISOString(),
    updatedAt: graph.updatedAt.toISOString(),
  }
}

function deserializeTaskGraph(graph: SerializedTaskGraph): TaskGraph {
  const tasks: Record<string, Task> = {}
  for (const [id, task] of Object.entries(graph.tasks)) {
    tasks[id] = deserializeTask(task)
  }
  return {
    id: graph.id,
    goal: graph.goal,
    rootTasks: graph.rootTasks,
    tasks,
    createdAt: new Date(graph.createdAt),
    updatedAt: new Date(graph.updatedAt),
  }
}
