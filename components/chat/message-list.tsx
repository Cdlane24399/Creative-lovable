"use client"

import React, { useEffect, useRef } from "react"
import { Message } from "./message"
import type { UIMessage } from "ai"
import { ChatEmptyState } from "./chat-error"
import { ChatError } from "./chat-error"
import { SuggestionChips, defaultSuggestions } from "./suggestion-chips"

/**
 * Extracts AI-generated suggestions from the last assistant message.
 * Looks for generateSuggestions tool result in message parts.
 */
function extractSuggestionsFromMessage(message: UIMessage): string[] | null {
    if (message.role !== "assistant" || !message.parts) {
        return null
    }

    for (const part of message.parts) {
        // Tool parts have type like "tool-generateSuggestions" and state/output fields
        const toolPart = part as { type: string; state?: string; output?: unknown }

        if (
            toolPart.type === "tool-generateSuggestions" &&
            toolPart.state === "output-available"
        ) {
            const output = toolPart.output as { suggestions?: string[] } | undefined
            if (output?.suggestions && Array.isArray(output.suggestions)) {
                return output.suggestions
            }
        }
    }

    return null
}

interface MessageListProps {
    messages: UIMessage[]
    isWorking: boolean
    isCallingTools: boolean
    error: Error | null
    onRetry: () => void
    getThinkingTime?: (messageId: string) => number | undefined
    onSelectSuggestion?: (suggestion: string) => void
}

export const MessageList = React.memo(function MessageList({
    messages,
    isWorking,
    isCallingTools,
    error,
    onRetry,
    getThinkingTime,
    onSelectSuggestion
}: MessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Auto-scroll to bottom when new messages appear
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    if (messages.length === 0 && !isWorking) {
        return <ChatEmptyState />
    }

    // Deduplicate messages by ID
    const uniqueMessages = [...new Map(messages.map((m) => [m.id, m])).values()]

    // Check if the last message is from the assistant (for showing suggestion chips)
    const lastMessage = uniqueMessages[uniqueMessages.length - 1]
    const showSuggestionChips =
        !isWorking &&
        !error &&
        lastMessage?.role === "assistant" &&
        onSelectSuggestion

    return (
        <div className="flex flex-col gap-6 pb-4">
            {uniqueMessages.map((message) => (
                <Message
                    key={message.id}
                    role={message.role}
                    parts={message.parts as any[]}
                    thinkingTime={getThinkingTime?.(message.id)}
                />
            ))}

            {/* Suggestion Chips - shown after last assistant message when not working */}
            {showSuggestionChips && (
                <SuggestionChips
                    suggestions={extractSuggestionsFromMessage(lastMessage) ?? defaultSuggestions}
                    onSelect={onSelectSuggestion}
                />
            )}

            {/* Typing Indicator */}
            {isWorking && !isCallingTools && (
                <div className="flex items-center gap-2 px-1 py-2 text-sm text-zinc-500">
                    <div className="flex gap-1.5">
                        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500/50 [animation-delay:-0.3s]" />
                        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500/50 [animation-delay:-0.15s]" />
                        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500/50" />
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && !isWorking && (
                <ChatError error={error} onRetry={onRetry} />
            )}

            <div ref={messagesEndRef} className="h-px w-full" />
        </div>
    )
}, (prevProps, nextProps) => {
    return (
        prevProps.messages === nextProps.messages &&
        prevProps.isWorking === nextProps.isWorking &&
        prevProps.isCallingTools === nextProps.isCallingTools &&
        prevProps.error === nextProps.error
    )
})
