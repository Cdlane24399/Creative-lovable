"use client"

import { Clock } from "lucide-react"
import { ChatMarkdown } from "./chat-markdown"
import { ToolResultItem } from "./tool-result-item"
import { ThinkingSection } from "./thinking-section"

// Local types matching what's used in chat-panel currently
export interface TextPart {
    type: "text"
    text: string
}

export type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error"

export interface ToolPart {
    type: string
    state?: ToolState
    input?: Record<string, unknown>
    output?: Record<string, unknown> | string
    errorText?: string
    toolCallId?: string
    [key: string]: unknown
}

export type MessagePart = TextPart | ToolPart

// Tool action types and mapping
type ToolAction = 'Edited' | 'Created' | 'Read' | 'Deleted' | 'Generated' | 'Searched' | 'Executed'

const TOOL_ACTION_MAP: Record<string, ToolAction> = {
  writeFile: 'Created',
  createFile: 'Created',
  batchWriteFiles: 'Generated',
  editFile: 'Edited',
  readFile: 'Read',
  getProjectStructure: 'Searched',
  analyzeProjectState: 'Searched',
  runCommand: 'Executed',
  executeCode: 'Executed',
  installPackage: 'Executed',
  installDependencies: 'Executed',
  getBuildStatus: 'Generated',
  planChanges: 'Generated',
  markStepComplete: 'Generated',
}

function getToolAction(toolName: string): ToolAction {
  return TOOL_ACTION_MAP[toolName] || 'Executed'
}

function extractFilePath(toolName: string, input?: Record<string, unknown>): string {
  if (input?.path) return String(input.path)
  if (input?.name) return String(input.name)
  if (input?.command) return String(input.command).slice(0, 50)
  return toolName
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
}

function normalizeBatchPath(path: string, baseDir?: string): string {
  const cleanPath = path.replace(/^\/+/, "")

  if (
    cleanPath.startsWith("app/") ||
    cleanPath.startsWith("src/") ||
    cleanPath.startsWith("components/") ||
    cleanPath.startsWith("lib/") ||
    cleanPath.startsWith("public/") ||
    cleanPath.startsWith("styles/") ||
    cleanPath.startsWith("hooks/")
  ) {
    return cleanPath
  }

  const resolvedBaseDir =
    typeof baseDir === "string" && baseDir.trim().length > 0 ? baseDir : "app"
  return `${resolvedBaseDir}/${cleanPath}`
}

function toPathSet(paths: string[], baseDir?: string): Set<string> {
  const set = new Set<string>()
  for (const path of paths) {
    set.add(path)
    set.add(normalizeBatchPath(path, baseDir))
  }
  return set
}

function getBatchAction(
  relativePath: string,
  declaredAction: unknown,
  createdSet: Set<string>,
  updatedSet: Set<string>,
  skippedSet: Set<string>,
): ToolAction {
  if (createdSet.has(relativePath)) return "Created"
  if (updatedSet.has(relativePath)) return "Edited"
  if (skippedSet.has(relativePath)) return "Read"
  if (declaredAction === "update") return "Edited"
  return "Created"
}

function safeStringify(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractToolContent(
  toolName: string,
  input?: Record<string, unknown>,
  output?: Record<string, unknown> | string,
  errorText?: string,
): string | undefined {
  if (toolName === "writeFile" && typeof input?.content === "string") {
    return input.content
  }

  if (toolName === "editFile" && typeof input?.replace === "string") {
    return input.replace
  }

  if (typeof output === "string") return output
  if (!output) return errorText

  const selectedValue =
    output.diff ??
    output.content ??
    output.result ??
    output.stdout ??
    output.stderr ??
    output.message

  if (typeof selectedValue === "string") {
    return selectedValue
  }

  return safeStringify(output) ?? errorText
}

interface ExpandedToolRow {
  action: ToolAction
  filePath: string
  content?: string
}

function expandBatchWriteToolPart(toolPart: ToolPart): ExpandedToolRow[] {
  if (!isRecord(toolPart.input)) return []
  const files = Array.isArray(toolPart.input.files) ? toolPart.input.files : []
  if (files.length === 0) return []

  const baseDir =
    typeof toolPart.input.baseDir === "string" ? toolPart.input.baseDir : "app"

  const output = isRecord(toolPart.output) ? toolPart.output : {}
  const createdSet = toPathSet(toStringArray(output.created), baseDir)
  const updatedSet = toPathSet(toStringArray(output.updated), baseDir)
  const skippedSet = toPathSet(toStringArray(output.skipped), baseDir)

  const rows: ExpandedToolRow[] = []
  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string") continue
    const filePath = normalizeBatchPath(file.path, baseDir)
    rows.push({
      action: getBatchAction(
        filePath,
        file.action,
        createdSet,
        updatedSet,
        skippedSet,
      ),
      filePath,
      content: typeof file.content === "string" ? file.content : undefined,
    })
  }

  const failedItems = Array.isArray(output.failed) ? output.failed : []
  for (const failed of failedItems) {
    if (!isRecord(failed) || typeof failed.path !== "string") continue
    rows.push({
      action: "Executed",
      filePath: normalizeBatchPath(failed.path, baseDir),
      content: safeStringify(failed),
    })
  }

  if (isRecord(toolPart.output)) {
    rows.push({
      action: "Generated",
      filePath: "batchWriteFiles/result.json",
      content: safeStringify(toolPart.output),
    })
  }

  return rows
}

