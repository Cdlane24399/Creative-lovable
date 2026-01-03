/**
 * Agent Context Management System
 *
 * Provides deep awareness of the sandbox state, project structure,
 * build status, and execution history for intelligent agentic decisions.
 *
 * UPDATED: Now uses write-through caching via ContextService
 * - Database writes happen immediately (no data loss on crash)
 * - In-memory cache for fast reads
 * - TaskGraph is the primary planning system (legacy string arrays deprecated)
 *
 * Features:
 * - In-memory caching for fast access
 * - Database persistence for state recovery
 * - Write-through saves (no debouncing = no data loss)
 * - Task graph support for enhanced planning
 */

// Re-export types from context-types for backward compatibility
export type {
  FileInfo,
  BuildStatus,
  ServerState,
  ToolExecution,
  AgentContext,
  TaskStatus,
  Task,
  TaskGraph,
} from "./context-types"

import type {
  FileInfo,
  BuildStatus,
  ServerState,
  ToolExecution,
  AgentContext,
  TaskGraph,
} from "./context-types"

// =============================================================================
// In-Memory Context Store (Fast Read Cache)
// =============================================================================

/** Global context store (per projectId) - in-memory cache */
const contextStore = new Map<string, AgentContext>()

/** Track contexts that are being loaded from DB (prevent duplicate loads) */
const loadingContexts = new Map<string, Promise<AgentContext>>()

/** Flag to enable async persistence (set to true for production) */
const ENABLE_ASYNC_PERSISTENCE = true

/** Context TTL in milliseconds (30 minutes) */
const CONTEXT_TTL_MS = 30 * 60 * 1000

/** Maximum number of contexts to keep in memory */
const MAX_CONTEXTS = 100

/** Cleanup interval in milliseconds (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

/** Track when cleanup was last run */
let lastCleanup = Date.now()

/**
 * Cleanup expired contexts to prevent memory leaks
 * Runs automatically when accessing contexts
 */
function cleanupExpiredContexts(): void {
  const now = Date.now()
  
  // Only run cleanup every CLEANUP_INTERVAL_MS
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return
  }
  lastCleanup = now

  const expiredKeys: string[] = []
  const ttlThreshold = now - CONTEXT_TTL_MS

  // Find expired contexts
  for (const [key, context] of contextStore) {
    if (context.lastActivity.getTime() < ttlThreshold) {
      expiredKeys.push(key)
    }
  }

  // Remove expired contexts
  for (const key of expiredKeys) {
    contextStore.delete(key)
    console.log(`[agent-context] Expired context removed: ${key}`)
  }

  // If still over limit, remove oldest contexts
  if (contextStore.size > MAX_CONTEXTS) {
    const entries = Array.from(contextStore.entries())
      .sort((a, b) => a[1].lastActivity.getTime() - b[1].lastActivity.getTime())
    
    const toRemove = entries.slice(0, contextStore.size - MAX_CONTEXTS)
    for (const [key] of toRemove) {
      contextStore.delete(key)
      console.log(`[agent-context] Evicted old context: ${key}`)
    }
  }
}

// =============================================================================
// Context Creation & Retrieval
// =============================================================================

/**
 * Create a new empty agent context
 */
function createEmptyContext(projectId: string): AgentContext {
  return {
    projectId,
    files: new Map(),
    dependencies: new Map(),
    toolHistory: [],
    errorHistory: [],
    completedSteps: [],
    createdAt: new Date(),
    lastActivity: new Date(),
    isDirty: false,
  }
}

/**
 * Get or create agent context for a project (synchronous, in-memory only)
 * Use getAgentContextAsync for database-backed context loading
 */
export function getAgentContext(projectId: string): AgentContext {
  // Run cleanup on access
  cleanupExpiredContexts()
  
  let context = contextStore.get(projectId)

  if (!context) {
    context = createEmptyContext(projectId)
    contextStore.set(projectId, context)
  }

  return context
}

/**
 * Get agent context with database hydration
 * Loads from database if not in memory, caches result
 */
