"use client"

import { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from "react"
import { FeaturesCarousel } from "./features-carousel"
import { Loader2 } from "lucide-react"

interface PreviewPanelProps {
  content?: string | null
  sandboxUrl?: string | null
  /** External loading state (e.g., dev server starting) */
  isLoading?: boolean
}

export interface PreviewPanelHandle {
  refresh: () => void
  isLoading: boolean
}

export const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(
  function PreviewPanel({ content, sandboxUrl, isLoading: externalLoading }, ref) {
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
    useImperativeHandle(ref, () => ({
      refresh: handleRefresh,
      isLoading: iframeLoading,
    }), [handleRefresh, iframeLoading])

    return (
      <div className="relative h-full w-full bg-[#111111] p-4">
        {/* Rounded preview container - styled like an iframe */}
        <div className="relative h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111]">
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
          <div className="flex h-full items-center justify-center overflow-hidden">
            {iframeSrc ? (
              <iframe
                ref={iframeRef}
                key={iframeKey}
                src={iframeSrc}
                className="h-full w-full border-0 bg-white"
                title="Preview"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              />
            ) : (
              <FeaturesCarousel compact />
            )}
          </div>
        </div>
      </div>
    )
  }
)
