"use client"

import { useState, useEffect, useMemo } from "react"
import { FeaturesCarousel } from "./features-carousel"
import { Loader2 } from "lucide-react"

interface PreviewPanelProps {
  content?: string | null
  sandboxUrl?: string | null
}

export function PreviewPanel({ content, sandboxUrl }: PreviewPanelProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)

  // Create a blob URL for the HTML content
  const previewUrl = useMemo(() => {
    if (!content) return null

    // Create a blob from the HTML content
    const blob = new Blob([content], { type: "text/html" })
    return URL.createObjectURL(blob)
  }, [content])

  // Clean up blob URL on unmount or when content changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  // Show loading briefly when content first appears
  useEffect(() => {
    if (content || sandboxUrl) {
      setIsLoading(true)
      const timer = setTimeout(() => setIsLoading(false), 500)
      return () => clearTimeout(timer)
    } else {
      // No content, hide loading after initial delay
      const timer = setTimeout(() => setIsLoading(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [content, sandboxUrl])

  const hasPreview = previewUrl || sandboxUrl

  return (
    <div className="relative h-full w-full bg-[#111111] p-4">
      {/* Rounded preview container */}
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-white">
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="flex items-center gap-2 rounded-full bg-zinc-800/90 px-4 py-2 backdrop-blur-sm">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              <span className="text-sm text-zinc-300">
                {hasPreview ? "Loading preview..." : "Getting ready..."}
              </span>
            </div>
          </div>
        )}

        {/* Preview content */}
        <div className="h-full w-full">
          {previewUrl ? (
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="h-full w-full border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin"
              onLoad={() => setIsLoading(false)}
            />
          ) : sandboxUrl ? (
            <iframe
              key={iframeKey}
              src={sandboxUrl}
              className="h-full w-full border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin"
              onLoad={() => setIsLoading(false)}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#111111]">
              <FeaturesCarousel compact />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
