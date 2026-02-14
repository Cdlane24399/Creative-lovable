"use client";

import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  deriveProjectNameFromPrompt,
  isPlaceholderProjectName,
} from "@/lib/ai/project-naming";
import type { Project } from "@/lib/db/types";

const debugLog =
  process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? (...args: Parameters<typeof console.log>) => console.log(...args)
    : () => {};

interface UseProjectPersistenceOptions {
  projectId: string | undefined;
  projectName: string;
  sandboxUrl: string | null;
  initialPrompt: string | null | undefined;
  hasUnsavedChanges: boolean;
  lastSavedUrlRef: React.RefObject<string | null>;
  setHasUnsavedChanges: (val: boolean) => void;
  setIsFilesLoading: (val: boolean) => void;
  updateProject: (data: Record<string, unknown>) => Promise<Project | null>;
  refetchProject: () => Promise<Project | null>;
}

export function useProjectPersistence({
  projectId,
  projectName,
  sandboxUrl,
  initialPrompt,
  hasUnsavedChanges,
  lastSavedUrlRef,
  setHasUnsavedChanges,
  setIsFilesLoading,
  updateProject,
  refetchProject,
}: UseProjectPersistenceOptions) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const filesRefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveProjectRef = useRef<() => Promise<void>>(async () => {});
  const unmountSaveStateRef = useRef({
    hasUnsavedChanges: false,
    sandboxUrl: null as string | null,
    projectId: undefined as string | undefined,
  });

  const saveProject = useCallback(async () => {
    if (!projectId || !sandboxUrl) return;

    try {
      const response = await fetch(`/api/projects/${projectId}`);

      if (response.status === 404) {
        const promptDerivedName = deriveProjectNameFromPrompt(initialPrompt);
        const nameForCreate = isPlaceholderProjectName(projectName, projectId)
          ? promptDerivedName
          : projectName;

        const createResponse = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: projectId,
            name: nameForCreate || "Untitled Project",
            sandbox_url: sandboxUrl,
          }),
        });

        if (createResponse.ok) {
          lastSavedUrlRef.current = sandboxUrl;
          setHasUnsavedChanges(false);
          debugLog(
            "[EditorProvider] Project created, screenshot will be captured automatically",
          );
        }
      } else if (response.ok) {
        await updateProject({ sandbox_url: sandboxUrl });
        lastSavedUrlRef.current = sandboxUrl;
        setHasUnsavedChanges(false);
        debugLog(
          "[EditorProvider] Project updated, screenshot will be captured automatically",
        );
      }
    } catch (error) {
      console.error("Failed to save project:", error);
    }
  }, [
    projectId,
    sandboxUrl,
    projectName,
    initialPrompt,
    updateProject,
    setHasUnsavedChanges,
  ]);
  saveProjectRef.current = saveProject;

  // Auto-save project when sandbox URL changes
  useEffect(() => {
    if (!projectId || !sandboxUrl) return;
    if (sandboxUrl === lastSavedUrlRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setHasUnsavedChanges(true);

    saveTimeoutRef.current = setTimeout(async () => {
      await saveProjectRef.current();
    }, 3000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [sandboxUrl, projectId, setHasUnsavedChanges]);

  // Track unmount save state
  useEffect(() => {
    unmountSaveStateRef.current = {
      hasUnsavedChanges,
      sandboxUrl,
      projectId,
    };
  }, [hasUnsavedChanges, sandboxUrl, projectId]);

  // Save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      const latestState = unmountSaveStateRef.current;
      if (
        latestState.hasUnsavedChanges &&
        latestState.sandboxUrl &&
        latestState.projectId
      ) {
        saveProjectRef.current();
      }
    };
  }, []);

  /**
   * Refetch project data with retry logic for files_snapshot population.
   * Used after files are written to ensure the Code tab shows content.
   */
  const refetchFilesWithRetry = useCallback(
    (delay = 3000) => {
      if (filesRefetchTimeoutRef.current) {
        clearTimeout(filesRefetchTimeoutRef.current);
      }

      setIsFilesLoading(true);

      filesRefetchTimeoutRef.current = setTimeout(async () => {
        const maxAttempts = 6;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          debugLog(
            `[EditorProvider] Refetching project to get files_snapshot (attempt ${attempt + 1}/${maxAttempts})...`,
          );
          const latestProject = await refetchProject();
          const filesSnapshot = latestProject?.files_snapshot || {};

          if (Object.keys(filesSnapshot).length > 0) {
            setIsFilesLoading(false);
            debugLog(
              "[EditorProvider] Files loaded, count:",
              Object.keys(filesSnapshot).length,
            );
            return;
          }
          debugLog(
            "[EditorProvider] files_snapshot still empty, retrying...",
          );

          if (attempt < maxAttempts - 1) {
            const retryDelay = 2000 + attempt * 1000;
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
        console.warn(
          "[EditorProvider] files_snapshot still empty after all retries",
        );
        setIsFilesLoading(false);
      }, delay);
    },
    [refetchProject, setIsFilesLoading],
  );

  /**
   * Simple refetch of project data (including files_snapshot).
   * Used as a fallback when the chat completes, to ensure files are visible.
   */
  const refetchProjectData = useCallback(async (): Promise<number> => {
    const result = await refetchProject();
    if (result) {
      const fileCount = Object.keys(result.files_snapshot || {}).length;
      if (fileCount > 0) {
        setIsFilesLoading(false);
        debugLog(
          "[EditorProvider] refetchProjectData: loaded",
          fileCount,
          "files",
        );
      }
      return fileCount;
    }
    return 0;
  }, [refetchProject, setIsFilesLoading]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (filesRefetchTimeoutRef.current)
        clearTimeout(filesRefetchTimeoutRef.current);
    };
  }, []);

  return {
    saveProject,
    refetchFilesWithRetry,
    refetchProjectData,
  };
}
