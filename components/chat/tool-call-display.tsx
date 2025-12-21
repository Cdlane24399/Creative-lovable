"use client"

import { useState, useMemo } from "react"
import {
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Code,
  Globe,
  FileCode,
  Wrench,
  Loader2,
  Package,
  Terminal,
  FolderSearch,
  Download,
  Server,
  Clipboard,
  FileText,
  Pencil,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getContextualMessage } from "@/lib/ai/stream-progress"
import type { ToolProgress } from "@/hooks/use-chat-with-tools"

// AI SDK v5 tool states
type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error"

interface ToolCallDisplayProps {
  toolName: string
  toolCallId?: string
  state?: ToolState
  input?: Record<string, unknown>
  output?: Record<string, unknown> | string
  errorText?: string
  progress?: ToolProgress
}

// Tool display configurations
const TOOL_CONFIG: Record<string, { icon: React.ElementType; label: string; actionVerb: string }> = {
  createWebsite: {
    icon: Globe,
    label: "Creating Website",
    actionVerb: "website created",
  },
  writeFile: {
    icon: FileCode,
    label: "Writing File",
    actionVerb: "file written",
  },
  editFile: {
    icon: Pencil,
    label: "Editing File",
    actionVerb: "edit made",
  },
  readFile: {
    icon: FolderSearch,
    label: "Reading File",
    actionVerb: "file read",
  },
  runCommand: {
    icon: Terminal,
    label: "Running Command",
    actionVerb: "command run",
  },
  executeCode: {
    icon: Code,
    label: "Executing Code",
    actionVerb: "code executed",
  },
  installPackage: {
    icon: Download,
    label: "Installing Package",
    actionVerb: "package installed",
  },
  startDevServer: {
    icon: Server,
    label: "Starting Server",
    actionVerb: "server started",
  },
  getProjectStructure: {
    icon: FolderSearch,
    label: "Analyzing Structure",
    actionVerb: "structure analyzed",
  },
  getBuildStatus: {
    icon: Package,
    label: "Checking Build",
    actionVerb: "build checked",
  },
  planChanges: {
    icon: Clipboard,
    label: "Planning Changes",
    actionVerb: "plan created",
  },
  analyzeProjectState: {
    icon: FolderSearch,
    label: "Analyzing Project",
    actionVerb: "project analyzed",
  },
  default: {
    icon: Wrench,
    label: "Tool",
    actionVerb: "action completed",
  },
}

function getToolConfig(toolName: string) {
  return TOOL_CONFIG[toolName] || { ...TOOL_CONFIG.default, label: toolName }
}

