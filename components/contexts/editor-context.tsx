"use client";

import {
  createContext,
  use,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useProject } from "@/hooks/use-projects";
import { useDevServer } from "@/hooks/use-dev-server";
import { generatePlaceholderImage } from "@/lib/utils/screenshot";
import { normalizeSandboxPreviewUrl } from "@/lib/utils/url";
import { type ModelProvider } from "@/lib/ai/agent";
import {
  deriveProjectNameFromPrompt,
  isPlaceholderProjectName,
} from "@/lib/ai/project-naming";
import type { EditorView } from "@/components/editor-header";
import type { ChatPanelHandle } from "@/components/chat-panel";
import type { PreviewPanelHandle } from "@/components/preview-panel";
import type { Project, Message } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Context Interface: state / actions / meta (composition pattern)
// ---------------------------------------------------------------------------

export interface EditorState {
  currentView: EditorView;
  projectName: string;
  hasUnsavedChanges: boolean;
  sandboxUrl: string | null;
  isPreviewLoading: boolean;
  isFilesLoading: boolean;
  isDevServerStarting: boolean;
}

export interface EditorActions {
  setCurrentView: (view: EditorView) => void;
  handleRefresh: () => void;
  saveProject: () => Promise<void>;
  handleManualScreenshot: () => Promise<void>;
  handleSandboxUrlUpdate: (url: string | null) => void;
  handleFilesReady: (projectName: string, sandboxId?: string) => void;
  /** Refetch project data (including files_snapshot) from the database */
  refetchProjectData: () => Promise<number>;
}

export interface EditorMeta {
  projectId: string | undefined;
  project: Project | null;
  savedMessages: Message[];
  /** True once the initial project/messages fetch has completed for the current projectId */
  messagesLoaded: boolean;
  initialPrompt: string | null | undefined;
  initialModel: ModelProvider | undefined;
  onNavigateHome: (() => void) | undefined;
  previewRef: React.RefObject<PreviewPanelHandle | null>;
  chatRef: React.RefObject<ChatPanelHandle | null>;
}

