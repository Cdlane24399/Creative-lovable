"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  Project,
  ProjectCardData,
  CreateProjectRequest,
  UpdateProjectRequest,
  Message,
} from "@/lib/db/types";
import { projectToCardData } from "@/lib/db/types";

interface UseProjectsOptions {
  autoFetch?: boolean;
  starred?: boolean;
  limit?: number;
}

interface UseProjectsReturn {
  projects: Project[];
  projectCards: ProjectCardData[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createProject: (data: CreateProjectRequest) => Promise<Project | null>;
  updateProject: (
    id: string,
    data: UpdateProjectRequest,
  ) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<boolean>;
  toggleStarred: (id: string) => Promise<boolean>;
}

export function useProjects(
  options: UseProjectsOptions = {},
): UseProjectsReturn {
  const { autoFetch = true, starred, limit = 50 } = options;
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectsRef = useRef<Project[]>(projects);
  projectsRef.current = projects;

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (starred !== undefined) params.set("starred", String(starred));
      if (limit) params.set("limit", String(limit));

      const response = await fetch(`/api/projects?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch projects");
      }

      setProjects(data.projects || []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch projects";
      setError(message);
      console.error("Error fetching projects:", err);
    } finally {
      setIsLoading(false);
    }
  }, [starred, limit]);

  const createProject = useCallback(
    async (data: CreateProjectRequest): Promise<Project | null> => {
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to create project");
        }

        // Add to local state
        setProjects((prev) => [result.project, ...prev]);
        return result.project;
      } catch (err) {
        console.error("Error creating project:", err);
        return null;
      }
    },
    [],
  );

  const updateProject = useCallback(
    async (id: string, data: UpdateProjectRequest): Promise<Project | null> => {
      try {
        const response = await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to update project");
        }

        // Update local state
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? result.project : p)),
        );
        return result.project;
      } catch (err) {
        console.error("Error updating project:", err);
        return null;
      }
    },
    [],
  );

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to delete project");
      }

      // Remove from local state
      setProjects((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      console.error("Error deleting project:", err);
      return false;
    }
  }, []);

  const toggleStarred = useCallback(
    async (id: string): Promise<boolean> => {
      const project = projectsRef.current.find((p) => p.id === id);
      if (!project) return false;

      const updated = await updateProject(id, { starred: !project.starred });
      return updated !== null;
    },
    [updateProject],
  );

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchProjects();
    }
  }, [autoFetch, fetchProjects]);

  // Convert to card data for UI
  const projectCards = useMemo(
    () => projects.map(projectToCardData),
    [projects],
  );

  return {
    projects,
    projectCards,
    isLoading,
    error,
    refetch: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    toggleStarred,
  };
}

// Hook for a single project
interface UseProjectReturn {
  project: Project | null;
  messages: Message[];
  isLoading: boolean;
  /** True once we've attempted to load the project/messages at least once for the current projectId */
  hasFetched: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Refetch project data only (not messages) - useful after files are saved */
  refetchProject: () => Promise<Project | null>;
  updateProject: (data: UpdateProjectRequest) => Promise<Project | null>;
  saveScreenshot: (base64: string, sandboxUrl?: string) => Promise<boolean>;
}

interface UseProjectOptions {
  /**
   * Whether to fetch project/messages immediately on mount.
   * Disable for brand-new projects that are created lazily during first chat turn.
   */
  autoFetch?: boolean;
}

export function useProject(
  projectId: string | null,
  options: UseProjectOptions = {},
): UseProjectReturn {
  const { autoFetch = true } = options;
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectIdRef = useRef(projectId);
  useEffect(() => {
    // Reset fetch-complete flag when switching projects
    if (projectIdRef.current !== projectId) {
      projectIdRef.current = projectId;
      setHasFetched(false);
    }
  }, [projectId]);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);
    setHasFetched(false);

    try {
      // A freshly created project can briefly 404 due to replication/transaction timing.
      // Retry a few times before treating it as truly missing.
      const maxAttempts = 4;
      let attemptedEnsure = false;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const response = await fetch(
          `/api/projects/${projectId}?includeMessages=true`,
        );

        if (response.status === 404) {
          if (!attemptedEnsure && projectId) {
            attemptedEnsure = true;
            try {
              await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: projectId,
                  name: "Untitled Project",
                }),
              });
            } catch (ensureErr) {
              console.warn(
                "[useProject] Failed to ensure project on 404:",
                ensureErr,
              );
            }
          }

          if (attempt < maxAttempts - 1) {
            const delayMs = 250 * (attempt + 1);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          setProject(null);
          setMessages([]);
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch project");
        }

        setProject(data.project);
        setMessages(data.messages || []);
        return;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch project";
      setError(message);
      console.error("Error fetching project:", err);
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [projectId]);

  const updateProject = useCallback(
    async (data: UpdateProjectRequest): Promise<Project | null> => {
      if (!projectId) return null;

      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to update project");
        }

        setProject(result.project);
        return result.project;
      } catch (err) {
        console.error("Error updating project:", err);
        return null;
      }
    },
    [projectId],
  );

  const saveScreenshot = useCallback(
    async (base64: string, sandboxUrl?: string): Promise<boolean> => {
      if (!projectId) return false;

      try {
        const response = await fetch(`/api/projects/${projectId}/screenshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            screenshot_base64: base64,
            sandbox_url: sandboxUrl,
          }),
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to save screenshot");
        }

        setProject(result.project);
        return true;
      } catch (err) {
        console.error("Error saving screenshot:", err);
        return false;
      }
    },
    [projectId],
  );

  /**
   * Refetch project data only (without messages).
   * Useful after files are saved to get updated files_snapshot.
   */
  const refetchProject = useCallback(async (): Promise<Project | null> => {
    if (!projectId) return null;

    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data.project);
        console.log(
          "[useProject] Refetched project data, files_snapshot keys:",
          Object.keys(data.project?.files_snapshot || {}).length,
        );
        return data.project ?? null;
      }
    } catch (err) {
      console.error("Error refetching project:", err);
    }
    return null;
  }, [projectId]);

  useEffect(() => {
    if (projectId && autoFetch) {
      fetchProject();
    } else {
      setProject(null);
      setMessages([]);
    }
  }, [projectId, autoFetch, fetchProject]);

  return {
    project,
    messages,
    isLoading,
    hasFetched,
    error,
    refetch: fetchProject,
    refetchProject,
    updateProject,
    saveScreenshot,
  };
}
