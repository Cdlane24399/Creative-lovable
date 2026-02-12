"use client";

import React, {
  useState,
  useEffect,
  useImperativeHandle,
  useRef,
  useCallback,
} from "react";
import dynamic from "next/dynamic";
import { Camera } from "lucide-react";
import { useEditor } from "@/components/contexts/editor-context";
import { PreviewLoading } from "./preview-loading";

// Dynamic import — these are behind tabs, not needed on initial render
const CodeEditor = dynamic(
  () => import("./code-editor").then((m) => m.CodeEditor),
  { ssr: false },
);
const ProjectSettings = dynamic(
  () => import("./project-settings").then((m) => m.ProjectSettings),
  { ssr: false },
);

export interface PreviewPanelHandle {
  refresh: () => void;
  isLoading: boolean;
}

interface PreviewPanelProps {
  ref?: React.Ref<PreviewPanelHandle>;
}

export function PreviewPanel({ ref }: PreviewPanelProps) {
  // Consume shared state from EditorContext (no prop drilling)
  const { state, actions, meta } = useEditor();
  const {
    sandboxUrl,
    currentView,
    isPreviewLoading,
    isDevServerStarting,
    isFilesLoading,
  } = state;
  const { handleManualScreenshot } = actions;
  const { project } = meta;

  // External loading = preview loading or dev server starting
  const externalLoading = isPreviewLoading || isDevServerStarting;

  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeLoadingRef = useRef(true);
  const [iframeKey, setIframeKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Build iframe src with cache busting
  const iframeSrc = sandboxUrl
    ? `${sandboxUrl}${sandboxUrl.includes("?") ? "&" : "?"}t=${iframeKey}`
    : null;

  // Combined loading state
  // If we have a sandbox URL, prefer the iframe load signal so build/runtime errors are visible.
  const isLoading = sandboxUrl ? iframeLoading : externalLoading;

  // Keep ref in sync for timers (avoid stale closure values)
  iframeLoadingRef.current = iframeLoading;

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
    };
  }, []);

  // Track previous loading state to detect when loading finishes
  const prevLoadingRef = useRef(externalLoading);

  // Reset loading state and force iframe refresh when sandbox URL changes or loading completes
  useEffect(() => {
    if (!sandboxUrl) {
      setError(null);
      setLoadTimeout(false);
      setIframeLoading(false);
      lastUrlRef.current = null;
      return;
    }

    const urlChanged = sandboxUrl !== lastUrlRef.current;
    const loadingJustFinished = prevLoadingRef.current && !externalLoading;
    prevLoadingRef.current = externalLoading;

    if (!urlChanged && !loadingJustFinished) return;

    console.log("[PreviewPanel] Triggering iframe reload:", {
      urlChanged,
      loadingJustFinished,
      sandboxUrl,
    });
    lastUrlRef.current = sandboxUrl;

    setError(null);
    setLoadTimeout(false);
    setIframeLoading(true);

    // Force fresh iframe load to avoid cached content
    setIframeKey((k) => k + 1);

    // Set a timeout to detect stuck loads
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    loadTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && iframeLoadingRef.current) {
        console.warn("[PreviewPanel] Iframe load timeout");
        setLoadTimeout(true);
        setIframeLoading(false);
      }
    }, 30000);
  }, [sandboxUrl, externalLoading]);

  const handleIframeLoad = useCallback(() => {
    if (!mountedRef.current) return;

    console.log("[PreviewPanel] Iframe loaded successfully");
    setIframeLoading(false);
    setError(null);
    setLoadTimeout(false);

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleIframeError = useCallback(() => {
    if (!mountedRef.current) return;

    console.error("[PreviewPanel] Iframe load error");
    setIframeLoading(false);
    setError("Failed to load preview");

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (!mountedRef.current) return;

    // Debounce rapid refresh calls
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }

    refreshDebounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;

      setIframeLoading(true);
      setError(null);
      setLoadTimeout(false);
      setIframeKey((k) => k + 1);

      // Set timeout for this refresh
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      loadTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && iframeLoadingRef.current) {
          setLoadTimeout(true);
          setIframeLoading(false);
        }
      }, 30000);
    }, 300);
  }, []);

  // Expose methods to parent via ref (React 19: ref is a regular prop)
  useImperativeHandle(
    ref,
    () => ({
      refresh: handleRefresh,
      isLoading: iframeLoading,
    }),
    [handleRefresh, iframeLoading],
  );

  return (
    <div className="h-full w-full bg-[#111111] p-4 flex flex-col">
      <div className="flex-1 relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111]">
        {currentView === "preview" && (
          <div className="relative h-full w-full">
            {/* Loading indicator for iframe or dev server */}
            {(isLoading || loadTimeout) && (
              <PreviewLoading
                isTimeout={loadTimeout}
                isExternalLoading={externalLoading}
              />
            )}

            {/* Error display */}
            {error && !isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/80">
                <div className="flex flex-col items-center gap-3 text-center px-4">
                  <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <span className="text-sm text-red-400">{error}</span>
                  <button
                    onClick={handleRefresh}
                    className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Screenshot capture button */}
            {sandboxUrl && !isLoading && !error && (
              <button
                onClick={handleManualScreenshot}
                className="absolute top-3 right-3 z-20 p-2 bg-zinc-800/90 hover:bg-zinc-700 rounded-lg transition-colors group"
                title="Capture screenshot"
              >
                <Camera className="h-4 w-4 text-zinc-400 group-hover:text-white" />
              </button>
            )}

            {/* Preview content */}
            <div className="flex h-full items-center justify-center overflow-hidden bg-white">
              {iframeSrc ? (
                <iframe
                  ref={iframeRef}
                  key={iframeKey}
                  src={iframeSrc}
                  className="h-full w-full border-0"
                  title="Preview"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-[#111111]">
                  {/* Empty state - no sandbox yet */}
                  <div className="flex flex-col items-center gap-6 max-w-md w-full px-6">
                    <div className="h-16 w-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center">
                      <svg
                        className="h-8 w-8 text-zinc-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>

                    <div className="text-center">
                      <h3 className="text-base font-medium text-white mb-2">
                        No preview yet
                      </h3>
                      <p className="text-sm text-zinc-400 leading-relaxed">
                        Start a conversation to build your app and see a live
                        preview here.
                      </p>
                    </div>

                    <div className="w-full rounded-2xl bg-zinc-800/50 border border-zinc-700/50 p-5 mt-2">
                      <div className="aspect-video rounded-lg bg-linear-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse" />
                          <div className="flex flex-col gap-1.5">
                            <div className="h-2 w-20 rounded bg-white/10 animate-pulse" />
                            <div className="h-2 w-14 rounded bg-white/10 animate-pulse" />
                          </div>
                        </div>
                      </div>
                      <h4 className="text-sm font-medium text-white mb-1">
                        Real-time preview
                      </h4>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Watch your changes come to life instantly as you build.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === "code" && (
          <div className="h-full w-full">
            <CodeEditor
              files={project?.files_snapshot || {}}
              isLoading={isFilesLoading}
            />
          </div>
        )}

        {currentView === "settings" && (
          <div className="h-full w-full">
            <ProjectSettings project={project} />
          </div>
        )}
      </div>
    </div>
  );
}
