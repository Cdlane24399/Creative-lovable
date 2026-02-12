/**
 * Project Repository
 * 
 * Handles all database operations for the projects table.
 * Uses Supabase Client for database access.
 */

import { BaseRepository, generateId, parseJsonSafe, type FindOptions } from "./base.repository"
import type { Project, CreateProjectRequest, UpdateProjectRequest } from "../types"
import { NotFoundError } from "@/lib/errors"

// =============================================================================
// Types
// =============================================================================

/**
 * Filters for querying projects
 */
export interface ProjectFilters {
  starred?: boolean
  userId?: string
  hasSandbox?: boolean
}

/**
 * Options for project queries
 */
export interface ProjectQueryOptions extends FindOptions {
  filters?: ProjectFilters
}

type ProjectDbRow = Omit<Project, "files_snapshot" | "dependencies"> & {
  files_snapshot: unknown
  dependencies: unknown
}

type ProjectListRow = Omit<Project, "files_snapshot" | "dependencies">

interface ProjectUpdateRow {
  updated_at: string
  name?: string
  description?: string | null
  screenshot_base64?: string | null
  screenshot_url?: string | null
  sandbox_id?: string | null
  sandbox_url?: string | null
  files_snapshot?: Record<string, string>
  dependencies?: Record<string, string>
  starred?: boolean
}

// =============================================================================
// Repository Implementation
// =============================================================================

export class ProjectRepository extends BaseRepository<Project> {
  constructor() {
    super("projects")
  }

  /**
   * Transform database row to Project type
   * Handles JSONB field parsing
   */
  private transformRow(row: ProjectDbRow): Project {
    return {
      ...row,
      files_snapshot: parseJsonSafe<Record<string, string>>(row.files_snapshot, {}),
      dependencies: parseJsonSafe<Record<string, string>>(row.dependencies, {}),
    }
  }

  /**
   * Find all projects with optional filters and pagination
   * Optimized: excludes heavy JSONB fields (files_snapshot, dependencies) for list views
   */
  async findAll(options: ProjectQueryOptions = {}): Promise<Project[]> {
    try {
      const client = await this.getClient()
      // Select all columns EXCEPT heavy JSONB fields (files_snapshot, dependencies)
      // Those are only needed when loading a specific project for editing
      let query = client.from(this.tableName).select(
        'id, name, description, screenshot_url, screenshot_base64, starred, sandbox_id, sandbox_url, user_id, created_at, updated_at, last_opened_at'
      )

      // Apply filters
      if (options.filters?.starred !== undefined) {
        query = query.eq('starred', options.filters.starred)
      }
      if (options.filters?.hasSandbox) {
        query = query.not('sandbox_id', 'is', null)
      }
      // userId filter is automatically handled by RLS if configured,
      // but we can explicitly add it if needed for admin contexts or specific queries
      if (options.filters?.userId) {
        query = query.eq('user_id', options.filters.userId)
      }

      // Order
      const orderBy = options.orderBy || "updated_at"
      const ascending = options.orderDir === "ASC"
      query = query.order(orderBy, { ascending })

      // Pagination
      const limit = options.limit || 50
      const offset = options.offset || 0
      query = query.range(offset, offset + limit - 1)

      const { data, error } = await query
      if (error) throw error

      // Use light transform for list view (no JSONB fields fetched)
      return (data as ProjectListRow[]).map((row) => ({
        ...row,
        files_snapshot: {},  // Not fetched in list view
        dependencies: {},    // Not fetched in list view
      }))
    } catch (error) {
      this.handleError(error, "findAll")
    }
  }

