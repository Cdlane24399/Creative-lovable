"use client";

import {
  createContext,
  use,
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useProject } from "@/hooks/use-projects";
import { normalizeSandboxPreviewUrl } from "@/lib/utils/url";
import { type ModelProvider } from "@/lib/ai/agent";
import {
  deriveProjectNameFromPrompt,
  isPlaceholderProjectName,
} from "@/lib/ai/project-naming";
import { useSandboxLifecycle } from "@/hooks/use-sandbox-lifecycle";
import { useProjectPersistence } from "@/hooks/use-project-persistence";
import { useScreenshotCapture } from "@/hooks/use-screenshot-capture";
import { useProjectTitle } from "@/hooks/use-project-title";
import type { EditorView } from "@/components/editor-header";
import type { ChatPanelHandle } from "@/components/chat-panel";
import type { PreviewPanelHandle } from "@/components/preview-panel";
import type { Project, Message } from "@/lib/db/types";

const debugLog =
  process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? (...args: Parameters<typeof console.log>) => console.log(...args)
    : () => {};

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
}

export function EditorProvider({
  children,
  projectId,
  initialPrompt,
  initialModel,
}: EditorProviderProps) {
  // ---- UI state ----
  const [currentView, setCurrentView] = useState<EditorView>("preview");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isFilesLoading, setIsFilesLoading] = useState(false);

  // ---- Refs ----
  const previewRef = useRef<PreviewPanelHandle>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const refreshLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const projectNameRef = useRef<string>(projectName);
  const lastSavedUrlRef = useRef<string | null>(null);

  // Keep ref in sync with state
  projectNameRef.current = projectName;

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

  // ---- Composed hooks ----

  const {
    sandboxUrl,
    isDevServerStarting,
    updateSandboxUrlDebounced,
    startServerForProject,
  } = useSandboxLifecycle({
    projectId,
    project,
    projectName,
    initialPrompt,
    lastSavedUrlRef,
    setIsPreviewLoading,
  });

  const { saveProject, refetchFilesWithRetry, refetchProjectData } =
    useProjectPersistence({
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
    });

  const { captureAndSaveScreenshot } = useScreenshotCapture({
    projectId,
    saveScreenshot,
  });

  const { titleGeneratedRef, generateProjectTitle } = useProjectTitle({
    projectId,
    initialPrompt,
    projectNameRef,
    setProjectName,
    updateProject,
  });

  // ---- Effects ----

  // Sync project name and title state when loading an existing project
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
    }
  }, [project, initialPrompt, titleGeneratedRef]);

  // Trigger title generation when sandbox URL becomes available
  useEffect(() => {
    if (sandboxUrl && initialPrompt && !titleGeneratedRef.current) {
      const timer = setTimeout(generateProjectTitle, 1000);
      return () => clearTimeout(timer);
    }
  }, [sandboxUrl, initialPrompt, generateProjectTitle, titleGeneratedRef]);

  // Auto-capture screenshot when sandbox URL becomes available
  useEffect(() => {
    if (!sandboxUrl || !projectName || !projectId) return;

    if (project?.screenshot_url && lastSavedUrlRef.current === sandboxUrl) {
      debugLog("[EditorProvider] Screenshot already exists for this URL");
      return;
    }

    const captureDelay = 5000;
    debugLog(
      `[EditorProvider] Scheduling automatic screenshot capture in ${captureDelay}ms`,
    );
    const timeoutId = setTimeout(async () => {
      debugLog("[EditorProvider] Executing automatic screenshot capture");
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

  // ---- Actions ----

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

  const handleManualScreenshot = useCallback(async () => {
    if (!sandboxUrl || !projectName) return;
    debugLog("[EditorProvider] Manual screenshot capture triggered");
    await captureAndSaveScreenshot(projectName, sandboxUrl);
    await refetchProject();
  }, [sandboxUrl, projectName, captureAndSaveScreenshot, refetchProject]);

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

      debugLog(
        "[EditorProvider] Files ready, project:",
        resolvedProjectName,
        "sandboxId:",
        sandboxId,
      );

      if (resolvedProjectName) {
        setProjectName(resolvedProjectName);
        startServerForProject(resolvedProjectName, sandboxId);

        if (initialPrompt && !titleGeneratedRef.current) {
          generateProjectTitle();
        }

        // Use the persistence hook's retry logic instead of inline polling
        refetchFilesWithRetry(3000);
      }
    },
    [
      initialPrompt,
      projectId,
      startServerForProject,
      generateProjectTitle,
      titleGeneratedRef,
      refetchFilesWithRetry,
    ],
  );

  const handleSandboxUrlUpdate = useCallback(
    (url: string | null) => {
      const normalizedUrl = url ? normalizeSandboxPreviewUrl(url) : null;

      debugLog(
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

  // Cleanup refresh timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshLoadingTimeoutRef.current)
        clearTimeout(refreshLoadingTimeoutRef.current);
    };
  }, []);

  // ---- Context value (state / actions / meta) ----

  const state = useMemo<EditorState>(
    () => ({
      currentView,
      projectName,
      hasUnsavedChanges,
      sandboxUrl,
      isPreviewLoading,
      isFilesLoading,
      isDevServerStarting,
    }),
    [
      currentView,
      projectName,
      hasUnsavedChanges,
      sandboxUrl,
      isPreviewLoading,
      isFilesLoading,
      isDevServerStarting,
    ],
  );

  const actions = useMemo<EditorActions>(
    () => ({
      setCurrentView,
      handleRefresh,
      saveProject,
      handleManualScreenshot,
      handleSandboxUrlUpdate,
      handleFilesReady,
      refetchProjectData,
    }),
    [
      setCurrentView,
      handleRefresh,
      saveProject,
      handleManualScreenshot,
      handleSandboxUrlUpdate,
      handleFilesReady,
      refetchProjectData,
    ],
  );

  const meta = useMemo<EditorMeta>(
    () => ({
      projectId,
      project,
      savedMessages,
      messagesLoaded,
      initialPrompt,
      initialModel,
      previewRef,
      chatRef,
    }),
    [
      projectId,
      project,
      savedMessages,
      messagesLoaded,
      initialPrompt,
      initialModel,
      previewRef,
      chatRef,
    ],
  );

  const contextValue = useMemo<EditorContextValue>(
    () => ({ state, actions, meta }),
    [state, actions, meta],
  );

  return <EditorContext value={contextValue}>{children}</EditorContext>;
}
