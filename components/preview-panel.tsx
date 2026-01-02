"use client"

import { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from "react"
import { FeaturesCarousel } from "./features-carousel"
import { Loader2 } from "lucide-react"
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
  onRefresh?: () => void
}

export interface PreviewPanelHandle {
  refresh: () => void
  isLoading: boolean
}

export const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(
  function PreviewPanel({ content, sandboxUrl, isLoading: externalLoading, project, onRefresh }, ref) {
    const [iframeLoading, setIframeLoading] = useState(true)
    const [iframeKey, setIframeKey] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [loadTimeout, setLoadTimeout] = useState(false)
    const [urlExpanded, setUrlExpanded] = useState(false)
    const [copied, setCopied] = useState(false)
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
    useImperativeHandle(ref, () => ({
      refresh: handleRefresh,
      isLoading: iframeLoading,
    }), [handleRefresh, iframeLoading])

    // Copy URL to clipboard
    const handleCopyUrl = useCallback(() => {
      if (sandboxUrl) {
        navigator.clipboard.writeText(sandboxUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }, [sandboxUrl])

    // Close URL bar when clicking outside
    useEffect(() => {
      if (urlExpanded) {
        const handleClickOutside = () => setUrlExpanded(false)
        document.addEventListener("click", handleClickOutside)
        return () => document.removeEventListener("click", handleClickOutside)
      }
    }, [urlExpanded])

    return (
      <div className="h-full w-full bg-[#111111] p-4 flex flex-col">
        <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
          {/* Lovable-style toolbar */}
          <div className="flex items-center justify-center mb-3 px-1">
            <TabsList className="flex items-center gap-1 p-1 rounded-full bg-zinc-900/80 border border-zinc-800/50 h-auto">
              {/* Preview toggle with green indicator */}
              <TabsTrigger
                value="preview"
                className={cn(
                  "relative flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all",
                  "data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none",
                  "data-[state=inactive]:text-zinc-500 data-[state=inactive]:hover:text-zinc-300 data-[state=inactive]:hover:bg-zinc-800/50"
                )}
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                Preview
              </TabsTrigger>

              {/* Divider */}
              <div className="h-5 w-px bg-zinc-700/50 mx-1" />

              {/* Icon toggles */}
              <TabsTrigger
                value="code"
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full transition-all p-0",
                  "data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none",
                  "data-[state=inactive]:text-zinc-500 data-[state=inactive]:hover:text-zinc-300 data-[state=inactive]:hover:bg-zinc-800/50"
                )}
                title="Code"
              >
                <Layers className="h-4 w-4" />
              </TabsTrigger>

              <TabsTrigger
                value="settings"
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full transition-all p-0",
                  "data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none",
                  "data-[state=inactive]:text-zinc-500 data-[state=inactive]:hover:text-zinc-300 data-[state=inactive]:hover:bg-zinc-800/50"
                )}
                title="Settings"
              >
                <BarChart3 className="h-4 w-4" />
              </TabsTrigger>

              {/* Divider */}
              <div className="h-5 w-px bg-zinc-700/50 mx-1" />

              {/* Add button */}
              <button
                type="button"
                className="flex items-center justify-center h-8 w-8 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
                title="Add"
              >
                <Plus className="h-4 w-4" />
              </button>
            </TabsList>

            {/* Expandable URL bar */}
            <div className="relative ml-4" onClick={(e) => e.stopPropagation()}>
              <AnimatePresence mode="wait">
                {urlExpanded && sandboxUrl ? (
                  <motion.div
                    key="expanded"
                    initial={{ width: 40, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 40, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/50"
                  >
                    {/* Refresh button */}
                    <button
                      onClick={handleRefresh}
                      disabled={!!isLoading}
                      className="flex items-center justify-center h-6 w-6 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all disabled:opacity-50"
                      title="Refresh"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* URL display */}
                    <span className="text-zinc-400 text-sm max-w-[300px] truncate">
                      {sandboxUrl.replace(/^https?:\/\//, "")}
                    </span>

                    {/* Copy button */}
                    <button
                      onClick={handleCopyUrl}
                      className="flex items-center justify-center h-6 w-6 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
                      title="Copy URL"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Open external */}
                    <button
                      onClick={() => window.open(sandboxUrl, "_blank")}
                      className="flex items-center justify-center h-6 w-6 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="collapsed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => sandboxUrl && setUrlExpanded(true)}
                    disabled={!sandboxUrl}
                    className={cn(
                      "flex items-center justify-center px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/50 transition-all",
                      sandboxUrl 
                        ? "text-zinc-400 hover:text-zinc-300 hover:border-zinc-700 cursor-pointer" 
                        : "text-zinc-600 cursor-not-allowed"
                    )}
                    title={sandboxUrl ? "Click to expand URL" : "No preview available"}
                  >
                    <span className="text-sm">/</span>
                    {sandboxUrl && (
                      <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111]">
            <TabsContent value="preview" className="h-full w-full m-0 data-[state=inactive]:hidden">
              <div className="relative h-full w-full">
                {/* Loading indicator for iframe or dev server */}
                {(isLoading || loadTimeout) && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/80">
                    <div className="flex flex-col items-center gap-3">
                      {loadTimeout ? (
                        <>
                          <div className="h-8 w-8 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
                          <span className="text-sm text-amber-400">Preview is taking longer than usual...</span>
                          <span className="text-xs text-zinc-500">The dev server may still be starting up</span>
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                          <span className="text-sm text-zinc-400">
                            {externalLoading ? "Starting dev server..." : "Loading preview..."}
                          </span>
                          {externalLoading && (
                            <span className="text-xs text-zinc-500">This may take a few seconds</span>
                          )}
                        </>
                      )}
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
                       <FeaturesCarousel compact />
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="code" className="h-full w-full m-0 data-[state=inactive]:hidden">
              <CodeEditor files={project?.files_snapshot || {}} />
            </TabsContent>

            <TabsContent value="settings" className="h-full w-full m-0 data-[state=inactive]:hidden">
              <ProjectSettings project={project} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    )
  }
)