export interface EditorContextValue {
  state: EditorState;
  actions: EditorActions;
  meta: EditorMeta;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = use(EditorContext);
  if (!ctx) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface EditorProviderProps {
  children: ReactNode;
  projectId?: string;
  initialPrompt?: string | null;
  initialModel?: ModelProvider;
  onNavigateHome?: () => void;
}

export function EditorProvider({
  children,
  projectId,
  initialPrompt,
  initialModel,
  onNavigateHome,
}: EditorProviderProps) {
  // ---- UI state ----
  const [currentView, setCurrentView] = useState<EditorView>("preview");
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [pendingServerStart, setPendingServerStart] = useState<string | null>(
    null,
  );
  const [pendingSandboxId, setPendingSandboxId] = useState<string | null>(null);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [isPollingEnabled, setIsPollingEnabled] = useState(false);

  // ---- Refs ----
  const previewRef = useRef<PreviewPanelHandle>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedUrlRef = useRef<string | null>(null);
  const sandboxUrlRef = useRef<string | null>(null);
  const projectNameRef = useRef<string>(projectName);
  const debouncedUrlUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const refreshLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const filesRefetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveProjectRef = useRef<() => Promise<void>>(async () => {});
  const unmountSaveStateRef = useRef({
    hasUnsavedChanges: false,
    sandboxUrl: null as string | null,
    projectId: undefined as string | undefined,
  });
  const titleGeneratedRef = useRef(false);
  const devServerStartedRef = useRef<string | null>(null);
  const forceRestartNextStartRef = useRef(false);
  const validatingSandboxRef = useRef(false);
  const restorationAttemptedRef = useRef(false);
  const invalidUrlCleanupRef = useRef<Set<string>>(new Set());

  // ---- Debounced URL updater ----
  const updateSandboxUrlDebounced = useCallback(
    (url: string | null, options?: { stopPolling?: boolean }) => {
      if (debouncedUrlUpdateRef.current) {
        clearTimeout(debouncedUrlUpdateRef.current);
      }

      debouncedUrlUpdateRef.current = setTimeout(() => {
        console.log("[EditorProvider] Applying debounced URL update:", url);
        setSandboxUrl((prev) => (prev === url ? prev : url));
        setIsPreviewLoading(false);
        if (options?.stopPolling) {
          setIsPollingEnabled(false);
          setPendingServerStart(null);
        }
      }, 100);
    },
    [],
  );

  // ---- Data hooks ----
  const {
    project,
    messages: savedMessages,
    hasFetched: messagesLoaded,
    updateProject,
    saveScreenshot,
    refetchProject,
  } = useProject(projectId || null, {
    autoFetch: !initialPrompt,
  });

  const handleDevServerReady = useCallback(
    (url: string) => {
      const normalizedUrl = normalizeSandboxPreviewUrl(url);
      if (!normalizedUrl) return;

      console.log(
        "[EditorProvider] onReady callback triggered with url:",
        normalizedUrl,
      );
      updateSandboxUrlDebounced(normalizedUrl, { stopPolling: true });
    },
    [updateSandboxUrlDebounced],
  );

  const handleDevServerError = useCallback((errors: string[]) => {
    console.error("[EditorProvider] Dev server errors:", errors);
    setIsPreviewLoading(false);
    setIsPollingEnabled(false);
  }, []);

  const handleDevServerStatusChange = useCallback(
    (status: { url: string | null }) => {
      if (!status.url) return;

      const normalizedUrl = normalizeSandboxPreviewUrl(status.url);
      if (!normalizedUrl || normalizedUrl === sandboxUrlRef.current) return;

      console.log(
        "[EditorProvider] Syncing sandbox URL from status:",
        normalizedUrl,
      );
      updateSandboxUrlDebounced(normalizedUrl, { stopPolling: true });
    },
    [updateSandboxUrlDebounced],
  );

  const { isStarting: isDevServerStarting, start: startDevServer } =
    useDevServer({
      projectId: projectId || null,
      projectName:
        pendingServerStart ||
        (projectName !== "Untitled Project" ? projectName : null),
      sandboxId: pendingSandboxId,
      enabled: isPollingEnabled,
      onReady: handleDevServerReady,
      onError: handleDevServerError,
      onStatusChange: handleDevServerStatusChange,
    });

  // ---- Effects ----

  // Start dev server when pending project name is set (only once per project)
  useEffect(() => {
    if (!pendingServerStart || !projectId) return;
    const forceRestart = forceRestartNextStartRef.current;
    if (devServerStartedRef.current === pendingServerStart && !forceRestart)
      return;

    console.log(
      "[EditorProvider] Starting dev server for:",
      pendingServerStart,
      "projectId:",
      projectId,
      "sandboxId:",
      pendingSandboxId,
      "forceRestart:",
      forceRestart,
    );
    devServerStartedRef.current = pendingServerStart;
    forceRestartNextStartRef.current = false;
    setIsPollingEnabled(true);
    startDevServer(forceRestart);
  }, [pendingServerStart, projectId, pendingSandboxId, startDevServer]);

  // Keep refs in sync with state (assign during render, not in effects)
  sandboxUrlRef.current = sandboxUrl;
  projectNameRef.current = projectName;

  // Restore project state when loading an existing project
  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      if (
        project.name &&
        !isPlaceholderProjectName(project.name, project.id) &&
        !initialPrompt
      ) {
        titleGeneratedRef.current = true;
      }
      if (project.sandbox_url && !validatingSandboxRef.current) {
        const normalizedSavedUrl = normalizeSandboxPreviewUrl(
          project.sandbox_url,
        );
        if (
          !normalizedSavedUrl &&
          !invalidUrlCleanupRef.current.has(project.id)
        ) {
          invalidUrlCleanupRef.current.add(project.id);
          console.warn(
            "[EditorProvider] Clearing invalid saved sandbox URL:",
            project.sandbox_url,
          );
          fetch(`/api/projects/${project.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sandbox_url: null }),
          }).catch((error) => {
            console.warn(
              "[EditorProvider] Failed to clear invalid sandbox URL:",
              error,
            );
          });
        }
        if (normalizedSavedUrl) {
          lastSavedUrlRef.current = normalizedSavedUrl;
        }

        console.log(
          "[EditorProvider] Validating saved sandbox URL:",
          normalizedSavedUrl || project.sandbox_url,
        );
        validatingSandboxRef.current = true;

        Promise.all([
          fetch(`/api/projects/${project.id}/restore`).then((res) =>
            res.json(),
          ),
          fetch(`/api/sandbox/${project.id}/dev-server`, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
            },
          })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        ])
          .then(([restoreData, serverStatus]) => {
            const runningUrl =
              serverStatus?.isRunning && serverStatus?.url
                ? normalizeSandboxPreviewUrl(serverStatus.url)
                : null;

            if (runningUrl) {
              console.log(
                "[EditorProvider] Using active dev-server URL from status:",
                runningUrl,
              );
              setSandboxUrl(runningUrl);
              validatingSandboxRef.current = false;
              return;
            }

            if (restoreData?.canRestore && restoreData?.fileCount > 0) {
              console.log(
                "[EditorProvider] Saved URL is stale; restoring sandbox from snapshot...",
              );
              setSandboxUrl(null);
              devServerStartedRef.current = null;
              return;
            }

            if (project.sandbox_id) {
              console.log(
                "[EditorProvider] No snapshot yet, attempting sandbox resume via dev-server start",
              );
              setSandboxUrl(null);
              setPendingSandboxId(project.sandbox_id);
              forceRestartNextStartRef.current = true;
              devServerStartedRef.current = null;
              setPendingServerStart(project.name || project.id);
              setIsPollingEnabled(true);
              validatingSandboxRef.current = false;
              return;
            }

            if (normalizedSavedUrl) {
              console.log(
                "[EditorProvider] Falling back to saved sandbox URL",
              );
              setSandboxUrl(normalizedSavedUrl);
            } else {
              setSandboxUrl(null);
            }
            validatingSandboxRef.current = false;
          })
          .catch(() => {
            console.log(
              "[EditorProvider] Validation failed, using saved sandbox URL",
            );
            if (normalizedSavedUrl) {
              setSandboxUrl(normalizedSavedUrl);
            }
            validatingSandboxRef.current = false;
          });
      }
    }
  }, [project, updateProject]);

  // Restore sandbox when opening an existing project without a working preview
  const restoreSandbox = useCallback(async () => {
    if (!projectId || restorationAttemptedRef.current) return;
    if (initialPrompt) return;

    restorationAttemptedRef.current = true;
    console.log("[EditorProvider] Attempting to restore project sandbox...");
    setIsPreviewLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("[EditorProvider] Sandbox restored:", data);

        if (data.sandboxId) {
          setPendingSandboxId(data.sandboxId);
        }

        devServerStartedRef.current = null;
        forceRestartNextStartRef.current = true;
        const serverName = projectNameRef.current || projectId;
        console.log(
          "[EditorProvider] Starting dev server for restored sandbox:",
          serverName,
        );
        setPendingServerStart(serverName);
        setIsPollingEnabled(true);
      } else if (response.status === 422) {
        console.log(
          "[EditorProvider] No snapshot files to restore, attempting sandbox resume/start",
        );
        if (project?.sandbox_id) {
          devServerStartedRef.current = null;
          forceRestartNextStartRef.current = true;
          setPendingSandboxId(project.sandbox_id);
          setPendingServerStart(project.name || projectNameRef.current || projectId);
          setIsPollingEnabled(true);
        } else {
          setIsPreviewLoading(false);
        }
      } else {
        console.warn(
          "[EditorProvider] Failed to restore sandbox:",
          await response.text(),
        );
        setIsPreviewLoading(false);
      }
    } catch (error) {
      console.error("[EditorProvider] Error restoring sandbox:", error);
      setIsPreviewLoading(false);
    }
  }, [projectId, initialPrompt, project]);

  // Trigger restoration when opening an existing project
  useEffect(() => {
    if (project && !sandboxUrl && !initialPrompt) {
      const timer = setTimeout(restoreSandbox, 500);
      return () => clearTimeout(timer);
    }
  }, [project, sandboxUrl, initialPrompt, restoreSandbox]);

  // Auto-generate project title when sandbox is ready
  const generateProjectTitle = useCallback(async () => {
    if (!initialPrompt || !projectId) return;
    if (titleGeneratedRef.current) return;
    const currentProjectName = projectNameRef.current;
    if (!isPlaceholderProjectName(currentProjectName, projectId)) return;

    console.log("[EditorProvider] Generating project title...");

    try {
      const response = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: initialPrompt, projectId }),
      });

      if (response.ok) {
        const { title } = await response.json();
        if (title) {
          console.log("[EditorProvider] Generated title:", title);
          setProjectName(title);

          const updated = await updateProject({ name: title });
          if (updated?.name === title) {
            titleGeneratedRef.current = true;
          } else {
            console.warn("[EditorProvider] Failed to persist generated title");
          }
        }
      } else {
        console.warn(
          "[EditorProvider] Title generation failed, will retry on next trigger",
        );
      }
    } catch (error) {
      console.error("Failed to generate title:", error);
    }
  }, [initialPrompt, projectId, updateProject]);

  // Trigger title generation when sandbox URL becomes available
  useEffect(() => {
    if (sandboxUrl && initialPrompt && !titleGeneratedRef.current) {
      const timer = setTimeout(generateProjectTitle, 1000);
      return () => clearTimeout(timer);
    }
  }, [sandboxUrl, initialPrompt, generateProjectTitle]);

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
  }, [sandboxUrl, projectId]);

  // ---- Actions ----

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
          console.log(
            "[EditorProvider] Project created, screenshot will be captured automatically",
          );
        }
      } else if (response.ok) {
        await updateProject({
          sandbox_url: sandboxUrl,
        });
        lastSavedUrlRef.current = sandboxUrl;
        setHasUnsavedChanges(false);
        console.log(
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
  ]);
  saveProjectRef.current = saveProject;

  // Capture screenshot from sandbox URL
  const captureAndSaveScreenshot = useCallback(
    async (name: string, url: string, retryCount = 0) => {
      const maxRetries = 2;

      try {
        console.log(
          `[EditorProvider] Capturing screenshot for ${name} (attempt ${retryCount + 1}/${maxRetries + 1})`,
        );

        const response = await fetch("/api/screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            projectName: name,
            projectId: projectId || undefined,
          }),
        });

        if (response.ok) {
          const { screenshot_base64, source } = await response.json();
          if (screenshot_base64) {
            await saveScreenshot(screenshot_base64, url);
            console.log(
              `[EditorProvider] Screenshot saved for ${name} (source: ${source || "unknown"})`,
            );
            return true;
          } else {
            console.warn("[EditorProvider] No screenshot data returned");
            return false;
          }
        } else {
          const errorText = await response.text();
          console.warn(
            `[EditorProvider] Screenshot API error: ${response.status} - ${errorText}`,
          );
          return false;
        }
      } catch (error) {
        console.warn(
          `[EditorProvider] Screenshot capture error (attempt ${retryCount + 1}):`,
          error,
        );

        if (retryCount < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
          console.log(`[EditorProvider] Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return captureAndSaveScreenshot(name, url, retryCount + 1);
        }

        console.warn(
          "[EditorProvider] All retries exhausted, using placeholder",
        );
        const placeholder = generatePlaceholderImage(name);
        await saveScreenshot(placeholder, url);
        return false;
      }
    },
    [saveScreenshot, projectId],
  );

