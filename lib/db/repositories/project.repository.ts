/**
 * Project Repository
 * 
 * Handles all database operations for the projects table.
 * Consolidates scattered SQL queries from API routes into a single, type-safe location.
 * 
 * Features:
 * - CRUD operations for projects
 * - Sandbox ID management
 * - Files snapshot persistence
 * - Proper type conversions for JSONB fields
 */

import { BaseRepository, generateId, parseJsonSafe, toJsonString, type FindOptions, type PaginatedResult } from "./base.repository"
import type { Project, CreateProjectRequest, UpdateProjectRequest } from "../types"

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

/**
 * Project row as returned from database (with JSONB as strings)
 */
interface ProjectRow {
  id: string
  name: string
  description: string | null
  screenshot_url: string | null
  screenshot_base64: string | null
  sandbox_id: string | null
  sandbox_url: string | null
  files_snapshot: string | Record<string, string>
  dependencies: string | Record<string, string>
  starred: boolean
  created_at: string
  updated_at: string
  last_opened_at: string
  user_id: string | null
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
  private transformRow(row: ProjectRow): Project {
    return {
      ...row,
      files_snapshot: parseJsonSafe<Record<string, string>>(row.files_snapshot, {}),
      dependencies: parseJsonSafe<Record<string, string>>(row.dependencies, {}),
    }
  }

  /**
   * Find all projects with optional filters and pagination
   */
  async findAll(options: ProjectQueryOptions = {}): Promise<Project[]> {
    const { 
      limit = 50, 
      offset = 0, 
      orderBy = "updated_at", 
      orderDir = "DESC",
      filters = {}
    } = options

    return this.executeQuery(async (sql) => {
      let result: ProjectRow[]

      // Handle different filter combinations
      // Note: Neon serverless doesn't support dynamic identifiers well,
      // so we use explicit queries for each case
      if (filters.starred === true) {
        result = await sql`
          SELECT * FROM projects
          WHERE starred = true
          ORDER BY updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        ` as unknown as ProjectRow[]
      } else if (filters.starred === false) {
        result = await sql`
          SELECT * FROM projects
          WHERE starred = false
          ORDER BY updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        ` as unknown as ProjectRow[]
      } else if (filters.hasSandbox === true) {
        result = await sql`
          SELECT * FROM projects
          WHERE sandbox_id IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        ` as unknown as ProjectRow[]
      } else {
        result = await sql`
          SELECT * FROM projects
          ORDER BY updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        ` as unknown as ProjectRow[]
      }

      return result.map(row => this.transformRow(row))
    }, "findAll")
  }

  /**
   * Find a project by ID
   */
  async findById(id: string): Promise<Project | null> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT * FROM projects 
        WHERE id = ${id}
        LIMIT 1
      ` as unknown as ProjectRow[]

      if (result.length === 0) {
        return null
      }

      return this.transformRow(result[0])
    }, "findById")
  }

  /**
   * Find a project by sandbox ID
   */
  async findBySandboxId(sandboxId: string): Promise<Project | null> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT * FROM projects 
        WHERE sandbox_id = ${sandboxId}
        LIMIT 1
      ` as unknown as ProjectRow[]

      if (result.length === 0) {
        return null
      }

