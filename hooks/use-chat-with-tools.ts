"use client"

import { useMemo, useCallback, useEffect, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { ChatMessage } from "@/app/api/chat/route"
import type { Message } from "@/lib/db/types"

// Progress state for a single tool call (for future use with data streaming)
export interface ToolProgress {
  toolCallId: string
  toolName: string
  phase: string
  message: string
  detail?: string
  progress?: number
  timestamp: number
  filesWritten: string[]
}

interface UseChatWithToolsOptions {
  projectId?: string
  model?: "anthropic" | "opus" | "google" | "googlePro" | "openai"
  onError?: (error: Error) => void
  /** Initial messages to restore from database */
  initialMessages?: Message[]
}

/**
 * Convert database messages to AI SDK message format.
 * Handles the parts field which may contain tool calls.
 */
function convertDbMessagesToAiMessages(dbMessages: Message[]): ChatMessage[] {
  return dbMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    parts: msg.parts || [{ type: "text", text: msg.content }],
    createdAt: new Date(msg.created_at),
  })) as ChatMessage[]
}

/**
 * Enhanced chat hook with context-aware tool support.
 *
 * In AI SDK v6, tools with execute functions run server-side and results
 * are streamed back automatically. This hook provides:
 * - Multi-model support (Anthropic, Google, OpenAI)
 * - Project context tracking via projectId
 * - Convenient status helpers for UI state management
 * - Initial message restoration from database
 */
export function useChatWithTools({ projectId, model = "anthropic", onError, initialMessages }: UseChatWithToolsOptions = {}) {
  // Track if we've initialized with messages
  const hasInitializedRef = useRef(false)
  
  // Convert initial messages to AI SDK format
  const convertedInitialMessages = useMemo(() => {
    if (!initialMessages || initialMessages.length === 0) return undefined
    return convertDbMessagesToAiMessages(initialMessages)
  }, [initialMessages])
  
  // Recreate transport when model or projectId changes to ensure correct model is used
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { projectId, model },
      }),
    [projectId, model]
  )

  const chat = useChat<ChatMessage>({
    transport,
    messages: convertedInitialMessages,
    onError: (error) => {
      console.error("Chat error:", error)
      onError?.(error)
    },
  })

  // Helper to get progress for a specific tool call (placeholder for future data streaming)
  const getToolProgress = useCallback((_toolCallId: string): ToolProgress | undefined => {
    // In a future version with data streaming, this would return real-time progress
    return undefined
  }, [])

  // Extract useful state from messages
  const lastMessage = chat.messages[chat.messages.length - 1]
  const isAssistantMessage = lastMessage?.role === "assistant"

  // Check if the last message has active tool calls (for showing progress)
  const hasActiveToolCalls = isAssistantMessage && lastMessage?.parts?.some(
    (part: { type: string; state?: string }) =>
      part.type.startsWith("tool-") &&
      (part.state === "input-streaming" || part.state === "input-available")
  )

  return {
    ...chat,
    // Helper to check if AI is currently working
    // Status can be 'submitted', 'streaming', 'ready', or 'error'
    isWorking: chat.status === "submitted" || chat.status === "streaming",
    // More granular: is the model actively calling tools?
    isCallingTools: hasActiveToolCalls,
    // Helper to get the last message
    lastMessage,
    // Helper to get only assistant messages (for tool result extraction)
    assistantMessages: chat.messages.filter(m => m.role === "assistant"),
    // Placeholder for future real-time progress
    getToolProgress,
    // Flag to check if chat was restored from history
    hasRestoredHistory: convertedInitialMessages !== undefined && convertedInitialMessages.length > 0,
  }
}