  const handleManualScreenshot = useCallback(async () => {
    if (!sandboxUrl || !projectName) return;
    console.log("[EditorProvider] Manual screenshot capture triggered");
    await captureAndSaveScreenshot(projectName, sandboxUrl);
    await refetchProject();
  }, [sandboxUrl, projectName, captureAndSaveScreenshot, refetchProject]);

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

  // Auto-capture screenshot when sandbox URL becomes available
  useEffect(() => {
    if (!sandboxUrl || !projectName || !projectId) return;

    if (project?.screenshot_url && lastSavedUrlRef.current === sandboxUrl) {
      console.log("[EditorProvider] Screenshot already exists for this URL");
      return;
    }

    const captureDelay = 5000;
    console.log(
      `[EditorProvider] Scheduling automatic screenshot capture in ${captureDelay}ms`,
    );
    const timeoutId = setTimeout(async () => {
      console.log("[EditorProvider] Executing automatic screenshot capture");
      await captureAndSaveScreenshot(projectName, sandboxUrl);
    }, captureDelay);

    return () => clearTimeout(timeoutId);
  }, [
    sandboxUrl,
    projectName,
    projectId,
    project?.screenshot_url,
    captureAndSaveScreenshot,
  ]);

  const handleRefresh = useCallback(() => {
    if (previewRef.current) {
      previewRef.current.refresh();
      setIsPreviewLoading(true);
      if (refreshLoadingTimeoutRef.current) {
        clearTimeout(refreshLoadingTimeoutRef.current);
      }
      refreshLoadingTimeoutRef.current = setTimeout(() => {
        setIsPreviewLoading(false);
      }, 500);
    }
  }, []);