      return this.transformRow(result[0])
    }, "findBySandboxId")
  }

  /**
   * Create a new project
   */
  async create(data: CreateProjectRequest & { id?: string }): Promise<Project> {
    const id = data.id || generateId()
    
    return this.executeQuery(async (sql) => {
      const result = await sql`
        INSERT INTO projects (
          id, 
          name, 
          description, 
          screenshot_base64, 
          sandbox_id, 
          sandbox_url, 
          files_snapshot, 
          dependencies, 
          starred
        )
        VALUES (
          ${id}, 
          ${data.name.trim()}, 
          ${data.description || null}, 
          ${data.screenshot_base64 || null}, 
          ${data.sandbox_id || null}, 
          ${data.sandbox_url || null}, 
          ${toJsonString(data.files_snapshot || {})}, 
          ${toJsonString(data.dependencies || {})}, 
          false
        )
        RETURNING *
      ` as unknown as ProjectRow[]

      return this.transformRow(result[0])
    }, "create")
  }

  /**
   * Create a project if it doesn't exist (upsert with no update on conflict)
   * Useful for ensuring project exists before saving context
   */
  async ensureExists(id: string, defaultName: string = "Untitled Project"): Promise<Project> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        INSERT INTO projects (id, name, description, files_snapshot, dependencies, starred)
        VALUES (${id}, ${defaultName}, 'Auto-created', '{}', '{}', false)
        ON CONFLICT (id) DO UPDATE SET
          updated_at = NOW()
        RETURNING *
      ` as unknown as ProjectRow[]

      return this.transformRow(result[0])
    }, "ensureExists")
  }

  /**
   * Update a project
   */
  async update(id: string, data: UpdateProjectRequest): Promise<Project | null> {
    // Build update object with only provided fields
    // We need to update each field separately due to Neon template limitations

    return this.executeQuery(async (sql) => {
      // First verify project exists
      const exists = await this.exists(id)
      if (!exists) {
        return null
      }

      // Update individual fields if provided
      if (data.name !== undefined) {
        await sql`UPDATE projects SET name = ${data.name.trim()}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.description !== undefined) {
        await sql`UPDATE projects SET description = ${data.description}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.screenshot_base64 !== undefined) {
        await sql`UPDATE projects SET screenshot_base64 = ${data.screenshot_base64}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.screenshot_url !== undefined) {
        await sql`UPDATE projects SET screenshot_url = ${data.screenshot_url}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.sandbox_id !== undefined) {
        await sql`UPDATE projects SET sandbox_id = ${data.sandbox_id}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.sandbox_url !== undefined) {
        await sql`UPDATE projects SET sandbox_url = ${data.sandbox_url}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.files_snapshot !== undefined) {
        await sql`UPDATE projects SET files_snapshot = ${toJsonString(data.files_snapshot)}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.dependencies !== undefined) {
        await sql`UPDATE projects SET dependencies = ${toJsonString(data.dependencies)}, updated_at = NOW() WHERE id = ${id}`
      }
      if (data.starred !== undefined) {
        await sql`UPDATE projects SET starred = ${data.starred}, updated_at = NOW() WHERE id = ${id}`
      }

      // Return updated project
      return this.findById(id)
    }, "update")
  }

  /**
   * Update sandbox information for a project
   */
  async updateSandbox(id: string, sandboxId: string | null, sandboxUrl?: string | null): Promise<void> {
    await this.executeQuery(async (sql) => {
      await sql`
        UPDATE projects 
        SET 
          sandbox_id = ${sandboxId}, 
          sandbox_url = ${sandboxUrl ?? null},
          updated_at = NOW() 
        WHERE id = ${id}
      `
    }, "updateSandbox")
  }

  /**
   * Save files snapshot for a project
   */
  async saveFilesSnapshot(
    id: string, 
    files: Record<string, string>, 
    dependencies?: Record<string, string>
  ): Promise<void> {
    await this.executeQuery(async (sql) => {
      if (dependencies !== undefined) {
        await sql`
          UPDATE projects 
          SET 
            files_snapshot = ${toJsonString(files)},
            dependencies = ${toJsonString(dependencies)},
            updated_at = NOW()
          WHERE id = ${id}
        `
      } else {
        await sql`
          UPDATE projects 
          SET 
            files_snapshot = ${toJsonString(files)},
            updated_at = NOW()
          WHERE id = ${id}
        `
      }
    }, "saveFilesSnapshot")
  }

  /**
   * Update last opened timestamp
   */
  async updateLastOpened(id: string): Promise<void> {
    await this.executeQuery(async (sql) => {
      await sql`
        UPDATE projects 
        SET last_opened_at = NOW() 
        WHERE id = ${id}
      `
    }, "updateLastOpened")
  }

  /**
   * Toggle starred status
   */
  async toggleStarred(id: string): Promise<boolean> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        UPDATE projects 
        SET starred = NOT starred, updated_at = NOW() 
        WHERE id = ${id}
        RETURNING starred
      ` as unknown as { starred: boolean }[]

      return result[0]?.starred ?? false
    }, "toggleStarred")
  }

  /**
   * Get sandbox ID for a project
   */
  async getSandboxId(id: string): Promise<string | null> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT sandbox_id FROM projects WHERE id = ${id}
      ` as unknown as { sandbox_id: string | null }[]

      return result[0]?.sandbox_id ?? null
    }, "getSandboxId")
  }

  /**
   * Get files snapshot for a project
   */
  async getFilesSnapshot(id: string): Promise<{
    files_snapshot: Record<string, string>
    dependencies: Record<string, string>
  } | null> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT files_snapshot, dependencies FROM projects WHERE id = ${id}
      ` as unknown as ProjectRow[]

      if (result.length === 0) {
        return null
      }

      return {
        files_snapshot: parseJsonSafe<Record<string, string>>(result[0].files_snapshot, {}),
        dependencies: parseJsonSafe<Record<string, string>>(result[0].dependencies, {}),
      }
    }, "getFilesSnapshot")
  }

  /**
   * Delete a project by ID (messages cascade deleted via FK)
   */
  async delete(id: string): Promise<boolean> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        DELETE FROM projects WHERE id = ${id}
        RETURNING id
      ` as unknown as { id: string }[]

      return result.length > 0
    }, "delete")
  }

  /**
   * Check if a project exists
   */
  async exists(id: string): Promise<boolean> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT 1 FROM projects 
        WHERE id = ${id}
        LIMIT 1
      ` as unknown as { "?column?"?: number }[]

      return result.length > 0
    }, "exists")
  }

  /**
   * Count all projects
   */
  async count(filters: ProjectFilters = {}): Promise<number> {
    return this.executeQuery(async (sql) => {
      let result: { count: string }[]

      if (filters.starred === true) {
        result = await sql`SELECT COUNT(*) as count FROM projects WHERE starred = true` as unknown as { count: string }[]
      } else if (filters.starred === false) {
        result = await sql`SELECT COUNT(*) as count FROM projects WHERE starred = false` as unknown as { count: string }[]
      } else {
        result = await sql`SELECT COUNT(*) as count FROM projects` as unknown as { count: string }[]
      }

      return parseInt(result[0]?.count || "0", 10)
    }, "count")
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
