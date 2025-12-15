"use client"

import { AlertTriangle, RefreshCw, XCircle, Wifi, Server, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ChatErrorProps {
  error: Error | string
  onRetry?: () => void
  className?: string
}

// Parse error to determine type and user-friendly message
function parseError(error: Error | string): {
  type: "network" | "auth" | "server" | "rate-limit" | "unknown"
  title: string
  message: string
  icon: React.ElementType
} {
  const errorMessage = typeof error === "string" ? error : error.message

  // Network errors
  if (
    errorMessage.includes("fetch") ||
    errorMessage.includes("network") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("NetworkError")
  ) {
    return {
      type: "network",
      title: "Connection Error",
      message: "Unable to connect to the server. Please check your internet connection and try again.",
      icon: Wifi,
    }
  }

  // Auth errors
  if (
    errorMessage.includes("401") ||
    errorMessage.includes("403") ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("Unauthorized") ||
    errorMessage.includes("API key")
  ) {
    return {
      type: "auth",
      title: "Authentication Error",
      message: "There was a problem with authentication. Please check your API keys or sign in again.",
      icon: Key,
    }
  }

  // Rate limit errors
  if (
    errorMessage.includes("429") ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("too many requests")
  ) {
    return {
      type: "rate-limit",
      title: "Rate Limited",
      message: "You've made too many requests. Please wait a moment before trying again.",
      icon: AlertTriangle,
    }
  }

  // Server errors
  if (
    errorMessage.includes("500") ||
    errorMessage.includes("502") ||
    errorMessage.includes("503") ||
    errorMessage.includes("504") ||
    errorMessage.includes("server error")
  ) {
    return {
      type: "server",
      title: "Server Error",
      message: "The server encountered an error. Please try again in a few moments.",
      icon: Server,
    }
  }

  // Unknown errors
  return {
    type: "unknown",
    title: "Something Went Wrong",
    message: errorMessage || "An unexpected error occurred. Please try again.",
    icon: XCircle,
  }
}

export function ChatError({ error, onRetry, className }: ChatErrorProps) {
  const { type, title, message, icon: Icon } = parseError(error)

  const colorClasses = {
    network: "border-amber-500/30 bg-amber-950/20",
    auth: "border-red-500/30 bg-red-950/20",
    server: "border-orange-500/30 bg-orange-950/20",
    "rate-limit": "border-yellow-500/30 bg-yellow-950/20",
    unknown: "border-red-500/30 bg-red-950/20",
  }

  const iconColors = {
    network: "text-amber-400",
    auth: "text-red-400",
    server: "text-orange-400",
    "rate-limit": "text-yellow-400",
    unknown: "text-red-400",
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        colorClasses[type],
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Error icon */}
        <div className={cn("mt-0.5 flex-shrink-0", iconColors[type])}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Error content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-zinc-100">{title}</h4>
          <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{message}</p>

          {/* Retry button */}
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="ghost"
              size="sm"
              className="mt-3 h-8 gap-1.5 rounded-lg bg-zinc-800 px-3 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
            >
              <RefreshCw className="h-3 w-3" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Empty state for when there's no messages
export function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 mb-4">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-6 w-6 text-emerald-400"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <h3 className="text-base font-medium text-zinc-200 mb-1">Start building</h3>
      <p className="text-sm text-zinc-500 text-center max-w-[280px]">
        Describe what you want to create and I'll help you build it step by step.
      </p>
      
      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 mt-6 justify-center">
        {["Landing page", "Dashboard", "E-commerce site", "Portfolio"].map((suggestion) => (
          <span
            key={suggestion}
            className="px-3 py-1.5 text-xs rounded-full border border-zinc-700/50 text-zinc-400 bg-zinc-800/30"
          >
            {suggestion}
          </span>
        ))}
      </div>
    </div>
  )
}
