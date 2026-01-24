"use client"

import type { UIMessage } from "ai"
import { cn } from "@/lib/utils"
import { Clock } from "lucide-react"
// import type { Message } from "@/lib/db/types" // Using the type from props usually, or defining local interface if needed
import { ChatMarkdown } from "./chat-markdown"
import { ToolCallsGroup } from "./tool-call-display"
import type { ToolProgress } from "@/hooks/use-chat-with-tools"

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

interface MessageProps {
    role: "user" | "assistant" | "system" | "data"
    content?: string
    parts?: MessagePart[]
    toolProgress?: (toolCallId: string) => ToolProgress | undefined
    /** Thinking time in seconds before the response started */
    thinkingTime?: number
}

export function Message({ role, content, parts, toolProgress, thinkingTime }: MessageProps) {
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
            {thinkingTime !== undefined && thinkingTime > 0 && (
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
                    <AssistantMessageParts parts={parts} toolProgress={toolProgress} />
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

function AssistantMessageParts({
    parts,
    toolProgress
}: {
    parts: MessagePart[]
    toolProgress?: (toolCallId: string) => ToolProgress | undefined
}) {
    const elements: React.ReactNode[] = []
    let currentToolGroup: Array<{
        toolName: string
        toolCallId: string
        state?: ToolState
        input?: Record<string, unknown>
        output?: Record<string, unknown> | string
        errorText?: string
    }> = []
    let groupKey = 0

    const flushToolGroup = () => {
        if (currentToolGroup.length > 0) {
            elements.push(
                <ToolCallsGroup
                    key={`tool-group-${groupKey++}`}
                    toolCalls={currentToolGroup}
                    getToolProgress={toolProgress}
                />
            )
            currentToolGroup = []
        }
    }

    parts.forEach((part, index) => {
        if (part.type === "text") {
            flushToolGroup()
            // Don't render empty text parts
            if (!(part as TextPart).text.trim()) return

            elements.push(
                <div key={`text-${index}`} className="text-sm text-zinc-300 px-1">
                    <ChatMarkdown content={(part as TextPart).text} />
                </div>
            )
        } else if (part.type.startsWith("tool-")) {
            const toolPart = part as ToolPart
            const toolCallId = toolPart.toolCallId || `${toolPart.type}-${index}`
            const toolName = toolPart.type.replace("tool-", "")

            currentToolGroup.push({
                toolName,
                toolCallId,
                state: toolPart.state,
                input: toolPart.input,
                output: toolPart.output as Record<string, unknown> | string,
                errorText: toolPart.errorText,
            })
        }
    })

    // Flush any remaining tool calls
    flushToolGroup()

    return <>{elements}</>
}