export async function getAgentContextAsync(projectId: string): Promise<AgentContext> {
  // Check in-memory cache first
  const cached = contextStore.get(projectId)
  if (cached) {
    return cached
  }

  // Check if already loading
  const loading = loadingContexts.get(projectId)
  if (loading) {
    return loading
  }

  // Load from database using new repository
  const loadPromise = (async () => {
    try {
      const { getContextRepository } = await import("@/lib/db/repositories")
      const contextRepo = getContextRepository()
      const dbContext = await contextRepo.findByProjectId(projectId)

      if (dbContext) {
        // Convert repository format to AgentContext
        const context: AgentContext = {
          projectId: dbContext.projectId,
          projectName: dbContext.projectName,
          projectDir: dbContext.projectDir,
          sandboxId: dbContext.sandboxId,
          files: dbContext.files,
          dependencies: dbContext.dependencies,
          buildStatus: dbContext.buildStatus,
          serverState: dbContext.serverState,
          toolHistory: dbContext.toolHistory,
          errorHistory: dbContext.errorHistory,
          currentPlan: undefined, // Deprecated
          completedSteps: dbContext.completedSteps,
          taskGraph: dbContext.taskGraph,
          createdAt: dbContext.createdAt,
          lastActivity: dbContext.lastActivity,
          isDirty: false,
        }
        contextStore.set(projectId, context)
        return context
      }

      // No context in DB, create new one
      const newContext = createEmptyContext(projectId)
      contextStore.set(projectId, newContext)
      return newContext
    } finally {
      loadingContexts.delete(projectId)
    }
  })()

  loadingContexts.set(projectId, loadPromise)
  return loadPromise
}

/**
 * Persist context to database (write-through)
 * Non-blocking - errors are logged but don't throw
 */
async function persistContext(context: AgentContext): Promise<void> {
  if (!ENABLE_ASYNC_PERSISTENCE) return

  try {
    const { getContextRepository, getProjectRepository } = await import("@/lib/db/repositories")
    const contextRepo = getContextRepository()
    const projectRepo = getProjectRepository()

    // Ensure project exists first to prevent FK violations
    await projectRepo.ensureExists(context.projectId, context.projectName || "Untitled Project")

    // Save context
    await contextRepo.upsert(context.projectId, {
      projectName: context.projectName,
      projectDir: context.projectDir,
      sandboxId: context.sandboxId,
      files: context.files,
      dependencies: context.dependencies,
      buildStatus: context.buildStatus,
      serverState: context.serverState,
      toolHistory: context.toolHistory,
      errorHistory: context.errorHistory,
      taskGraph: context.taskGraph,
      completedSteps: context.completedSteps,
    })

    context.isDirty = false
  } catch (error) {
    console.error(`[agent-context] Failed to persist context for ${context.projectId}:`, error)
  }
}

/**
 * Mark context as dirty and trigger async save
 * Uses write-through pattern: save immediately but don't block
 */
function markDirtyAndSave(context: AgentContext): void {
  context.isDirty = true
  context.lastActivity = new Date()

  // Fire and forget - persist asynchronously
  persistContext(context).catch(() => {
    // Error already logged in persistContext
  })
}

// =============================================================================
// File Operations
// =============================================================================

/**
 * Update context after file operation
 */
export function updateFileInContext(
  projectId: string,
  path: string,
  content?: string,
  action: "created" | "updated" | "deleted" = "updated"
): void {
  const context = getAgentContext(projectId)

  if (action === "deleted") {
    context.files.delete(path)
  } else {
    context.files.set(path, {
      path,
      content,
      action,
      lastModified: new Date(),
    })
  }

  markDirtyAndSave(context)
}

/**
 * Bulk update files in context
 */
export function updateFilesInContext(
  projectId: string,
  files: Array<{ path: string; content?: string; action?: "created" | "updated" | "deleted" }>
): void {
  const context = getAgentContext(projectId)

  for (const file of files) {
    const action = file.action ?? "updated"
    if (action === "deleted") {
      context.files.delete(file.path)
    } else {
      context.files.set(file.path, {
        path: file.path,
        content: file.content,
        action,
        lastModified: new Date(),
      })
    }
  }

  markDirtyAndSave(context)
}

// =============================================================================
// Tool Execution Recording
// =============================================================================

