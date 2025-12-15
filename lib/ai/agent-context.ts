/**
 * Agent Context Management System
 *
 * Provides deep awareness of the sandbox state, project structure,
 * build status, and execution history for intelligent agentic decisions.
 */

import type { Sandbox } from "e2b"

// File information with content tracking
export interface FileInfo {
  path: string
  content?: string
  lastModified?: Date
  action?: "created" | "updated" | "deleted"
}

// Build status tracking
export interface BuildStatus {
  hasErrors: boolean
  hasWarnings: boolean
  errors: string[]
  warnings: string[]
  lastChecked: Date
}

// Server state
export interface ServerState {
  isRunning: boolean
  port: number
  url?: string
  logs: string[]
  lastStarted?: Date
}

// Tool execution history for learning
export interface ToolExecution {
  toolName: string
  input: Record<string, unknown>
  output?: Record<string, unknown>
  success: boolean
  error?: string
  timestamp: Date
  durationMs: number
}

// Complete agent context
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

  // Planning state
  currentPlan?: string[]
  completedSteps: string[]

  // Sandbox reference
  sandboxId?: string

  // Metadata
  createdAt: Date
  lastActivity: Date
}

// Global context store (per projectId)
const contextStore = new Map<string, AgentContext>()

/**
 * Create or get existing agent context for a project
 */
export function getAgentContext(projectId: string): AgentContext {
  let context = contextStore.get(projectId)

  if (!context) {
    context = {
      projectId,
      files: new Map(),
      dependencies: new Map(),
      toolHistory: [],
      errorHistory: [],
      completedSteps: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    }
    contextStore.set(projectId, context)
  }

  return context
}

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

  context.lastActivity = new Date()
}

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

  context.lastActivity = new Date()
}

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

  context.lastActivity = new Date()
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

  context.lastActivity = new Date()
}

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

  context.lastActivity = new Date()
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
  context.lastActivity = new Date()
}

/**
 * Set current plan
 */
export function setCurrentPlan(projectId: string, steps: string[]): void {
  const context = getAgentContext(projectId)
  context.currentPlan = steps
  context.completedSteps = []
  context.lastActivity = new Date()
}

/**
 * Mark step as completed
 */
export function completeStep(projectId: string, step: string): void {
  const context = getAgentContext(projectId)
  context.completedSteps.push(step)
  context.lastActivity = new Date()
}

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

  // Current plan progress
  if (context.currentPlan && context.currentPlan.length > 0) {
    const completed = context.completedSteps.length
    const total = context.currentPlan.length
    parts.push(`Plan progress: ${completed}/${total} steps completed`)
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

  // Check for incomplete plan
  if (context.currentPlan && context.completedSteps.length < context.currentPlan.length) {
    const nextStep = context.currentPlan[context.completedSteps.length]
    if (nextStep) {
      recommendations.push(`Next planned step: ${nextStep}`)
    }
  }

  return recommendations
}

/**
 * Clear context for a project
 */
export function clearContext(projectId: string): void {
  contextStore.delete(projectId)
}

/**
 * Get all active contexts (for debugging)
 */
export function getAllContexts(): Map<string, AgentContext> {
  return new Map(contextStore)
}
