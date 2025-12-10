"use client"

import { useState, useEffect } from "react"
import { FeaturesCarousel } from "./features-carousel"
import { Loader2 } from "lucide-react"

interface PreviewPanelProps {
  content?: string | null
  sandboxUrl?: string | null
}

export function PreviewPanel({ content, sandboxUrl }: PreviewPanelProps) {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => setIsLoading(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="relative h-full w-full bg-[#111111] p-4">
      {/* Rounded preview container - styled like an iframe */}
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-[#111111]">
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2">
            <div className="flex items-center gap-2 rounded-full bg-zinc-800/90 px-4 py-2 backdrop-blur-sm">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
              <span className="text-sm text-zinc-300">Getting ready...</span>
            </div>
          </div>
        )}

        {/* Preview content */}
        <div className="flex h-full items-center justify-center overflow-hidden pt-12">
          {sandboxUrl ? (
            <iframe src={sandboxUrl} className="h-full w-full border-0" title="Preview" />
          ) : (
            <FeaturesCarousel compact />
          )}
        </div>
      </div>
    </div>
  )
}