/**
 * Record tool execution for learning
 */
export function recordToolExecution(
  projectId: string,
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown> | undefined,
  success: boolean,
  error?: string,
  startTime: Date = new Date()
): void {
  const context = getAgentContext(projectId)

  context.toolHistory.push({
    toolName,
    input,
    output,
    success,
    error,
    timestamp: new Date(),
    durationMs: Date.now() - startTime.getTime(),
  })

  // Keep last 50 executions
  if (context.toolHistory.length > 50) {
    context.toolHistory = context.toolHistory.slice(-50)
  }

  if (error) {
    context.errorHistory.push(`[${toolName}] ${error}`)
    if (context.errorHistory.length > 20) {
      context.errorHistory = context.errorHistory.slice(-20)
    }
  }

  markDirtyAndSave(context)
}

// =============================================================================
// Build & Server State
// =============================================================================

/**
 * Update build status in context
 */
export function updateBuildStatus(
  projectId: string,
  status: Partial<BuildStatus>
): void {
  const context = getAgentContext(projectId)

  context.buildStatus = {
    hasErrors: status.hasErrors ?? false,
    hasWarnings: status.hasWarnings ?? false,
    errors: status.errors ?? [],
    warnings: status.warnings ?? [],
    lastChecked: new Date(),
  }

  markDirtyAndSave(context)
}

/**
 * Update server state in context
 */
export function updateServerState(
  projectId: string,
  state: Partial<ServerState>
): void {
  const context = getAgentContext(projectId)

  context.serverState = {
    isRunning: state.isRunning ?? context.serverState?.isRunning ?? false,
    port: state.port ?? context.serverState?.port ?? 3000,
    url: state.url ?? context.serverState?.url,
    logs: state.logs ?? context.serverState?.logs ?? [],
    lastStarted: state.isRunning ? new Date() : context.serverState?.lastStarted,
  }

  markDirtyAndSave(context)
}

// =============================================================================
// Project Information
// =============================================================================

/**
 * Set project info in context
 */
export function setProjectInfo(
  projectId: string,
  info: {
    projectName?: string
    projectDir?: string
    sandboxId?: string
  }
): void {
  const context = getAgentContext(projectId)

  if (info.projectName) context.projectName = info.projectName
  if (info.projectDir) context.projectDir = info.projectDir
  if (info.sandboxId) context.sandboxId = info.sandboxId

  markDirtyAndSave(context)
}

/**
 * Add dependency to context
 */
export function addDependency(
  projectId: string,
  packageName: string,
  version: string
): void {
  const context = getAgentContext(projectId)
  context.dependencies.set(packageName, version)
  markDirtyAndSave(context)
}

/**
 * Bulk add dependencies to context
 */
export function addDependencies(
  projectId: string,
  dependencies: Record<string, string>
): void {
  const context = getAgentContext(projectId)
  for (const [pkg, version] of Object.entries(dependencies)) {
    context.dependencies.set(pkg, version)
  }
  markDirtyAndSave(context)
}

// =============================================================================
// Planning (Legacy String Array - DEPRECATED)
// =============================================================================

/**
 * @deprecated Use setTaskGraph instead for proper task management
 * Set current plan (legacy format - string array)
 */
export function setCurrentPlan(projectId: string, steps: string[]): void {
  const context = getAgentContext(projectId)
  
  // Convert to TaskGraph for unified handling
  const { createTaskGraph, createTask } = require("./planning/task-graph")
  
  const tasks = steps.map((step, index) => createTask({
    description: step,
    dependencies: index > 0 ? [`task-${index - 1}`] : [],
  }))
  
  // Override IDs for predictable referencing
  tasks.forEach((task: any, index: number) => {
    task.id = `task-${index}`
  })
  
  const taskGraph = createTaskGraph({
    goal: "Plan execution",
    tasks: tasks.map((t: any) => ({
      description: t.description,
      dependencies: t.dependencies,
    })),
  })
  
  context.taskGraph = taskGraph
  context.completedSteps = []
  
  markDirtyAndSave(context)
}

/**
 * @deprecated Use updateTaskStatus instead
 * Mark step as completed (legacy format)
 */
