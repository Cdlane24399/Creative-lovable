/**
 * Agent Context Service
 * 
 * Manages agent context with write-through caching.
 * Replaces the problematic debounced save system.
 * 
 * Key Improvements:
 * - Write-through: Database first, then memory cache
 * - No data loss on crashes
 * - Unified TaskGraph planning (deprecates legacy string arrays)
 * - Atomic updates for consistency
 * 
 * Usage:
 * ```typescript
 * const contextService = getContextService()
 * 
 * // Get or create context
 * const context = await contextService.getContext(projectId)
 * 
 * // Update context (automatically persisted)
 * await contextService.updateFile(projectId, 'app/page.tsx', content, 'updated')
 * 
 * // Record tool execution
 * await contextService.recordToolExecution(projectId, {
 *   toolName: 'writeFile',
 *   input: { path: 'app/page.tsx' },
 *   output: { success: true },
 *   success: true,
 *   timestamp: new Date(),
 *   durationMs: 150
 * })
 * ```
 */

import {
  getContextRepository,
  type AgentContextData,
  type FileInfo,
  type BuildStatus,
  type ServerState,
  type ToolExecution,
  type ContextUpdate,
} from "@/lib/db/repositories"
import type { TaskGraph, Task, TaskStatus } from "@/lib/ai/context-types"

// =============================================================================
// Types
// =============================================================================

/**
 * Lightweight context for quick operations
 */
export interface ContextSummary {
  projectId: string
  projectName?: string
  hasTaskGraph: boolean
  fileCount: number
  hasErrors: boolean
  serverRunning: boolean
  lastActivity: Date
}

// =============================================================================
// In-Memory Cache
// =============================================================================

/**
 * In-memory cache for fast reads
 * Write-through: Always write to DB first, then update cache
 */
const contextCache = new Map<string, AgentContextData>()

// =============================================================================
// Service Implementation
// =============================================================================

export class ContextService {
  private readonly contextRepo = getContextRepository()

  /**
   * Get context for a project
   * Checks cache first, loads from DB if not found
   */
  async getContext(projectId: string): Promise<AgentContextData> {
    // Check cache first
    const cached = contextCache.get(projectId)
    if (cached) {
      return cached
    }

    // Load from database
    let context = await this.contextRepo.findByProjectId(projectId)

    // Create empty context if doesn't exist
    if (!context) {
      context = this.createEmptyContext(projectId)
      // Don't persist empty context until first update
    }

    // Cache it
    contextCache.set(projectId, context)

    return context
  }

  /**
   * Create empty context for a new project
   */
  private createEmptyContext(projectId: string): AgentContextData {
    return {
      projectId,
      files: new Map(),
      dependencies: new Map(),
      toolHistory: [],
      errorHistory: [],
      completedSteps: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    }
  }

  /**
   * Update project info
   */
  async setProjectInfo(
    projectId: string,
    info: {
      projectName?: string
      projectDir?: string
      sandboxId?: string
    }
  ): Promise<void> {
    // Write to database first
    await this.contextRepo.updateFields(projectId, {
      projectName: info.projectName,
      projectDir: info.projectDir,
      sandboxId: info.sandboxId,
    })

    // Update cache
    const cached = contextCache.get(projectId)
    if (cached) {
      if (info.projectName) cached.projectName = info.projectName
      if (info.projectDir) cached.projectDir = info.projectDir
      if (info.sandboxId) cached.sandboxId = info.sandboxId
      cached.lastActivity = new Date()
    }
  }

