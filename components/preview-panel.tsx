"use client"

import { useState, useEffect } from "react"
import { FeaturesCarousel } from "./features-carousel"
import { Loader2, ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PreviewPanelProps {
  content?: string | null
  sandboxUrl?: string | null
}

export function PreviewPanel({ content, sandboxUrl }: PreviewPanelProps) {
  const [iframeLoading, setIframeLoading] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)

  // Reset loading state when sandbox URL changes
  useEffect(() => {
    if (sandboxUrl) {
      setIframeLoading(true)
    }
  }, [sandboxUrl])

  const handleIframeLoad = () => {
    setIframeLoading(false)
  }

  const handleRefresh = () => {
    setIframeLoading(true)
    setIframeKey((k) => k + 1)
  }

  return (
    <div className="relative h-full w-full bg-[#111111] p-4">
      {/* Rounded preview container - styled like an iframe */}
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111]">
        {/* Toolbar when preview is active */}
        {sandboxUrl && (
          <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-4 py-2 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
              </div>
              <span className="ml-2 truncate text-xs text-zinc-500 max-w-[300px]">{sandboxUrl}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${iframeLoading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(sandboxUrl, "_blank")}
                className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

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
        <div className={`flex h-full items-center justify-center overflow-hidden ${sandboxUrl ? "pt-10" : ""}`}>
          {sandboxUrl ? (
            <iframe
              key={iframeKey}
              src={sandboxUrl}
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
