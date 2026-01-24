"use client"

import { useState, useMemo } from "react"
import {
  Check,
  Circle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Package,
  FileEdit,
  FileText,
  CheckCircle2,
  Settings,
  Play,
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

// Tool call data interface (used by both display components and grouping)
interface ToolCallData {
  toolName: string
  toolCallId: string
  state?: ToolState
  input?: Record<string, unknown>
  output?: Record<string, unknown> | string
  errorText?: string
  progress?: ToolProgress
}

// Activity category types
type ActivityCategory = "installing" | "edited" | "read" | "checked" | "running" | "other"

// Category configuration
const CATEGORY_CONFIG: Record<ActivityCategory, {
  icon: React.ElementType
  label: string
  activeLabel: string
  emoji: string
}> = {
  installing: {
    icon: Package,
    label: "Installed",
    activeLabel: "Installing",
    emoji: "📦",
  },
  edited: {
    icon: FileEdit,
    label: "Edited",
    activeLabel: "Editing",
    emoji: "✏️",
  },
  read: {
    icon: FileText,
    label: "Read",
    activeLabel: "Reading",
    emoji: "📄",
  },
  checked: {
    icon: CheckCircle2,
    label: "Checked",
    activeLabel: "Checking",
    emoji: "✓",
  },
  running: {
    icon: Play,
    label: "Ran",
    activeLabel: "Running",
    emoji: "▶",
  },
  other: {
    icon: Settings,
    label: "Actions",
    activeLabel: "Working",
    emoji: "⚙️",
  },
}

// Categorize tool by name
function getToolCategory(toolName: string): ActivityCategory {
  switch (toolName) {
    case "installPackage":
    case "installDependencies":
      return "installing"
    case "writeFile":
    case "editFile":
    case "createFile":
      return "edited"
    case "readFile":
    case "getProjectStructure":
    case "analyzeProjectState":
      return "read"
    case "getBuildStatus":
    case "checkBuild":
    case "validateCode":
      return "checked"
    case "runCommand":
    case "executeCode":
    case "startDevServer":
      return "running"
    default:
      return "other"
  }
}

// Get human-readable action name
function getActionName(toolName: string, input?: Record<string, unknown>): string {
  switch (toolName) {
    case "createWebsite":
      return input?.name ? `Create ${input.name}` : "Create website"
    case "writeFile":
      return input?.path ? `${String(input.path).split("/").pop()}` : "Write file"
    case "editFile":
      return input?.path ? `${String(input.path).split("/").pop()}` : "Edit file"
    case "readFile":
      return input?.path ? `${String(input.path).split("/").pop()}` : "Read file"
    case "runCommand":
      return input?.command ? `${String(input.command).slice(0, 30)}` : "Run command"
    case "executeCode":
      return "Execute code"
    case "installPackage":
      return input?.packageName ? `${input.packageName}` : "Install package"
    case "startDevServer":
      return "Dev server"
    case "getProjectStructure":
      return "Project structure"
    case "getBuildStatus":
      return "Build status"
    case "planChanges":
      return "Plan changes"
    case "markStepComplete":
      return input?.step ? `${String(input.step).slice(0, 30)}` : "Mark step complete"
    case "analyzeProjectState":
      return "Project state"
    default:
      return toolName.replace(/([A-Z])/g, " $1").trim()
  }
}

// Get short name for collapsed display
function getShortName(toolName: string, input?: Record<string, unknown>): string {
  switch (toolName) {
    case "writeFile":
    case "editFile":
    case "readFile":
      return input?.path ? String(input.path).split("/").pop() || "file" : "file"
    case "installPackage":
      return input?.packageName ? String(input.packageName) : "package"
    case "runCommand":
      return input?.command ? String(input.command).slice(0, 25) : "command"
    default:
      return getActionName(toolName, input)
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

// Collapsible activity section for a single category
interface CollapsibleActivitySectionProps {
  category: ActivityCategory
  tools: ToolCallData[]
  getToolProgress?: (toolCallId: string) => ToolProgress | undefined
}

function CollapsibleActivitySection({
  category,
  tools,
  getToolProgress,
}: CollapsibleActivitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const config = CATEGORY_CONFIG[category]
  const CategoryIcon = config.icon

  // Check if any tool is still loading
  const isAnyLoading = tools.some(
    (t) => t.state === "input-streaming" || t.state === "input-available"
  )
  const completedCount = tools.filter((t) => t.state === "output-available").length
  const hasError = tools.some((t) => t.state === "output-error")
  const isAllComplete = completedCount === tools.length && !hasError

  // Get the first/current item name for collapsed display
  const displayName = tools.length > 0
    ? getShortName(tools[0].toolName, tools[0].input)
    : ""

  // Truncate display name for collapsed view
  const truncatedName = displayName.length > 20
    ? displayName.slice(0, 20) + "..."
    : displayName

  return (
    <div className="my-0.5">
      {/* Collapsed view - single line */}
      <div className="flex items-center gap-2 text-sm">
        {/* Status indicator */}
        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {isAnyLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
          ) : isAllComplete ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : hasError ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <CategoryIcon className="h-3.5 w-3.5 text-zinc-500" />
          )}
        </div>

        {/* Category label and item */}
        <span className={cn(
          "flex-shrink-0",
          isAnyLoading && "text-zinc-300",
          isAllComplete && "text-zinc-400",
          hasError && "text-red-400",
          !isAnyLoading && !isAllComplete && !hasError && "text-zinc-400"
        )}>
          {isAnyLoading ? config.activeLabel : config.label}
        </span>

        <span className={cn(
          "truncate text-zinc-500",
          isAnyLoading && "text-zinc-400"
        )}>
          {truncatedName}
          {tools.length > 1 && !isExpanded && "..."}
        </span>

        {/* Count badge */}
        {tools.length > 1 && (
          <span className={cn(
            "flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full",
            isAllComplete
              ? "bg-emerald-500/10 text-emerald-400"
              : hasError
                ? "bg-red-500/10 text-red-400"
                : "bg-zinc-700/50 text-zinc-400"
          )}>
            {tools.length}
          </span>
        )}

        {/* Toggle button */}
        {tools.length > 1 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
          >
            {isExpanded ? (
              <>
                Hide
                <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                Show all
                <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Expanded view - full list */}
      {isExpanded && tools.length > 1 && (
        <div className="ml-6 mt-1 pl-2 border-l border-zinc-700/50">
          {tools.map((tool) => (
            <div
              key={tool.toolCallId}
              className="flex items-center gap-2 py-0.5 text-sm"
            >
              {/* Item status */}
              <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {tool.state === "input-streaming" || tool.state === "input-available" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                ) : tool.state === "output-available" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : tool.state === "output-error" ? (
                  <AlertCircle className="h-3 w-3 text-red-500" />
                ) : (
                  <Circle className="h-2.5 w-2.5 text-zinc-600" />
                )}
              </div>

              {/* Item name */}
              <span className={cn(
                "truncate text-xs",
                tool.state === "output-available" && "text-zinc-500",
                (tool.state === "input-streaming" || tool.state === "input-available") && "text-zinc-300",
                tool.state === "output-error" && "text-red-400",
                !tool.state && "text-zinc-500"
              )}>
                {getShortName(tool.toolName, tool.input)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Grouped tool calls as checklist
interface ToolCallsGroupProps {
  toolCalls: ToolCallData[]
  getToolProgress?: (toolCallId: string) => ToolProgress | undefined
}

export function ToolCallsGroup({ toolCalls, getToolProgress }: ToolCallsGroupProps) {
  // Group tools by category
  const groupedTools = useMemo(() => {
    const groups: Partial<Record<ActivityCategory, ToolCallData[]>> = {}

    toolCalls.forEach((tool) => {
      const category = getToolCategory(tool.toolName)
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category]!.push(tool)
    })

    return groups
  }, [toolCalls])

  // Get ordered list of categories that have tools
  const orderedCategories = useMemo(() => {
    const order: ActivityCategory[] = ["installing", "edited", "read", "checked", "running", "other"]
    return order.filter((cat) => groupedTools[cat] && groupedTools[cat]!.length > 0)
  }, [groupedTools])

  // If only one tool, show simple inline display
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

  // Multiple tools - show collapsible sections by category
  return (
    <div className="my-1 pl-1 space-y-0.5">
      {orderedCategories.map((category) => (
        <CollapsibleActivitySection
          key={category}
          category={category}
          tools={groupedTools[category]!}
          getToolProgress={getToolProgress}
        />
      ))}
    </div>
  )
}
