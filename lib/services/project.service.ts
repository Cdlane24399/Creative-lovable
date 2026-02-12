/**
 * Project Service
 *
 * Business logic layer for project operations.
 * Coordinates between repositories and cache layer.
 *
 * Responsibilities:
 * - Orchestrates project CRUD with caching
 * - Validates business rules
 * - Handles cross-entity operations
 * - Provides high-level API for routes
 */

import {
  getProjectRepository,
  getMessageRepository,
  getContextRepository,
  type ProjectFilters,
  type ProjectQueryOptions,
} from "@/lib/db/repositories";
import {
  projectCache,
  messagesCache,
  projectsListCache,
  invalidateProjectCache,
} from "@/lib/cache";
import type {
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  Message,
} from "@/lib/db/types";
import { ValidationError, NotFoundError } from "@/lib/errors";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of getting a project with optional messages
 */
export interface ProjectWithMessagesResult {
  project: Project;
  messages?: Message[];
}

/**
 * Result of listing projects
 */
export interface ProjectListResult {
  projects: Project[];
  total?: number;
}

// =============================================================================
// Service Implementation
// =============================================================================

export class ProjectService {
  private readonly projectRepo = getProjectRepository();
  private readonly messageRepo = getMessageRepository();
  private readonly contextRepo = getContextRepository();

  private getCachedProjectEntry(cachedValue: unknown): Project | null {
    if (!cachedValue || typeof cachedValue !== "object") {
      return null;
    }

    const project =
      "project" in cachedValue
        ? (cachedValue as { project?: unknown }).project
        : null;

    if (!project || typeof project !== "object") {
      return null;
    }

    if (!("id" in project) || !("name" in project)) {
      return null;
    }

    return project as Project;
  }

  /**
   * If a project has an active sandbox but no persisted files snapshot,
   * attempt a best-effort sync from sandbox -> database so Code view can load.
   */
  private async hydrateFilesSnapshotIfNeeded(project: Project): Promise<Project> {
    const fileCount = Object.keys(project.files_snapshot || {}).length;
    if (fileCount > 0 || !project.sandbox_id) {
      return project;
    }

    try {
      const [{ getSandbox }, { quickSyncToDatabaseWithRetry }] = await Promise.all([
        import("@/lib/e2b/sandbox"),
        import("@/lib/e2b/sync-manager"),
      ]);

      const sandbox = await getSandbox(project.id);
      if (!sandbox) {
        return project;
      }

      const syncResult = await quickSyncToDatabaseWithRetry(sandbox, project.id);
      if (!syncResult.success || syncResult.filesWritten <= 0) {
        return project;
      }

      const refreshed = await this.projectRepo.findById(project.id);
      return refreshed || project;
    } catch (error) {
      console.warn(
        `[ProjectService] Failed to hydrate files snapshot for ${project.id}:`,
        error,
      );
      return project;
    }
  }

  /**
   * Get all projects with optional filters
   * Uses cache when available
   */
  async listProjects(
    options: ProjectQueryOptions = {},
  ): Promise<ProjectListResult> {
    const { filters = {}, limit = 50, offset = 0 } = options;

    // Validate pagination
    if (limit < 1 || limit > 100) {
      throw new ValidationError("Limit must be between 1 and 100", {
        limit: ["Must be between 1 and 100"],
      });
    }
    if (offset < 0) {
      throw new ValidationError("Offset must be non-negative", {
        offset: ["Must be non-negative"],
      });
    }

    // Create cache key from filters
    const cacheKey = { starred: filters.starred, limit, offset };

    // Try cache first
    const cached = await projectsListCache.get(cacheKey);
    if (cached) {
      return cached as ProjectListResult;
    }

    // Fetch from database
    const projects = await this.projectRepo.findAll(options);
    const result: ProjectListResult = { projects };

    // Cache the result
    await projectsListCache.set(cacheKey, result);

    return result;
  }

  /**
   * Get a single project by ID
   * Uses cache when available
   */
  async getProject(id: string): Promise<Project> {
    // Try cache first
    const cached = await projectCache.get(id);
    const cachedProject = this.getCachedProjectEntry(cached);
    if (cachedProject) {
      const cachedFileCount = Object.keys(cachedProject.files_snapshot || {}).length;
      // Avoid serving stale empty snapshots for active sandbox projects.
      if (cachedFileCount > 0 || !cachedProject.sandbox_id) {
        return cachedProject;
      }
    }

    // Fetch from database
    const foundProject = await this.projectRepo.findById(id);
    if (!foundProject) {
      throw new NotFoundError("Project");
    }
    const project = await this.hydrateFilesSnapshotIfNeeded(foundProject);

    // Cache the result
    await projectCache.set(id, { project });

    return project;
  }