// Single tool call display (compact version)
export function ToolCallDisplay({
  toolName,
  toolCallId,
  state,
  input,
  output,
  errorText,
  progress,
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

  // Get contextual status message
  const statusMessage = useMemo(() => {
    if (progress && isLoading) {
      return progress.message
    }
    if (isLoading && input) {
      return getContextualMessage(toolName, input)
    }
    if (isSuccess) return "Completed"
    if (isError) return errorText?.slice(0, 50) || "Failed"
    return "Pending"
  }, [toolName, input, progress, isLoading, isSuccess, isError, errorText])

  // Extract preview URL if available
  const previewUrl =
    isSuccess && typeof output === "object" && output !== null
      ? (output as Record<string, unknown>).previewUrl
      : null

  return (
    <div className="my-1">
      {/* Compact header row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex w-full items-center gap-2 px-2 py-1.5 text-left rounded-lg transition-colors",
          "hover:bg-zinc-800/50",
          isError && "text-red-400"
        )}
      >
        {/* Status icon */}
        <div className="flex-shrink-0">
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
          ) : isSuccess ? (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
          ) : isError ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Icon className="h-3.5 w-3.5 text-zinc-500" />
          )}
        </div>

        {/* Tool name and status */}
        <span className="flex-1 text-xs text-zinc-400 truncate">
          {isLoading ? statusMessage : displayName}
        </span>

        {/* Expand indicator */}
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-zinc-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-zinc-600" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-6 mt-1 space-y-2 text-xs">
          {/* Input preview */}
          {input && Object.keys(input).length > 0 && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Input
              </span>
              <pre className="mt-1 overflow-x-auto rounded-md bg-zinc-900/50 p-2 text-[10px] text-zinc-500 max-h-32">
                {formatOutput(input)}
              </pre>
            </div>
          )}

          {/* Output preview */}
          {isSuccess && output !== undefined && output !== null && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Output
              </span>
              {previewUrl ? (
                <div className="mt-1 flex items-center gap-2 rounded-md bg-emerald-900/20 px-2 py-1.5">
                  <Globe className="h-3 w-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-300 truncate">
                    {previewUrl as string}
                  </span>
                </div>
              ) : (
                <pre className="mt-1 overflow-x-auto rounded-md bg-zinc-900/50 p-2 text-[10px] text-zinc-500 max-h-24">
                  {formatOutput(output)}
                </pre>
              )}
            </div>
          )}

          {/* Error message */}
          {isError && errorText && (
            <div className="rounded-md bg-red-950/30 p-2 text-[10px] text-red-400">
              {errorText}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Grouped tool calls summary component
interface ToolCallData {
  toolName: string
  toolCallId: string
  state?: ToolState
  input?: Record<string, unknown>
  output?: Record<string, unknown> | string
  errorText?: string
  progress?: ToolProgress
}

interface ToolCallsGroupProps {
  toolCalls: ToolCallData[]
  getToolProgress?: (toolCallId: string) => ToolProgress | undefined
}

export function ToolCallsGroup({ toolCalls, getToolProgress }: ToolCallsGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Analyze the tool calls
  const analysis = useMemo(() => {
    const hasLoading = toolCalls.some(
      (t) => t.state === "input-streaming" || t.state === "input-available"
    )
    const hasError = toolCalls.some((t) => t.state === "output-error")
    const completedCount = toolCalls.filter((t) => t.state === "output-available").length
    const totalCount = toolCalls.length

    // Count by type for summary
    const typeCounts: Record<string, number> = {}
    for (const tool of toolCalls) {
      const config = getToolConfig(tool.toolName)
      typeCounts[config.actionVerb] = (typeCounts[config.actionVerb] || 0) + 1
    }

    // Generate summary text
    let summaryText = ""
    const entries = Object.entries(typeCounts)
    
    if (entries.length === 1) {
      const [verb, count] = entries[0]
      summaryText = `${count} ${count === 1 ? verb : verb.replace(" made", "s made").replace(" created", "s created").replace(" written", "s written")}`
    } else {
      summaryText = `${totalCount} actions`
    }

    return {
      hasLoading,
      hasError,
      completedCount,
      totalCount,
      summaryText,
      isComplete: completedCount === totalCount && !hasLoading,
    }
  }, [toolCalls])

  // If only one tool call, show the simple version
  if (toolCalls.length === 1) {
    const tool = toolCalls[0]
    return (
      <ToolCallDisplay
        toolName={tool.toolName}
        toolCallId={tool.toolCallId}
        state={tool.state}
        input={tool.input}
        output={tool.output}
        errorText={tool.errorText}
        progress={getToolProgress?.(tool.toolCallId)}
      />
    )
  }

  return (
    <div className="my-2">
      {/* Summary row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left rounded-xl transition-all",
          "bg-zinc-800/40 hover:bg-zinc-800/60 border border-zinc-700/30"
        )}
      >
        {/* Icon */}
        <div className="flex-shrink-0">
          {analysis.hasLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          ) : analysis.hasError ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : (
            <FileText className="h-4 w-4 text-zinc-400" />
          )}
        </div>

        {/* Summary text */}
        <span className="flex-1 text-sm text-zinc-300">
          {analysis.hasLoading
            ? `Working... (${analysis.completedCount}/${analysis.totalCount})`
            : analysis.summaryText}
        </span>

        {/* Show all button */}
        <span className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors">
          {isExpanded ? "Hide" : "Show all"}
        </span>
      </button>

      {/* Expanded list */}
      {isExpanded && (
        <div className="mt-1 ml-2 border-l border-zinc-700/30 pl-2">
          {toolCalls.map((tool) => (
            <ToolCallDisplay
              key={tool.toolCallId}
              toolName={tool.toolName}
              toolCallId={tool.toolCallId}
              state={tool.state}
              input={tool.input}
              output={tool.output}
              errorText={tool.errorText}
              progress={getToolProgress?.(tool.toolCallId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
