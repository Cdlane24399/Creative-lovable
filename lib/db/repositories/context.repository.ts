/**
 * Context Repository
 * 
 * Handles database operations for agent context persistence.
 * Uses Supabase Client.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { parseJsonSafe } from "./base.repository"
import { getProjectRepository } from "./project.repository"
import { DatabaseError } from "@/lib/errors"
import type { 
  TaskGraph, 
  FileInfo, 
  BuildStatus, 
  ServerState, 
  ToolExecution 
} from "@/lib/ai/context-types"

// Re-export types for backward compatibility
export type { FileInfo, BuildStatus, ServerState, ToolExecution }

export interface AgentContextData {
  projectId: string
  projectName?: string
  projectDir?: string
  sandboxId?: string
  files: Map<string, FileInfo>
  dependencies: Map<string, string>
  buildStatus?: BuildStatus
  serverState?: ServerState
  toolHistory: ToolExecution[]
  errorHistory: string[]
  taskGraph?: TaskGraph
  completedSteps: string[]
  currentPlan?: string[]
  createdAt: Date
  lastActivity: Date
}

export interface ContextUpdate {
  projectName?: string
  projectDir?: string
  sandboxId?: string
  files?: Map<string, FileInfo>
  dependencies?: Map<string, string>
  buildStatus?: BuildStatus
  serverState?: ServerState
  toolExecution?: ToolExecution
  errorMessage?: string
  taskGraph?: TaskGraph
  completedStep?: string
}

const MAX_TOOL_HISTORY = 50
const MAX_ERROR_HISTORY = 20

interface ContextDbRow {
  project_id: string
  project_name: string | null
  project_dir: string | null
  sandbox_id: string | null
  files: unknown
  dependencies: unknown
  build_status: unknown
  server_state: unknown
  tool_history: unknown
  error_history: unknown
  task_graph: unknown
  completed_steps: unknown
  current_plan: unknown
  updated_at: string
}

interface ContextSerializedUpdate {
  project_name?: string | null
  project_dir?: string | null
  sandbox_id?: string | null
  files?: Record<string, FileInfo>
  dependencies?: Record<string, string>
  build_status?: BuildStatus
  server_state?: ServerState
  tool_history?: ToolExecution[]
  error_history?: string[]
  task_graph?: TaskGraph | null
  completed_steps?: string[]
  current_plan?: string[] | null
}

interface ContextSummaryRow {
  project_name: string | null
  task_graph: unknown
  files: unknown
  updated_at: string
}

// =============================================================================
// Repository Implementation
// =============================================================================

export class ContextRepository {
  private readonly tableName = "agent_context"
  private static ensuredProjects = new Set<string>()

  private async getClient() {
    return createServiceRoleClient()
  }

  private handleError(error: unknown, operationName: string): never {
    console.error(`[ContextRepository] ${operationName} failed:`, error)
    const message = error instanceof Error ? error.message : "Unknown error"
    throw new DatabaseError(
      `${operationName} failed: ${message}`
    )
  }

  private transformRow(row: ContextDbRow): AgentContextData {
    const files = parseJsonSafe<Record<string, FileInfo>>(row.files, {})
    const dependencies = parseJsonSafe<Record<string, string>>(row.dependencies, {})
    const buildStatus = parseJsonSafe<BuildStatus | null>(row.build_status, null)
    const serverState = parseJsonSafe<ServerState | null>(row.server_state, null)
    const taskGraph = parseJsonSafe<TaskGraph | null>(row.task_graph, null)
    const currentPlan = parseJsonSafe<string[] | null>(row.current_plan, null)

    return {
      projectId: row.project_id,
      projectName: row.project_name || undefined,
      projectDir: row.project_dir || undefined,
      sandboxId: row.sandbox_id || undefined,
      files: new Map(Object.entries(files).map(([k, v]) => [
        k,
        { ...v, lastModified: new Date(v.lastModified) }
      ])),
      dependencies: new Map(Object.entries(dependencies)),
      buildStatus: buildStatus
        ? {
          ...buildStatus,
          lastChecked: new Date(buildStatus.lastChecked)
        }
        : undefined,
      serverState: serverState ?? undefined,
      toolHistory: parseJsonSafe<ToolExecution[]>(row.tool_history, []).map(t => ({
        ...t,
        timestamp: new Date(t.timestamp)
      })),
      errorHistory: parseJsonSafe<string[]>(row.error_history, []),
      taskGraph: taskGraph ?? undefined,
      completedSteps: parseJsonSafe<string[]>(row.completed_steps, []),
      currentPlan: currentPlan ?? undefined,
      createdAt: new Date(row.updated_at),
      lastActivity: new Date(row.updated_at),
    }
  }

  private serializeContext(data: Partial<AgentContextData>): ContextSerializedUpdate {
    const row: ContextSerializedUpdate = {}

    if (data.projectName !== undefined) row.project_name = data.projectName || null
    if (data.projectDir !== undefined) row.project_dir = data.projectDir || null
    if (data.sandboxId !== undefined) row.sandbox_id = data.sandboxId || null

    if (data.files !== undefined) {
      row.files = Object.fromEntries(data.files)
    }

    if (data.dependencies !== undefined) {
      row.dependencies = Object.fromEntries(data.dependencies)
    }

    if (data.buildStatus !== undefined) {
      row.build_status = data.buildStatus
    }

    if (data.serverState !== undefined) {
      row.server_state = data.serverState
    }

    if (data.toolHistory !== undefined) {
      row.tool_history = data.toolHistory.slice(-MAX_TOOL_HISTORY)
    }

    if (data.errorHistory !== undefined) {
      row.error_history = data.errorHistory.slice(-MAX_ERROR_HISTORY)
    }

    if (data.taskGraph !== undefined) {
      row.task_graph = data.taskGraph ? data.taskGraph : null
    }

    if (data.completedSteps !== undefined) {
      row.completed_steps = data.completedSteps
    }

    if (data.currentPlan !== undefined) {
      row.current_plan = data.currentPlan ? data.currentPlan : null
    }

    return row
  }

  async findByProjectId(projectId: string): Promise<AgentContextData | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('project_id', projectId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }

      return this.transformRow(data as ContextDbRow)
    } catch (error) {
      this.handleError(error, "findByProjectId")
    }
  }

  async exists(projectId: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { count, error } = await client
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)

      if (error) throw error
      return (count ?? 0) > 0
    } catch (error) {
      this.handleError(error, "exists")
    }
  }

  async upsert(projectId: string, data: Partial<AgentContextData>): Promise<void> {
    try {
      // Ensure project exists (single round-trip path).
      if (!ContextRepository.ensuredProjects.has(projectId)) {
        const projectRepo = getProjectRepository()
        await projectRepo.ensureExists(projectId, data.projectName || "Untitled Project")
        ContextRepository.ensuredProjects.add(projectId)
      }

      const serialized = this.serializeContext(data)
      const client = await this.getClient()

      const upsertData = {
        project_id: projectId,
        updated_at: new Date().toISOString(),
        ...serialized
      }

      // Upsert updates only the provided columns on conflict.
      // This allows partial context updates without extra read/merge queries.

      const { error } = await client
        .from(this.tableName)
        .upsert(upsertData, { onConflict: 'project_id' })

      if (error) throw error
    } catch (error) {
      this.handleError(error, "upsert")
    }
  }

  async updateFields(projectId: string, update: ContextUpdate): Promise<void> {
    const data: Partial<AgentContextData> = {}

    if (update.projectName !== undefined) data.projectName = update.projectName
    if (update.projectDir !== undefined) data.projectDir = update.projectDir
    if (update.sandboxId !== undefined) data.sandboxId = update.sandboxId
    if (update.files !== undefined) data.files = update.files
    if (update.dependencies !== undefined) data.dependencies = update.dependencies
    if (update.buildStatus !== undefined) data.buildStatus = update.buildStatus
    if (update.serverState !== undefined) data.serverState = update.serverState
    if (update.taskGraph !== undefined) data.taskGraph = update.taskGraph

    if (update.toolExecution !== undefined ||
      update.errorMessage !== undefined ||
      update.completedStep !== undefined) {

      const current = await this.findByProjectId(projectId)

      if (update.toolExecution) {
        const history = current?.toolHistory || []
        history.push(update.toolExecution)
        data.toolHistory = history.slice(-MAX_TOOL_HISTORY)
      }

      if (update.errorMessage) {
        const errors = current?.errorHistory || []
        errors.push(update.errorMessage)
        data.errorHistory = errors.slice(-MAX_ERROR_HISTORY)
      }

      if (update.completedStep) {
        const steps = current?.completedSteps || []
        steps.push(update.completedStep)
        data.completedSteps = steps
      }
    }

    await this.upsert(projectId, data)
  }

  async addToolExecution(projectId: string, execution: ToolExecution): Promise<void> {
    await this.updateFields(projectId, { toolExecution: execution })
  }

  async updateBuildStatus(projectId: string, status: BuildStatus): Promise<void> {
    await this.updateFields(projectId, { buildStatus: status })
  }

  async updateServerState(projectId: string, state: ServerState): Promise<void> {
    await this.updateFields(projectId, { serverState: state })
  }

  async updateTaskGraph(projectId: string, taskGraph: TaskGraph | undefined): Promise<void> {
    await this.updateFields(projectId, { taskGraph })
  }

  async delete(projectId: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { error } = await client.from(this.tableName).delete().eq('project_id', projectId)
      if (error) throw error
      ContextRepository.ensuredProjects.delete(projectId)
      return true
    } catch (error) {
      this.handleError(error, "delete")
    }
  }

  async deleteStale(daysOld: number = 7): Promise<number> {
    try {
      const client = await this.getClient()
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysOld)

      const { count, error } = await client
        .from(this.tableName)
        .delete({ count: 'exact' })
        .lt('updated_at', cutoffDate.toISOString())

      if (error) throw error
      return count ?? 0
    } catch (error) {
      this.handleError(error, "deleteStale")
    }
  }

  async getSummary(projectId: string): Promise<{
    exists: boolean
    projectName?: string
    hasTaskGraph: boolean
    fileCount: number
    lastActivity: Date
  } | null> {
    try {
      const client = await this.getClient()
      // We can't use complex projection like `jsonb_object_keys` easily with Supabase client 
      // without using .rpc or fetching the whole row.
      // Fetching whole row is acceptable for now.
      const { data, error } = await client
        .from(this.tableName)
        .select('project_name, task_graph, files, updated_at')
        .eq('project_id', projectId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }

      const summaryRow = data as ContextSummaryRow
      const files = parseJsonSafe<Record<string, unknown>>(summaryRow.files, {})
      const fileCount = Object.keys(files).length

      return {
        exists: true,
        projectName: summaryRow.project_name || undefined,
        hasTaskGraph: !!summaryRow.task_graph,
        fileCount,
        lastActivity: new Date(summaryRow.updated_at),
      }
    } catch (error) {
      this.handleError(error, "getSummary")
    }
  }
}

let contextRepositoryInstance: ContextRepository | null = null

export function getContextRepository(): ContextRepository {
  if (!contextRepositoryInstance) {
    contextRepositoryInstance = new ContextRepository()
  }
  return contextRepositoryInstance
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetContextRepository(): void {
  contextRepositoryInstance = null
}
