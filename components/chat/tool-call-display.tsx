"use client"

import { useState } from "react"
import {
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Code,
  Globe,
  FileCode,
  Wrench,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

// AI SDK v5 tool states
type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error"

interface ToolCallDisplayProps {
  toolName: string
  state?: ToolState
  input?: Record<string, unknown>
  output?: Record<string, unknown> | string
  errorText?: string
}

// Tool display configurations
const TOOL_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  createWebsite: {
    icon: Globe,
    label: "Creating Website",
    color: "text-emerald-400",
  },
  updateFile: {
    icon: FileCode,
    label: "Updating File",
    color: "text-blue-400",
  },
  createFile: {
    icon: FileCode,
    label: "Creating File",
    color: "text-violet-400",
  },
  runCode: {
    icon: Code,
    label: "Running Code",
    color: "text-amber-400",
  },
  generateCode: {
    icon: Sparkles,
    label: "Generating Code",
    color: "text-pink-400",
  },
  default: {
    icon: Wrench,
    label: "Tool",
    color: "text-zinc-400",
  },
}

function getToolConfig(toolName: string) {
  return TOOL_CONFIG[toolName] || { ...TOOL_CONFIG.default, label: toolName }
}

export function ToolCallDisplay({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const config = getToolConfig(toolName)
  const Icon = config.icon

  const isLoading = state === "input-streaming" || state === "input-available"
  const isSuccess = state === "output-available"
  const isError = state === "output-error"

  // Format tool name for display
  const displayName = toolName
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (str) => str.toUpperCase())

  // Helper to safely format output
  const formatOutput = (data: unknown): string => {
    if (typeof data === "string") return data
    if (data === null || data === undefined) return ""
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  // Get status message based on tool and state
  const getStatusMessage = () => {
    if (isLoading) {
      switch (toolName) {
        case "createWebsite":
          return "Setting up sandbox environment..."
        case "updateFile":
          return "Applying changes..."
        case "createFile":
          return "Writing file..."
        case "runCode":
          return "Executing code..."
        default:
          return "Processing..."
      }
    }
    if (isSuccess) return "Completed"
    if (isError) return "Failed"
    return "Pending"
  }

  // Extract preview URL if available
  const previewUrl =
    isSuccess && typeof output === "object" && output !== null
      ? (output as Record<string, unknown>).previewUrl
      : null

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-xl border transition-all duration-200",
        isError
          ? "border-red-500/30 bg-red-950/20"
          : isSuccess
            ? "border-emerald-500/30 bg-emerald-950/10"
            : "border-zinc-700/50 bg-zinc-800/30"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {/* Status indicator */}
          <div className="relative">
            {isLoading ? (
              <div className="relative">
                <div className={cn("h-5 w-5 rounded-full bg-zinc-800", config.color)}>
                  <Icon className="h-5 w-5 p-0.5" />
                </div>
              </div>
            ) : isSuccess ? (
              <div className="relative">
                <div className={cn("h-5 w-5 rounded-full", config.color)}>
                  <Icon className="h-5 w-5 p-0.5" />
                </div>
                <CheckCircle className="absolute -right-0.5 -bottom-0.5 h-3 w-3 text-emerald-400" />
              </div>
            ) : isError ? (
              <div className="relative">
                <div className="h-5 w-5 rounded-full text-red-400">
                  <Icon className="h-5 w-5 p-0.5" />
                </div>
                <AlertCircle className="absolute -right-0.5 -bottom-0.5 h-3 w-3 text-red-400" />
              </div>
            ) : (
              <Icon className={cn("h-5 w-5", config.color)} />
            )}
          </div>

          {/* Tool name and status */}
          <div className="flex flex-col">
            <span className="text-xs font-medium text-zinc-200">{displayName}</span>
            <span className="text-[10px] text-zinc-500">{getStatusMessage()}</span>
          </div>
        </div>

        {/* Expand indicator */}
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="flex gap-0.5">
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.3s]" />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500 [animation-delay:-0.15s]" />
              <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" />
            </div>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-zinc-700/30 px-3 py-2.5 space-y-2">
          {/* Input preview */}
          {input && Object.keys(input).length > 0 && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Input
              </span>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-900/50 p-2 text-[10px] text-zinc-400">
                {formatOutput(input)}
              </pre>
            </div>
          )}

          {/* Output preview */}
          {isSuccess && output !== undefined && output !== null && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Output
              </span>
              {previewUrl ? (
                <div className="mt-1 flex items-center gap-2 rounded-lg bg-emerald-900/20 px-2 py-1.5">
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-xs text-emerald-300 truncate">
                    Preview ready: {previewUrl as string}
                  </span>
                </div>
              ) : (
                <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-900/50 p-2 text-[10px] text-zinc-400 max-h-32">
                  {formatOutput(output)}
                </pre>
              )}
            </div>
          )}

          {/* Error message */}
          {isError && errorText && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-red-400">
                Error
              </span>
              <div className="mt-1 rounded-lg bg-red-950/30 p-2 text-xs text-red-300">
                {errorText}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