  /**
   * Find a project by ID
   */
  async findById(id: string): Promise<Project | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null // Not found
        throw error
      }

      return this.transformRow(data as ProjectDbRow)
    } catch (error) {
      this.handleError(error, "findById")
    }
  }

  /**
   * Find a project by sandbox ID
   */
  async findBySandboxId(sandboxId: string): Promise<Project | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('sandbox_id', sandboxId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }

      return this.transformRow(data as ProjectDbRow)
    } catch (error) {
      this.handleError(error, "findBySandboxId")
    }
  }

  /**
   * Create a new project
   */
  async create(data: CreateProjectRequest & { id?: string }): Promise<Project> {
    try {
      const id = data.id || generateId()
      const client = await this.getClient()

      const { data: result, error } = await client
        .from(this.tableName)
        .insert({
          id,
          name: data.name.trim(),
          description: data.description || null,
          screenshot_base64: data.screenshot_base64 || null,
          sandbox_id: data.sandbox_id || null,
          sandbox_url: data.sandbox_url || null,
          files_snapshot: data.files_snapshot || {},
          dependencies: data.dependencies || {},
          starred: false
        })
        .select()
        .single()

      if (error) throw error

      return this.transformRow(result as ProjectDbRow)
    } catch (error) {
      this.handleError(error, "create")
    }
  }

  /**
   * Create a project if it doesn't exist (upsert)
   */
  async ensureExists(id: string, defaultName: string = "Untitled Project"): Promise<Project> {
    try {
      const existing = await this.findById(id)
      if (existing) {
        return existing
      }

      const client = await this.getClient()

      const { data, error } = await client
        .from(this.tableName)
        .insert({
          id,
          name: defaultName,
          description: 'Auto-created',
          files_snapshot: {},
          dependencies: {},
          starred: false,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        const isDuplicate = error.code === '23505'
        if (isDuplicate) {
          const raced = await this.findById(id)
          if (raced) return raced
        }
        throw error
      }

      return this.transformRow(data as ProjectDbRow)
    } catch (error) {
      this.handleError(error, "ensureExists")
    }
  }

  /**
   * Update a project
   */
  async update(id: string, data: UpdateProjectRequest): Promise<Project | null> {
    try {
      const client = await this.getClient()

      const updateData: ProjectUpdateRow = { updated_at: new Date().toISOString() }
      if (data.name !== undefined) updateData.name = data.name.trim()
      if (data.description !== undefined) updateData.description = data.description
      if (data.screenshot_base64 !== undefined) updateData.screenshot_base64 = data.screenshot_base64
      if (data.screenshot_url !== undefined) updateData.screenshot_url = data.screenshot_url
      if (data.sandbox_id !== undefined) updateData.sandbox_id = data.sandbox_id
      if (data.sandbox_url !== undefined) updateData.sandbox_url = data.sandbox_url
      if (data.files_snapshot !== undefined) updateData.files_snapshot = data.files_snapshot
      if (data.dependencies !== undefined) updateData.dependencies = data.dependencies
      if (data.starred !== undefined) updateData.starred = data.starred

      const { data: result, error } = await client
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }

      return this.transformRow(result as ProjectDbRow)
    } catch (error) {
      this.handleError(error, "update")
    }
  }

  /**
   * Update sandbox information for a project
   */
  async updateSandbox(id: string, sandboxId: string | null, sandboxUrl?: string | null): Promise<void> {
    await this.update(id, { sandbox_id: sandboxId, sandbox_url: sandboxUrl })
  }

  /**
   * Save files snapshot for a project
   */
  async saveFilesSnapshot(
    id: string,
    files: Record<string, string>,
    dependencies?: Record<string, string>
  ): Promise<void> {
    const updateData: UpdateProjectRequest = { files_snapshot: files }
    if (dependencies) updateData.dependencies = dependencies
    await this.update(id, updateData)
  }

  /**
   * Save a single file to the project's files_snapshot (incremental update).
   * Reads the existing snapshot, merges the new file, and writes back.
   * Much more efficient than full project sync for individual file writes.
   */
  async saveSingleFile(
    id: string,
    filePath: string,
    content: string
  ): Promise<void> {
    try {
      const client = await this.getClient()
      // Read existing snapshot
      const { data, error: readError } = await client
        .from(this.tableName)
        .select('files_snapshot')
        .eq('id', id)
        .single()

      if (readError) throw readError

      const existingSnapshot: Record<string, string> = data?.files_snapshot || {}
      existingSnapshot[filePath] = content

      const { error: updateError } = await client
        .from(this.tableName)
        .update({ files_snapshot: existingSnapshot, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (updateError) throw updateError
    } catch (error) {
      this.handleError(error, "saveSingleFile")
    }
  }

  /**
   * Update last opened timestamp
   */
  async updateLastOpened(id: string): Promise<void> {
    try {
      const client = await this.getClient()
      await client
        .from(this.tableName)
        .update({ last_opened_at: new Date().toISOString() })
        .eq('id', id)
    } catch (error) {
      this.handleError(error, "updateLastOpened")
    }
  }

  /**
   * Toggle starred status
   */
  async toggleStarred(id: string): Promise<boolean> {
    try {
      const project = await this.findById(id)
      if (!project) throw new NotFoundError(`Project ${id} not found`)

      const newStarred = !project.starred
      await this.update(id, { starred: newStarred })
      return newStarred
    } catch (error) {
      this.handleError(error, "toggleStarred")
    }
  }

  /**
   * Get sandbox ID for a project
   */
  async getSandboxId(id: string): Promise<string | null> {
    const project = await this.findById(id)
    return project?.sandbox_id ?? null
  }

  /**
   * Get files snapshot for a project
   */
  async getFilesSnapshot(id: string): Promise<{
    files_snapshot: Record<string, string>
    dependencies: Record<string, string>
  } | null> {
    const project = await this.findById(id)
    if (!project) return null
    return {
      files_snapshot: project.files_snapshot,
      dependencies: project.dependencies
    }
  }

  /**
   * Delete a project by ID
   */
  async delete(id: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { error } = await client.from(this.tableName).delete().eq('id', id)
      if (error) throw error
      return true
    } catch (error) {
      this.handleError(error, "delete")
    }
  }

  /**
   * Check if a project exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { count, error } = await client
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('id', id)

      if (error) throw error
      return (count ?? 0) > 0
    } catch (error) {
      this.handleError(error, "exists")
    }
  }

  /**
   * Count all projects
   */
  async count(filters: ProjectFilters = {}): Promise<number> {
    try {
      const client = await this.getClient()
      let query = client.from(this.tableName).select('*', { count: 'exact', head: true })

      if (filters.starred !== undefined) {
        query = query.eq('starred', filters.starred)
      }

      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    } catch (error) {
      this.handleError(error, "count")
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let projectRepositoryInstance: ProjectRepository | null = null

/**
 * Get the singleton ProjectRepository instance
 */
export function getProjectRepository(): ProjectRepository {
  if (!projectRepositoryInstance) {
    projectRepositoryInstance = new ProjectRepository()
  }
  return projectRepositoryInstance
}
