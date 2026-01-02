"use client"

import { useState, useMemo } from "react"
import {
  Check,
  Circle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
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

// Get human-readable action name
function getActionName(toolName: string, input?: Record<string, unknown>): string {
  switch (toolName) {
    case "createWebsite":
      return input?.name ? `Create ${input.name}` : "Create website"
    case "writeFile":
      return input?.path ? `Write ${String(input.path).split("/").pop()}` : "Write file"
    case "editFile":
      return input?.path ? `Edit ${String(input.path).split("/").pop()}` : "Edit file"
    case "readFile":
      return input?.path ? `Read ${String(input.path).split("/").pop()}` : "Read file"
    case "runCommand":
      return input?.command ? `Run: ${String(input.command).slice(0, 30)}` : "Run command"
    case "executeCode":
      return "Execute code"
    case "installPackage":
      return input?.packageName ? `Install ${input.packageName}` : "Install package"
    case "startDevServer":
      return "Start dev server"
    case "getProjectStructure":
      return "Scan project"
    case "getBuildStatus":
      return "Check build"
    case "planChanges":
      return "Plan changes"
    case "markStepComplete":
      return input?.step ? `Complete: ${String(input.step).slice(0, 30)}` : "Mark step complete"
    case "analyzeProjectState":
      return "Analyze project"
    default:
      return toolName.replace(/([A-Z])/g, " $1").trim()
  }
}

// Single checklist item
export function ToolCallDisplay({
  toolName,
  state,
  input,
  errorText,
}: ToolCallDisplayProps) {
  const isLoading = state === "input-streaming" || state === "input-available"
  const isSuccess = state === "output-available"
  const isError = state === "output-error"

  const actionName = getActionName(toolName, input)

  return (
    <div className={cn(
      "flex items-center gap-2 py-0.5 text-sm",
      isError && "text-red-400"
    )}>
      {/* Status icon */}
      <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
        ) : isSuccess ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : isError ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <Circle className="h-3 w-3 text-zinc-600" />
        )}
      </div>

      {/* Action name */}
      <span className={cn(
        "truncate",
        isSuccess && "text-zinc-400",
        isLoading && "text-zinc-300",
        isError && "text-red-400",
        !isLoading && !isSuccess && !isError && "text-zinc-500"
      )}>
        {actionName}
      </span>

      {/* Error hint */}
      {isError && errorText && (
        <span className="text-xs text-red-500/70 truncate max-w-[150px]" title={errorText}>
          ({errorText.slice(0, 20)}...)
        </span>
      )}
    </div>
  )
}

// Grouped tool calls as checklist
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
  const [isExpanded, setIsExpanded] = useState(true)

  // Analyze completion status
  const { completedCount, hasError, isAllComplete } = useMemo(() => {
    const completed = toolCalls.filter((t) => t.state === "output-available").length
    const hasErr = toolCalls.some((t) => t.state === "output-error")
    return {
      completedCount: completed,
      hasError: hasErr,
      isAllComplete: completed === toolCalls.length && !hasErr,
    }
  }, [toolCalls])

  // If only one tool, show inline
  if (toolCalls.length === 1) {
    const tool = toolCalls[0]
    return (
      <div className="my-1 pl-1">
        <ToolCallDisplay
          toolName={tool.toolName}
          toolCallId={tool.toolCallId}
          state={tool.state}
          input={tool.input}
          output={tool.output}
          errorText={tool.errorText}
          progress={getToolProgress?.(tool.toolCallId)}
        />
      </div>
    )
  }

  // Multiple tools - collapsible checklist
  return (
    <div className="my-1">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors py-0.5"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>
          {isAllComplete 
            ? `${toolCalls.length} actions completed`
            : `${completedCount}/${toolCalls.length} actions`
          }
        </span>
      </button>

      {/* Checklist items */}
      {isExpanded && (
        <div className="ml-2 pl-2 border-l border-zinc-800">
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