  /**
   * Get a project with its messages
   * Updates last_opened_at timestamp
   */
  async getProjectWithMessages(id: string): Promise<ProjectWithMessagesResult> {
    const projectPromise = this.projectRepo.findById(id);
    const cachedMessagesPromise = messagesCache.get(id);

    // Get project
    const foundProject = await projectPromise;
    if (!foundProject) {
      throw new NotFoundError("Project");
    }
    const project = await this.hydrateFilesSnapshotIfNeeded(foundProject);

    // Update last opened timestamp (non-blocking)
    this.projectRepo.updateLastOpened(id).catch(console.error);

    // Try to get messages from cache
    const cachedMessages = await cachedMessagesPromise;
    if (cachedMessages) {
      return {
        project,
        messages: cachedMessages as Message[],
      };
    }

    // Fetch messages from database
    const messages = await this.messageRepo.findByProjectId(id);

    // Cache messages
    await messagesCache.set(id, messages);

    return { project, messages };
  }

  /**
   * Create a new project
   */
  async createProject(
    data: CreateProjectRequest & { id?: string },
  ): Promise<Project> {
    // Validate required fields
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError("Project name is required", {
        name: ["Name is required and cannot be empty"],
      });
    }

    if (data.name.length > 255) {
      throw new ValidationError("Project name too long", {
        name: ["Name must be 255 characters or less"],
      });
    }

    // Create project
    const project = await this.projectRepo.create(data);

    // Invalidate list cache
    await projectsListCache.invalidate();

    return project;
  }

  /**
   * Ensure a project exists (for context saves)
   * Creates with defaults if doesn't exist
   */
  async ensureProjectExists(
    id: string,
    defaultName?: string,
  ): Promise<Project> {
    return this.projectRepo.ensureExists(id, defaultName);
  }

  /**
   * Update a project
   */
  async updateProject(
    id: string,
    data: UpdateProjectRequest,
  ): Promise<Project> {
    // Validate if name provided
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new ValidationError("Project name cannot be empty", {
        name: ["Name cannot be empty"],
      });
    }

    // Invalidate cache before update
    await invalidateProjectCache(id);

    // Update project
    const project = await this.projectRepo.update(id, data);
    if (!project) {
      throw new NotFoundError("Project");
    }

    return project;
  }

  /**
   * Delete a project and all related data
   */
  async deleteProject(id: string): Promise<void> {
    // Delete context and project in parallel (no FK constraint between them)
    const [, deleted] = await Promise.all([
      this.contextRepo.delete(id),
      this.projectRepo.delete(id),
    ]);
    if (!deleted) {
      throw new NotFoundError("Project");
    }

    // Invalidate caches
    await invalidateProjectCache(id);
  }

  /**
   * Toggle project starred status
   */
  async toggleStarred(id: string): Promise<boolean> {
    const newValue = await this.projectRepo.toggleStarred(id);

    // Invalidate caches
    await invalidateProjectCache(id);

    return newValue;
  }

  /**
   * Update sandbox information
   */
  async updateSandbox(
    id: string,
    sandboxId: string | null,
    sandboxUrl?: string | null,
  ): Promise<void> {
    await this.projectRepo.updateSandbox(id, sandboxId, sandboxUrl);

    // Invalidate cache
    await projectCache.invalidate(id);
  }

  /**
   * Save files snapshot
   */
  async saveFilesSnapshot(
    id: string,
    files: Record<string, string>,
    dependencies?: Record<string, string>,
  ): Promise<void> {
    await this.projectRepo.saveFilesSnapshot(id, files, dependencies);

    // Invalidate cache
    await projectCache.invalidate(id);
  }

  /**
   * Get files snapshot for restoring sandbox
   */
  async getFilesSnapshot(id: string): Promise<{
    files_snapshot: Record<string, string>;
    dependencies: Record<string, string>;
  } | null> {
    return this.projectRepo.getFilesSnapshot(id);
  }

  /**
   * Get sandbox ID for a project
   */
  async getSandboxId(id: string): Promise<string | null> {
    return this.projectRepo.getSandboxId(id);
  }

  /**
   * Find project by sandbox ID
   */
  async findBySandboxId(sandboxId: string): Promise<Project | null> {
    return this.projectRepo.findBySandboxId(sandboxId);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let projectServiceInstance: ProjectService | null = null;

/**
 * Get the singleton ProjectService instance
 */
export function getProjectService(): ProjectService {
  if (!projectServiceInstance) {
    projectServiceInstance = new ProjectService();
  }
  return projectServiceInstance;
}