export function completeStep(projectId: string, step: string): void {
  const context = getAgentContext(projectId)
  context.completedSteps.push(step)
  
  // Also update TaskGraph if present
  if (context.taskGraph) {
    const tasks = Object.values(context.taskGraph.tasks)
    const matchingTask = tasks.find(t => t.description === step)
    if (matchingTask) {
      matchingTask.status = "completed"
      matchingTask.completedAt = new Date()
    }
  }
  
  markDirtyAndSave(context)
}

// =============================================================================
// Task Graph (Primary Planning System)
// =============================================================================

/**
 * Set task graph for planning
 */
export function setTaskGraph(projectId: string, taskGraph: TaskGraph): void {
  const context = getAgentContext(projectId)
  context.taskGraph = taskGraph
  context.completedSteps = [] // Reset legacy tracking
  markDirtyAndSave(context)
}

/**
 * Get task graph from context
 */
export function getTaskGraph(projectId: string): TaskGraph | undefined {
  return getAgentContext(projectId).taskGraph
}

/**
 * Update task status in task graph
 */
export function updateTaskStatus(
  projectId: string,
  taskId: string,
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked" | "skipped",
  error?: string
): void {
  const context = getAgentContext(projectId)
  
  if (!context.taskGraph) return
  
  const task = context.taskGraph.tasks[taskId]
  if (!task) return
  
  task.status = status
  if (error) task.error = error
  if (status === "completed") task.completedAt = new Date()
  if (status === "in_progress") task.startedAt = new Date()
  
  context.taskGraph.updatedAt = new Date()
  
  markDirtyAndSave(context)
}

/**
 * Clear task graph
 */
export function clearTaskGraph(projectId: string): void {
  const context = getAgentContext(projectId)
  context.taskGraph = undefined
  markDirtyAndSave(context)
}

// =============================================================================
// Context Summary & Recommendations
// =============================================================================

/**
 * Generate context summary for the agent
 * This provides the AI with awareness of current state
 */
export function generateContextSummary(projectId: string): string {
  const context = getAgentContext(projectId)

  const parts: string[] = []

  // Project info
  if (context.projectName) {
    parts.push(`Project: ${context.projectName}`)
  }

  // Files summary
  if (context.files.size > 0) {
    const fileList = Array.from(context.files.keys()).slice(0, 20)
    parts.push(`Files (${context.files.size} total): ${fileList.join(", ")}${context.files.size > 20 ? "..." : ""}`)
  }

  // Dependencies
  if (context.dependencies.size > 0) {
    const deps = Array.from(context.dependencies.entries())
      .slice(0, 10)
      .map(([name, ver]) => `${name}@${ver}`)
    parts.push(`Dependencies: ${deps.join(", ")}${context.dependencies.size > 10 ? "..." : ""}`)
  }

  // Build status
  if (context.buildStatus) {
    if (context.buildStatus.hasErrors) {
      parts.push(`BUILD ERRORS: ${context.buildStatus.errors.slice(0, 3).join("; ")}`)
    } else if (context.buildStatus.hasWarnings) {
      parts.push(`Build warnings: ${context.buildStatus.warnings.slice(0, 2).join("; ")}`)
    } else {
      parts.push("Build: OK")
    }
  }

  // Server state
  if (context.serverState) {
    if (context.serverState.isRunning && context.serverState.url) {
      parts.push(`Server: Running at ${context.serverState.url}`)
    } else {
      parts.push("Server: Not running")
    }
  }

  // Recent errors
  if (context.errorHistory.length > 0) {
    parts.push(`Recent issues: ${context.errorHistory.slice(-3).join("; ")}`)
  }

  // Task graph progress (primary planning system)
  if (context.taskGraph) {
    const tasks = Object.values(context.taskGraph.tasks)
    const completed = tasks.filter(t => t.status === "completed").length
    const failed = tasks.filter(t => t.status === "failed").length
    const inProgress = tasks.filter(t => t.status === "in_progress").length
    parts.push(`Task graph: ${completed}/${tasks.length} completed${failed > 0 ? `, ${failed} failed` : ""}${inProgress > 0 ? `, ${inProgress} in progress` : ""}`)
  }

  return parts.length > 0 ? parts.join("\n") : "No context available yet."
}