  const handleFilesReady = useCallback(
    (newProjectName: string, sandboxId?: string) => {
      const promptDerivedName = deriveProjectNameFromPrompt(initialPrompt);
      const resolvedProjectName = isPlaceholderProjectName(
        newProjectName,
        projectId,
      )
        ? !isPlaceholderProjectName(projectNameRef.current, projectId)
          ? projectNameRef.current
          : promptDerivedName
        : newProjectName;

      console.log(
        "[EditorProvider] Files ready, project:",
        resolvedProjectName,
        "sandboxId:",
        sandboxId,
      );
      if (resolvedProjectName) {
        setProjectName(resolvedProjectName);
        setIsPreviewLoading(true);
        forceRestartNextStartRef.current = true;
        devServerStartedRef.current = null;
        if (sandboxId) {
          setPendingSandboxId(sandboxId);
        }
        setPendingServerStart(resolvedProjectName);

        if (initialPrompt && !titleGeneratedRef.current) {
          generateProjectTitle();
        }

        setIsFilesLoading(true);

        const refetchWithRetry = async (maxAttempts = 6) => {
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            console.log(
              `[EditorProvider] Refetching project to get files_snapshot (attempt ${attempt + 1}/${maxAttempts})...`,
            );
            const latestProject = await refetchProject();
            const filesSnapshot = latestProject?.files_snapshot || {};

            if (Object.keys(filesSnapshot).length > 0) {
              setIsFilesLoading(false);
              console.log(
                "[EditorProvider] Files loaded, count:",
                Object.keys(filesSnapshot).length,
              );
              return;
            }
            console.log(
              "[EditorProvider] files_snapshot still empty, retrying...",
            );

            if (attempt < maxAttempts - 1) {
              const delay = 2000 + attempt * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
          console.warn(
            "[EditorProvider] files_snapshot still empty after all retries",
          );
          setIsFilesLoading(false);
        };

        if (filesRefetchTimeoutRef.current) {
          clearTimeout(filesRefetchTimeoutRef.current);
        }
        filesRefetchTimeoutRef.current = setTimeout(() => {
          refetchWithRetry();
        }, 3000);
      }
    },
    [refetchProject, initialPrompt, generateProjectTitle, projectId],
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
        console.log(
          "[EditorProvider] refetchProjectData: loaded",
          fileCount,
          "files",
        );
      }
      return fileCount;
    }
    return 0;
  }, [refetchProject]);

  const handleSandboxUrlUpdate = useCallback(
    (url: string | null) => {
      const normalizedUrl = url ? normalizeSandboxPreviewUrl(url) : null;

      console.log(
        "[EditorProvider] Sandbox URL update requested:",
        normalizedUrl || url,
      );
      updateSandboxUrlDebounced(normalizedUrl, {
        stopPolling: !!normalizedUrl,
      });

      if (!normalizedUrl) return;

      setProjectName((prevProjectName) => {
        if (!isPlaceholderProjectName(prevProjectName, projectId)) {
          return prevProjectName;
        }
        return deriveProjectNameFromPrompt(initialPrompt);
      });
    },
    [initialPrompt, projectId, updateSandboxUrlDebounced],
  );

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (debouncedUrlUpdateRef.current)
        clearTimeout(debouncedUrlUpdateRef.current);
      if (refreshLoadingTimeoutRef.current)
        clearTimeout(refreshLoadingTimeoutRef.current);
      if (filesRefetchTimeoutRef.current)
        clearTimeout(filesRefetchTimeoutRef.current);
    };
  }, []);

  // ---- Context value (state / actions / meta) ----

  const contextValue: EditorContextValue = {
    state: {
      currentView,
      projectName,
      hasUnsavedChanges,
      sandboxUrl,
      isPreviewLoading,
      isFilesLoading,
      isDevServerStarting,
    },
    actions: {
      setCurrentView,
      handleRefresh,
      saveProject,
      handleManualScreenshot,
      handleSandboxUrlUpdate,
      handleFilesReady,
      refetchProjectData,
    },
    meta: {
      projectId,
      project,
      savedMessages,
      messagesLoaded,
      initialPrompt,
      initialModel,
      onNavigateHome,
      previewRef,
      chatRef,
    },
  };

  return <EditorContext value={contextValue}>{children}</EditorContext>;
}