  /**
   * Update a file in context
   */
  async updateFile(
    projectId: string,
    path: string,
    content?: string,
    action: "created" | "updated" | "deleted" = "updated"
  ): Promise<void> {
    // Get current context
    const context = await this.getContext(projectId)

    // Update files map
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

    // Write to database
    await this.contextRepo.updateFields(projectId, {
      files: context.files,
    })

    // Update cache
    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Bulk update files
   */
  async updateFiles(
    projectId: string,
    files: Array<{
      path: string
      content?: string
      action?: "created" | "updated" | "deleted"
    }>
  ): Promise<void> {
    const context = await this.getContext(projectId)

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

    await this.contextRepo.updateFields(projectId, {
      files: context.files,
    })

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Add dependency to context
   */
  async addDependency(
    projectId: string,
    packageName: string,
    version: string
  ): Promise<void> {
    const context = await this.getContext(projectId)
    context.dependencies.set(packageName, version)

    await this.contextRepo.updateFields(projectId, {
      dependencies: context.dependencies,
    })

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Add multiple dependencies
   */
  async addDependencies(
    projectId: string,
    dependencies: Record<string, string>
  ): Promise<void> {
    const context = await this.getContext(projectId)
    
    for (const [pkg, version] of Object.entries(dependencies)) {
      context.dependencies.set(pkg, version)
    }

    await this.contextRepo.updateFields(projectId, {
      dependencies: context.dependencies,
    })

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Record tool execution
   */
  async recordToolExecution(
    projectId: string,
    execution: ToolExecution
  ): Promise<void> {
    const context = await this.getContext(projectId)

    context.toolHistory.push(execution)
    
    // Trim history
    if (context.toolHistory.length > 50) {
      context.toolHistory = context.toolHistory.slice(-50)
    }

    // Track errors
    if (execution.error) {
      context.errorHistory.push(`[${execution.toolName}] ${execution.error}`)
      if (context.errorHistory.length > 20) {
        context.errorHistory = context.errorHistory.slice(-20)
      }
    }

    await this.contextRepo.addToolExecution(projectId, execution)

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Update build status
   */
  async updateBuildStatus(
    projectId: string,
    status: Partial<BuildStatus>
  ): Promise<void> {
    const context = await this.getContext(projectId)

    const buildStatus: BuildStatus = {
      hasErrors: status.hasErrors ?? false,
      hasWarnings: status.hasWarnings ?? false,
      errors: status.errors ?? [],
      warnings: status.warnings ?? [],
      lastChecked: new Date(),
    }

    context.buildStatus = buildStatus

    await this.contextRepo.updateBuildStatus(projectId, buildStatus)

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Update server state
   */
  async updateServerState(
    projectId: string,
    state: Partial<ServerState>
  ): Promise<void> {
    const context = await this.getContext(projectId)

    const serverState: ServerState = {
      isRunning: state.isRunning ?? context.serverState?.isRunning ?? false,
      port: state.port ?? context.serverState?.port ?? 3000,
      url: state.url ?? context.serverState?.url,
      logs: state.logs ?? context.serverState?.logs ?? [],
      lastStarted: state.isRunning ? new Date() : context.serverState?.lastStarted,
    }

    context.serverState = serverState

    await this.contextRepo.updateServerState(projectId, serverState)

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Set task graph (replaces legacy planning)
   */
  async setTaskGraph(projectId: string, taskGraph: TaskGraph): Promise<void> {
    const context = await this.getContext(projectId)
    context.taskGraph = taskGraph
    context.completedSteps = [] // Reset legacy

    await this.contextRepo.updateTaskGraph(projectId, taskGraph)

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Update a task in the task graph
   */
  async updateTaskStatus(
    projectId: string,
    taskId: string,
    status: TaskStatus,
    metadata?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    const context = await this.getContext(projectId)
    
    if (!context.taskGraph) {
      return
    }

    const task = context.taskGraph.tasks[taskId]
    if (!task) {
      return
    }

    task.status = status
    if (metadata) task.metadata = { ...task.metadata, ...metadata }
    if (error) task.error = error
    if (status === "completed") task.completedAt = new Date()

    await this.contextRepo.updateTaskGraph(projectId, context.taskGraph)

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Clear task graph
   */
  async clearTaskGraph(projectId: string): Promise<void> {
    const context = await this.getContext(projectId)
    context.taskGraph = undefined

    await this.contextRepo.updateTaskGraph(projectId, undefined)

    context.lastActivity = new Date()
    contextCache.set(projectId, context)
  }

  /**
   * Generate context summary for AI
   */
  async getContextSummary(projectId: string): Promise<string> {
    const context = await this.getContext(projectId)
    const parts: string[] = []

    // Project info
    if (context.projectName) {
      parts.push(`Project: ${context.projectName}`)
    }

    // Files summary
    if (context.files.size > 0) {
      const fileList = Array.from(context.files.keys()).slice(0, 20)
      parts.push(
        `Files (${context.files.size} total): ${fileList.join(", ")}${
          context.files.size > 20 ? "..." : ""
        }`
      )
    }

    // Dependencies
    if (context.dependencies.size > 0) {
      const deps = Array.from(context.dependencies.entries())
        .slice(0, 10)
        .map(([name, ver]) => `${name}@${ver}`)
      parts.push(
        `Dependencies: ${deps.join(", ")}${
          context.dependencies.size > 10 ? "..." : ""
        }`
      )
    }

    // Build status
    if (context.buildStatus) {
      if (context.buildStatus.hasErrors) {
        parts.push(
          `BUILD ERRORS: ${context.buildStatus.errors.slice(0, 3).join("; ")}`
        )
      } else if (context.buildStatus.hasWarnings) {
        parts.push(
          `Build warnings: ${context.buildStatus.warnings.slice(0, 2).join("; ")}`
        )
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

    // Task graph progress
    if (context.taskGraph) {
      const tasks = Object.values(context.taskGraph.tasks)
      const completed = tasks.filter((t) => t.status === "completed").length
      const failed = tasks.filter((t) => t.status === "failed").length
      const inProgress = tasks.filter((t) => t.status === "in_progress").length
      parts.push(
        `Task graph: ${completed}/${tasks.length} completed${
          failed > 0 ? `, ${failed} failed` : ""
        }${inProgress > 0 ? `, ${inProgress} in progress` : ""}`
      )
    }

    return parts.length > 0 ? parts.join("\n") : "No context available yet."
  }

  /**
   * Get recommendations based on context
   */
  async getRecommendations(projectId: string): Promise<string[]> {
    const context = await this.getContext(projectId)
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
      (t) =>
        !t.success && Date.now() - new Date(t.timestamp).getTime() < 60000
    ).length

    if (recentErrors >= 3) {
      recommendations.push(
        "Multiple recent failures - consider using getBuildStatus to diagnose"
      )
    }

    // Task graph recommendations
    if (context.taskGraph) {
      const tasks = Object.values(context.taskGraph.tasks)
      const failed = tasks.filter((t) => t.status === "failed")
      const blocked = tasks.filter((t) => t.status === "blocked")
      const pending = tasks.filter((t) => t.status === "pending")

      if (failed.length > 0) {
        recommendations.push(
          `Failed tasks: ${failed.map((t) => t.description).join(", ")}`
        )
      }

      if (blocked.length > 0) {
        recommendations.push(
          `Blocked tasks waiting on dependencies: ${blocked.length}`
        )
      }

      // Find next executable task
      const executable = pending.filter((task) =>
        task.dependencies.every((depId) => {
          const dep = context.taskGraph?.tasks[depId]
          return dep?.status === "completed"
        })
      )

      if (executable.length > 0) {
        recommendations.push(
          `Next executable tasks: ${executable
            .map((t) => t.description)
            .slice(0, 3)
            .join(", ")}`
        )
      }
    }

    return recommendations
  }

  /**
   * Clear context from cache (DB unchanged)
   */
  clearCache(projectId: string): void {
    contextCache.delete(projectId)
  }

  /**
   * Delete context entirely
   */
  async deleteContext(projectId: string): Promise<void> {
    await this.contextRepo.delete(projectId)
    contextCache.delete(projectId)
  }

  /**
   * Check if context exists
   */
  async exists(projectId: string): Promise<boolean> {
    // Check cache first
    if (contextCache.has(projectId)) {
      return true
    }
    return this.contextRepo.exists(projectId)
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let contextServiceInstance: ContextService | null = null

/**
 * Get the singleton ContextService instance
 */
export function getContextService(): ContextService {
  if (!contextServiceInstance) {
    contextServiceInstance = new ContextService()
  }
  return contextServiceInstance
}