interface MessageProps {
    role: "user" | "assistant" | "system" | "data"
    content?: string
    parts?: MessagePart[]
    /** Thinking time in seconds before the response started */
    thinkingTime?: number
    /** Optional thinking/reasoning content to display */
    thinkingContent?: string
}

export function Message({ role, content, parts, thinkingTime, thinkingContent }: MessageProps) {
    if (role === "user") {
        return (
            <div className="flex w-full justify-end">
                <div className="max-w-[85%] rounded-2xl bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 shadow-sm backdrop-blur-sm">
                    {parts ? (
                        parts.map((part, i) => (
                            part.type === "text" ? <span key={i}>{(part as TextPart).text}</span> : null
                        ))
                    ) : (
                        <span>{content}</span>
                    )}
                </div>
            </div>
        )
    }

    // Assistant Message
    return (
        <div className="flex w-full flex-col gap-2">
            {/* Thinking time indicator */}
            {/* Thinking section */}
            {thinkingContent && (
                <ThinkingSection content={thinkingContent} />
            )}
            {/* Thinking time indicator (fallback if no thinking content) */}
            {!thinkingContent && thinkingTime !== undefined && thinkingTime > 0 && (
                <div className="flex items-center gap-1 px-1">
                    <Clock className="h-3 w-3 text-zinc-500" />
                    <span className="text-xs text-zinc-500">
                        Thought for {thinkingTime}s
                    </span>
                </div>
            )}
            <div className="flex flex-col gap-2 rounded-2xl p-1">
                {parts ? (
                    // Complex message with parts (text + tools)
                    <AssistantMessageParts parts={parts} />
                ) : (
                    // Simple text content
                    <div className="text-sm text-zinc-300">
                        <ChatMarkdown content={content || ""} />
                    </div>
                )}
            </div>
        </div>
    )
}

function AssistantMessageParts({ parts }: { parts: MessagePart[] }) {
    const elements: React.ReactNode[] = []

    parts.forEach((part, index) => {
        if (part.type === "text") {
            // Don't render empty text parts
            if (!(part as TextPart).text.trim()) return

            elements.push(
                <div key={`text-${index}`} className="text-sm text-zinc-300 px-1">
                    <ChatMarkdown content={(part as TextPart).text} />
                </div>
            )
        } else if (part.type.startsWith("tool-")) {
            const toolPart = part as ToolPart
            const toolName = toolPart.type.replace("tool-", "")

            if (toolName === "batchWriteFiles") {
                const expandedRows = expandBatchWriteToolPart(toolPart)
                if (expandedRows.length > 0) {
                    expandedRows.forEach((row, rowIndex) => {
                        elements.push(
                            <ToolResultItem
                                key={`tool-${index}-row-${rowIndex}`}
                                action={row.action}
                                filePath={row.filePath}
                                content={row.content}
                                state={toolPart.state}
                            />
                        )
                    })
                    return
                }
            }

            const action = getToolAction(toolName)
            const filePath = extractFilePath(toolName, toolPart.input)
            const content = extractToolContent(
                toolName,
                toolPart.input,
                toolPart.output,
                toolPart.errorText,
            )

            elements.push(
                <ToolResultItem
                    key={`tool-${index}`}
                    action={action}
                    filePath={filePath}
                    content={content}
                    state={toolPart.state}
                />
            )
        }
    })

    return <>{elements}</>
}
