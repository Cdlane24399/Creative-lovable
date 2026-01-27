"use client"

import { Loader2, Sparkles, Brain } from "lucide-react"
import { cn } from "@/lib/utils"

interface StreamingStatusProps {
  status: "submitted" | "streaming" | "ready" | "error"
  isCallingTools?: boolean
  currentTool?: string
  className?: string
}

const THINKING_MESSAGE = "Thinking..."
const STREAMING_MESSAGE = "Generating response..."

export function StreamingStatus({
  status,
  isCallingTools,
  currentTool,
  className,
}: StreamingStatusProps) {
  if (status === "ready" || status === "error") return null

  // Don't show this component when tools are being called - ToolResultItem handles that
  if (isCallingTools && currentTool) return null

  // Determine what to show
  const isThinking = status === "submitted"
  const isStreaming = status === "streaming"

  // Get the appropriate message and icon
  let message: string
  let Icon: React.ElementType

  if (isThinking) {
    message = THINKING_MESSAGE
    Icon = Brain
  } else {
    message = STREAMING_MESSAGE
    Icon = Sparkles
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl bg-zinc-800/50 border border-zinc-700/30 px-4 py-3",
        className
      )}
    >
      {/* Animated icon */}
      <div className="relative">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
          <Icon className="h-4 w-4 text-emerald-400" />
        </div>
        <Loader2 className="absolute -right-1 -bottom-1 h-4 w-4 animate-spin text-emerald-400" />
      </div>

      {/* Message and indicator */}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-zinc-200">{message}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="flex gap-1">
            <div className="h-1 w-1 animate-pulse rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
            <div className="h-1 w-1 animate-pulse rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
            <div className="h-1 w-1 animate-pulse rounded-full bg-emerald-400" />
          </div>
          <span className="text-[10px] text-zinc-500">
            {isCallingTools ? "Tool in progress" : isThinking ? "Processing" : "Generating"}
          </span>
        </div>
      </div>
    </div>
  )
}
