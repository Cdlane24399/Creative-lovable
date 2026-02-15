"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDevServer } from "@/hooks/use-dev-server";
import { normalizeSandboxPreviewUrl } from "@/lib/utils/url";
import type { Project } from "@/lib/db/types";

const debugLog =
  process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? (...args: Parameters<typeof console.log>) => console.log(...args)
    : () => {};

interface UseSandboxLifecycleOptions {
  projectId: string | undefined;
  project: Project | null;
  projectName: string;
  initialPrompt: string | null | undefined;
  lastSavedUrlRef: React.RefObject<string | null>;
  setIsPreviewLoading: (val: boolean) => void;
}

export function useSandboxLifecycle({
  projectId,
  project,
  projectName,
  initialPrompt,
  lastSavedUrlRef,
  setIsPreviewLoading,
}: UseSandboxLifecycleOptions) {
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [pendingServerStart, setPendingServerStart] = useState<string | null>(
    null,
  );
  const [pendingSandboxId, setPendingSandboxId] = useState<string | null>(null);
  const [isPollingEnabled, setIsPollingEnabled] = useState(false);

  const sandboxUrlRef = useRef<string | null>(null);
  const debouncedUrlUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const devServerStartedRef = useRef<string | null>(null);
  const forceRestartNextStartRef = useRef(false);
  const validatingSandboxRef = useRef(false);
  const restorationAttemptedRef = useRef(false);
  const invalidUrlCleanupRef = useRef<Set<string>>(new Set());
  const projectNameRef = useRef<string>(projectName);

  // Keep refs in sync
  useEffect(() => {
    sandboxUrlRef.current = sandboxUrl;
  }, [sandboxUrl]);
  useEffect(() => {
    projectNameRef.current = projectName;
  }, [projectName]);

  // ---- Debounced URL updater ----
  const updateSandboxUrlDebounced = useCallback(
    (url: string | null, options?: { stopPolling?: boolean }) => {
      if (debouncedUrlUpdateRef.current) {
        clearTimeout(debouncedUrlUpdateRef.current);
      }

      debouncedUrlUpdateRef.current = setTimeout(() => {
        debugLog("[EditorProvider] Applying debounced URL update:", url);
        setSandboxUrl((prev) => (prev === url ? prev : url));
        setIsPreviewLoading(false);
        if (options?.stopPolling) {
          setIsPollingEnabled(false);
          setPendingServerStart(null);
        }
      }, 100);
    },
    [setIsPreviewLoading],
  );

  // ---- Dev server callbacks ----
  const handleDevServerReady = useCallback(
    (url: string) => {
      const normalizedUrl = normalizeSandboxPreviewUrl(url);
      if (!normalizedUrl) return;

      debugLog(
        "[EditorProvider] onReady callback triggered with url:",
        normalizedUrl,
      );
      updateSandboxUrlDebounced(normalizedUrl, { stopPolling: true });
    },
    [updateSandboxUrlDebounced],
  );

  const handleDevServerError = useCallback(
    (errors: string[]) => {
      console.error("[EditorProvider] Dev server errors:", errors);
      setIsPreviewLoading(false);
      setIsPollingEnabled(false);
    },
    [setIsPreviewLoading],
  );

  const handleDevServerStatusChange = useCallback(
    (status: { url: string | null }) => {
      if (!status.url) return;

      const normalizedUrl = normalizeSandboxPreviewUrl(status.url);
      if (!normalizedUrl || normalizedUrl === sandboxUrlRef.current) return;

      debugLog(
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

  // Start dev server when pending project name is set
  /* eslint-disable react-hooks/set-state-in-effect -- syncing polling state with dev server lifecycle */
  useEffect(() => {
    if (!pendingServerStart || !projectId) return;
    const forceRestart = forceRestartNextStartRef.current;
    if (devServerStartedRef.current === pendingServerStart && !forceRestart)
      return;

    debugLog(
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
  /* eslint-enable react-hooks/set-state-in-effect */

  // Restore project state when loading an existing project
  useEffect(() => {
    let isCancelled = false;

    if (project) {
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

        debugLog(
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
            if (isCancelled) return;

            const runningUrl =
              serverStatus?.isRunning && serverStatus?.url
                ? normalizeSandboxPreviewUrl(serverStatus.url)
                : null;

            if (runningUrl) {
              debugLog(
                "[EditorProvider] Using active dev-server URL from status:",
                runningUrl,
              );
              setSandboxUrl(runningUrl);
              validatingSandboxRef.current = false;
              return;
            }

            if (restoreData?.canRestore && restoreData?.fileCount > 0) {
              debugLog(
                "[EditorProvider] Saved URL is stale; restoring sandbox from snapshot...",
              );
              setSandboxUrl(null);
              devServerStartedRef.current = null;
              return;
            }

            if (project.sandbox_id) {
              debugLog(
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
              debugLog("[EditorProvider] Falling back to saved sandbox URL");
              setSandboxUrl(normalizedSavedUrl);
            } else {
              setSandboxUrl(null);
            }
            validatingSandboxRef.current = false;
          })
          .catch(() => {
            if (isCancelled) return;
            debugLog(
              "[EditorProvider] Validation failed, using saved sandbox URL",
            );
            if (normalizedSavedUrl) {
              setSandboxUrl(normalizedSavedUrl);
            }
            validatingSandboxRef.current = false;
          });
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [project, lastSavedUrlRef]);

  // Restore sandbox when opening an existing project without a working preview
  const restoreSandbox = useCallback(async () => {
    if (!projectId || restorationAttemptedRef.current) return;
    if (initialPrompt) return;

    restorationAttemptedRef.current = true;
    debugLog("[EditorProvider] Attempting to restore project sandbox...");
    setIsPreviewLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        debugLog("[EditorProvider] Sandbox restored:", data);

        if (data.sandboxId) {
          setPendingSandboxId(data.sandboxId);
        }

        devServerStartedRef.current = null;
        forceRestartNextStartRef.current = true;
        const serverName = projectNameRef.current || projectId;
        debugLog(
          "[EditorProvider] Starting dev server for restored sandbox:",
          serverName,
        );
        setPendingServerStart(serverName);
        setIsPollingEnabled(true);
      } else if (response.status === 422) {
        debugLog(
          "[EditorProvider] No snapshot files to restore, attempting sandbox resume/start",
        );
        if (project?.sandbox_id) {
          devServerStartedRef.current = null;
          forceRestartNextStartRef.current = true;
          setPendingSandboxId(project.sandbox_id);
          setPendingServerStart(
            project.name || projectNameRef.current || projectId,
          );
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
  }, [projectId, initialPrompt, project, setIsPreviewLoading]);

  // Trigger restoration when opening an existing project
  useEffect(() => {
    if (project && !sandboxUrl && !initialPrompt) {
      const timer = setTimeout(restoreSandbox, 500);
      return () => clearTimeout(timer);
    }
  }, [project, sandboxUrl, initialPrompt, restoreSandbox]);

  // Cleanup debounced URL timeout on unmount
  useEffect(() => {
    return () => {
      if (debouncedUrlUpdateRef.current)
        clearTimeout(debouncedUrlUpdateRef.current);
    };
  }, []);

  /**
   * Trigger a dev server start for the given project name and optional sandbox ID.
   */
  const startServerForProject = useCallback(
    (name: string, sandboxId?: string) => {
      setIsPreviewLoading(true);
      forceRestartNextStartRef.current = true;
      devServerStartedRef.current = null;
      if (sandboxId) {
        setPendingSandboxId(sandboxId);
      }
      setPendingServerStart(name);
    },
    [setIsPreviewLoading],
  );

  return {
    sandboxUrl,
    setSandboxUrl,
    isDevServerStarting,
    updateSandboxUrlDebounced,
    startServerForProject,
  };
}
