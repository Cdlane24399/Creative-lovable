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
  type RefObject,
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

export interface EditorState {
  currentView: EditorView;
  projectName: string;
  hasUnsavedChanges: boolean;
  sandboxUrl: string | null;
  isPreviewLoading: boolean;
  isFilesLoading: boolean;
  isDevServerStarting: boolean;
}

export interface EditorUiActions {
  setCurrentView: (view: EditorView) => void;
  handleRefresh: () => void;
  saveProject: () => Promise<void>;
  handleManualScreenshot: () => Promise<void>;
}

export interface EditorChatActions {
  handleSandboxUrlUpdate: (url: string | null) => void;
  handleFilesReady: (projectName: string, sandboxId?: string) => void;
}

export interface EditorMeta {
  projectId: string | undefined;
  project: Project | null;
  savedMessages: Message[];
  messagesLoaded: boolean;
  initialPrompt: string | null | undefined;
  initialModel: ModelProvider | undefined;
}

export interface EditorRefs {
  previewRef: RefObject<PreviewPanelHandle | null>;
  chatRef: RefObject<ChatPanelHandle | null>;
}

export type EditorActions = EditorUiActions & EditorChatActions;

export interface EditorContextValue {
  state: EditorState;
  actions: EditorActions;
  meta: EditorMeta & EditorRefs;
}

const EditorStateContext = createContext<EditorState | null>(null);
const EditorUiActionsContext = createContext<EditorUiActions | null>(null);
const EditorChatActionsContext = createContext<EditorChatActions | null>(null);
const EditorMetaContext = createContext<EditorMeta | null>(null);
const EditorRefsContext = createContext<EditorRefs | null>(null);

function useRequiredContext<T>(ctx: T | null, name: string): T {
  if (!ctx) {
    throw new Error(`${name} must be used within an EditorProvider`);
  }
  return ctx;
}

export function useEditorState(): EditorState {
  return useRequiredContext(use(EditorStateContext), "useEditorState");
}

export function useEditorUiActions(): EditorUiActions {
  return useRequiredContext(use(EditorUiActionsContext), "useEditorUiActions");
}

export function useEditorChatActions(): EditorChatActions {
  return useRequiredContext(
    use(EditorChatActionsContext),
    "useEditorChatActions",
  );
}

export function useEditorMeta(): EditorMeta {
  return useRequiredContext(use(EditorMetaContext), "useEditorMeta");
}

export function useEditorRefs(): EditorRefs {
  return useRequiredContext(use(EditorRefsContext), "useEditorRefs");
}

export function useEditor(): EditorContextValue {
  const state = useEditorState();
  const uiActions = useEditorUiActions();
  const chatActions = useEditorChatActions();
  const meta = useEditorMeta();
  const refs = useEditorRefs();

  return useMemo(
    () => ({
      state,
      actions: { ...uiActions, ...chatActions },
      meta: { ...meta, ...refs },
    }),
    [state, uiActions, chatActions, meta, refs],
  );
}

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
  const [currentView, setCurrentView] = useState<EditorView>("preview");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [projectName, setProjectName] = useState<string>("Untitled Project");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isFilesLoading, setIsFilesLoading] = useState(false);

  const previewRef = useRef<PreviewPanelHandle | null>(null);
  const chatRef = useRef<ChatPanelHandle | null>(null);
  const refreshLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const projectNameRef = useRef<string>(projectName);
  const lastSavedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    projectNameRef.current = projectName;
  }, [projectName]);

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

  const { saveProject, refetchFilesWithRetry } = useProjectPersistence({
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

  /* eslint-disable react-hooks/set-state-in-effect -- syncing state from fetched project data */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (sandboxUrl && initialPrompt && !titleGeneratedRef.current) {
      const timer = setTimeout(generateProjectTitle, 1000);
      return () => clearTimeout(timer);
    }
  }, [sandboxUrl, initialPrompt, generateProjectTitle, titleGeneratedRef]);

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

  useEffect(() => {
    return () => {
      if (refreshLoadingTimeoutRef.current)
        clearTimeout(refreshLoadingTimeoutRef.current);
    };
  }, []);

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

  const uiActions = useMemo<EditorUiActions>(
    () => ({
      setCurrentView,
      handleRefresh,
      saveProject,
      handleManualScreenshot,
    }),
    [setCurrentView, handleRefresh, saveProject, handleManualScreenshot],
  );

  const chatActions = useMemo<EditorChatActions>(
    () => ({
      handleSandboxUrlUpdate,
      handleFilesReady,
    }),
    [handleSandboxUrlUpdate, handleFilesReady],
  );

  const meta = useMemo<EditorMeta>(
    () => ({
      projectId,
      project,
      savedMessages,
      messagesLoaded,
      initialPrompt,
      initialModel,
    }),
    [
      projectId,
      project,
      savedMessages,
      messagesLoaded,
      initialPrompt,
      initialModel,
    ],
  );

  const refs = useMemo<EditorRefs>(
    () => ({
      previewRef,
      chatRef,
    }),
    [previewRef, chatRef],
  );

  return (
    <EditorRefsContext value={refs}>
      <EditorMetaContext value={meta}>
        <EditorStateContext value={state}>
          <EditorUiActionsContext value={uiActions}>
            <EditorChatActionsContext value={chatActions}>
              {children}
            </EditorChatActionsContext>
          </EditorUiActionsContext>
        </EditorStateContext>
      </EditorMetaContext>
    </EditorRefsContext>
  );
}
