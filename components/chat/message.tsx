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
  createWebsite: 'Created',
  editFile: 'Edited',
  readFile: 'Read',
  getProjectStructure: 'Searched',
  analyzeProjectState: 'Searched',
  runCommand: 'Executed',
  startDevServer: 'Executed',
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

function extractToolContent(output?: Record<string, unknown> | string): string | undefined {
  if (typeof output === 'string') return output
  if (!output) return undefined
  const o = output as Record<string, unknown>
  return (o.diff ?? o.content ?? o.result ?? o.stdout ?? o.message) as string | undefined
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
            const action = getToolAction(toolName)
            const filePath = extractFilePath(toolName, toolPart.input)
            const content = extractToolContent(toolPart.output)

            elements.push(
                <ToolResultItem
                    key={`tool-${index}`}
                    action={action}
                    filePath={filePath}
                    content={content}
                />
            )
        }
    })

    return <>{elements}</>
}
