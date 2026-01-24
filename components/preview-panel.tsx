"use client"

import { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from "react"
import { Camera } from "lucide-react"
import { CodeEditor } from "./code-editor"
import { ProjectSettings } from "./project-settings"
import type { EditorView } from "./editor-header"
import type { Project } from "@/lib/db/types"

interface PreviewPanelProps {
  content?: string | null
  sandboxUrl?: string | null
  /** External loading state (e.g., dev server starting) */
  isLoading?: boolean
  project?: Project | null
  currentView?: EditorView
  onCaptureScreenshot?: () => void
}

export interface PreviewPanelHandle {
  refresh: () => void
  isLoading: boolean
}

export const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(
  function PreviewPanel(
    { content: _content, sandboxUrl, isLoading: externalLoading, project, currentView = "preview", onCaptureScreenshot },
    ref
  ) {
    const [iframeLoading, setIframeLoading] = useState(true)
    const [iframeKey, setIframeKey] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [loadTimeout, setLoadTimeout] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null)
    const lastUrlRef = useRef<string | null>(null)
    const mountedRef = useRef(true)

    // Build iframe src with cache busting
    const iframeSrc =
      sandboxUrl ? `${sandboxUrl}${sandboxUrl.includes("?") ? "&" : "?"}t=${iframeKey}` : null

    // Combined loading state
    const isLoading = externalLoading || (sandboxUrl && iframeLoading)

    // Cleanup on unmount
    useEffect(() => {
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
        }
        if (refreshDebounceRef.current) {
          clearTimeout(refreshDebounceRef.current)
        }
      }
    }, [])

    // Reset loading state and force iframe refresh when sandbox URL changes
    useEffect(() => {
      if (!sandboxUrl) {
        setError(null)
        setLoadTimeout(false)
        setIframeLoading(false)
        return
      }

      // Skip if URL hasn't changed
      if (sandboxUrl === lastUrlRef.current) return

      console.log("[PreviewPanel] Sandbox URL changed:", sandboxUrl)
      lastUrlRef.current = sandboxUrl

      setError(null)
      setLoadTimeout(false)
      setIframeLoading(true)

      // Force fresh iframe load to avoid cached content
      setIframeKey((k) => k + 1)

      // Set a timeout to detect stuck loads
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
      }
      loadTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && iframeLoading) {
          console.warn("[PreviewPanel] Iframe load timeout")
          setLoadTimeout(true)
          setIframeLoading(false)
        }
      }, 30000) // 30 second timeout
    }, [sandboxUrl])

    const handleIframeLoad = useCallback(() => {
      if (!mountedRef.current) return

      console.log("[PreviewPanel] Iframe loaded successfully")
      setIframeLoading(false)
      setError(null)
      setLoadTimeout(false)

      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
        loadTimeoutRef.current = null
      }
    }, [])

    const handleIframeError = useCallback(() => {
      if (!mountedRef.current) return

      console.error("[PreviewPanel] Iframe load error")
      setIframeLoading(false)
      setError("Failed to load preview")

      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
        loadTimeoutRef.current = null
      }
    }, [])

    const handleRefresh = useCallback(() => {
      if (!mountedRef.current) return

      // Debounce rapid refresh calls
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current)
      }

      refreshDebounceRef.current = setTimeout(() => {
        if (!mountedRef.current) return

        setIframeLoading(true)
        setError(null)
        setLoadTimeout(false)
        setIframeKey((k) => k + 1)

        // Set timeout for this refresh
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
        }
        loadTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && iframeLoading) {
            setLoadTimeout(true)
            setIframeLoading(false)
          }
        }, 30000)
      }, 300) // 300ms debounce
    }, [])

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        refresh: handleRefresh,
        isLoading: iframeLoading,
      }),
      [handleRefresh, iframeLoading]
    )

    return (
      <div className="h-full w-full bg-[#111111] p-4 flex flex-col">
        <div className="flex-1 relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111]">
          {currentView === "preview" && (
            <div className="relative h-full w-full">
              {/* Loading indicator for iframe or dev server */}
              {(isLoading || loadTimeout) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#111111]">
                  <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
                    {/* Spinner and status */}
                    <div className="flex flex-col items-center gap-3">
                      {loadTimeout ? (
                        <>
                          <div className="relative">
                            <div className="h-10 w-10 rounded-full border-2 border-amber-500/20" />
                            <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-transparent border-t-amber-500 animate-spin" />
                          </div>
                          <span className="text-sm text-amber-400">Taking longer than usual...</span>
                          <span className="text-xs text-zinc-500">The dev server may still be starting up</span>
                        </>
                      ) : (
                        <>
                          <div className="relative">
                            <div className="h-10 w-10 rounded-full border-2 border-emerald-500/20" />
                            <div className="absolute inset-0 h-10 w-10 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin" />
                          </div>
                          <span className="text-sm text-zinc-400">
                            {externalLoading ? "Starting dev server..." : "Getting ready..."}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Feature card */}
                    <div className="w-full rounded-2xl bg-zinc-800/50 border border-zinc-700/50 p-5">
                      {/* Gradient image placeholder */}
                      <div className="aspect-video rounded-lg bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center mb-4 overflow-hidden">
                        <div className="flex flex-col items-center gap-2 text-zinc-500">
                          <svg
                            className="h-8 w-8 opacity-40"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                        </div>
                      </div>
                      {/* Text content */}
                      <h3 className="text-sm font-medium text-white mb-1">Edit visually</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Click to edit directly or describe changes to Lovable.
                      </p>
                    </div>
                  </div>
                </div>
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
              {sandboxUrl && !isLoading && !error && onCaptureScreenshot && (
                <button
                  onClick={onCaptureScreenshot}
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
                      {/* Icon */}
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

                      {/* Text */}
                      <div className="text-center">
                        <h3 className="text-base font-medium text-white mb-2">No preview yet</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                          Start a conversation to build your app and see a live preview here.
                        </p>
                      </div>

                      {/* Feature highlight card */}
                      <div className="w-full rounded-2xl bg-zinc-800/50 border border-zinc-700/50 p-5 mt-2">
                        <div className="aspect-video rounded-lg bg-gradient-to-br from-violet-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse" />
                            <div className="flex flex-col gap-1.5">
                              <div className="h-2 w-20 rounded bg-white/10 animate-pulse" />
                              <div className="h-2 w-14 rounded bg-white/10 animate-pulse" />
                            </div>
                          </div>
                        </div>
                        <h4 className="text-sm font-medium text-white mb-1">Real-time preview</h4>
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
              <CodeEditor files={project?.files_snapshot || {}} isLoading={!project?.files_snapshot} />
            </div>
          )}

          {currentView === "settings" && (
            <div className="h-full w-full">
              <ProjectSettings project={project} />
            </div>
          )}
        </div>
      </div>
    )
  }
)