/**
 * Get recommendations based on context
 * Helps the agent decide next steps
 */
export function getContextRecommendations(projectId: string): string[] {
  const context = getAgentContext(projectId)
  const recommendations: string[] = []

  // Check for build errors
  if (context.buildStatus?.hasErrors) {
    recommendations.push("PRIORITY: Fix build errors before proceeding")
    const lastError = context.buildStatus.errors[0]
    if (lastError) {
      recommendations.push(`First error to fix: ${lastError}`)
    }
  }

  // Server not running
  if (context.projectName && !context.serverState?.isRunning) {
    recommendations.push("Consider starting the dev server to preview changes")
  }

  // Too many recent errors
  const recentErrors = context.toolHistory.filter(
    t => !t.success && Date.now() - t.timestamp.getTime() < 60000
  ).length

  if (recentErrors >= 3) {
    recommendations.push("Multiple recent failures - consider using getBuildStatus to diagnose")
  }

  // Task graph recommendations
  if (context.taskGraph) {
    const tasks = Object.values(context.taskGraph.tasks)
    const blocked = tasks.filter(t => t.status === "blocked")
    const failed = tasks.filter(t => t.status === "failed")
    const pending = tasks.filter(t => t.status === "pending")

    if (failed.length > 0) {
      recommendations.push(`Failed tasks: ${failed.map(t => t.description).join(", ")}`)
    }

    if (blocked.length > 0) {
      recommendations.push(`Blocked tasks waiting on dependencies: ${blocked.length}`)
    }

    // Find next executable task
    const executable = pending.filter(task =>
      task.dependencies.every(depId => {
        const dep = context.taskGraph?.tasks[depId]
        return dep?.status === "completed"
      })
    )

    if (executable.length > 0) {
      recommendations.push(`Next executable tasks: ${executable.map(t => t.description).slice(0, 3).join(", ")}`)
    }
  }

  return recommendations
}

// =============================================================================
// Context Management
// =============================================================================

/**
 * Clear context for a project (in-memory only)
 */
export function clearContext(projectId: string): void {
  contextStore.delete(projectId)
}

/**
 * Clear context and delete from database
 */
export async function deleteContext(projectId: string): Promise<void> {
  clearContext(projectId)
  
  try {
    const { getContextRepository } = await import("@/lib/db/repositories")
    const contextRepo = getContextRepository()
    await contextRepo.delete(projectId)
  } catch (error) {
    console.error(`[agent-context] Failed to delete context from DB for ${projectId}:`, error)
  }
}

/**
 * Get all active contexts (for debugging)
 */
export function getAllContexts(): Map<string, AgentContext> {
  return new Map(contextStore)
}

/**
 * Force save a context immediately
 */
export async function saveContext(projectId: string): Promise<boolean> {
  const context = contextStore.get(projectId)
  if (!context) return false
  
  await persistContext(context)
  return true
}

/**
 * Flush all pending saves (for graceful shutdown)
 * With write-through, this just ensures all async saves complete
 */
export async function flushAllContexts(): Promise<void> {
  const savePromises: Promise<void>[] = []
  
  for (const [projectId, context] of contextStore) {
    if (context.isDirty) {
      savePromises.push(persistContext(context))
    }
  }
  
  await Promise.allSettled(savePromises)
}

/**
 * Check if context was loaded from database
 */
export function isContextPersisted(projectId: string): boolean {
  const context = contextStore.get(projectId)
  return context !== undefined && !context.isDirty
}

// =============================================================================
// Lifecycle Hooks
// =============================================================================

// Register process exit handler to flush contexts
if (typeof process !== "undefined") {
  const exitHandler = async () => {
    console.log("[agent-context] Flushing all contexts before exit...")
    await flushAllContexts()
  }

  process.on("beforeExit", exitHandler)
  process.on("SIGINT", async () => {
    await exitHandler()
    process.exit(0)
  })
  process.on("SIGTERM", async () => {
    await exitHandler()
    process.exit(0)
  })
}
