"use client"

import { useState, useEffect, useImperativeHandle, forwardRef } from "react"
import { FeaturesCarousel } from "./features-carousel"
import { Loader2 } from "lucide-react"

interface PreviewPanelProps {
  content?: string | null
  sandboxUrl?: string | null
}

export interface PreviewPanelHandle {
  refresh: () => void
  isLoading: boolean
}

export const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(
  function PreviewPanel({ content, sandboxUrl }, ref) {
    const [iframeLoading, setIframeLoading] = useState(true)
    const [iframeKey, setIframeKey] = useState(0)
    const iframeSrc =
      sandboxUrl ? `${sandboxUrl}${sandboxUrl.includes("?") ? "&" : "?"}t=${iframeKey}` : null

    // Reset loading state and force iframe refresh when sandbox URL changes
    useEffect(() => {
      if (sandboxUrl) {
        setIframeLoading(true)
        setIframeKey((k) => k + 1) // Force fresh iframe load to avoid cached content
      }
    }, [sandboxUrl])

    const handleIframeLoad = () => {
      setIframeLoading(false)
    }

    const handleRefresh = () => {
      setIframeLoading(true)
      setIframeKey((k) => k + 1)
    }

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      refresh: handleRefresh,
      isLoading: iframeLoading,
    }), [iframeLoading])

    return (
      <div className="relative h-full w-full bg-[#111111] p-4">
        {/* Rounded preview container - styled like an iframe */}
        <div className="relative h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111]">
          {/* Loading indicator for iframe */}
          {sandboxUrl && iframeLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/80">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                <span className="text-sm text-zinc-400">Loading preview...</span>
              </div>
            </div>
          )}

          {/* Preview content */}
          <div className="flex h-full items-center justify-center overflow-hidden">
            {iframeSrc ? (
              <iframe
                key={iframeKey}
                src={iframeSrc}
                className="h-full w-full border-0 bg-white"
                title="Preview"
                onLoad={handleIframeLoad}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
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
