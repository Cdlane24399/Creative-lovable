"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { ChatMessage } from "@/app/api/chat/route"

interface UseChatWithToolsOptions {
  projectId?: string
  model?: "anthropic" | "google" | "openai"
  onError?: (error: Error) => void
}

export function useChatWithTools({ projectId, model = "anthropic", onError }: UseChatWithToolsOptions = {}) {
  const chat = useChat<ChatMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { projectId, model },
    }),
    onError: (error) => {
      console.error("Chat error:", error)
      onError?.(error)
    },
  })

  return {
    ...chat,
    // Helper to check if AI is currently working
    // Status can be 'submitted', 'streaming', 'ready', or 'error'
    isWorking: chat.status === "submitted" || chat.status === "streaming",
    // Helper to get the last message
    lastMessage: chat.messages[chat.messages.length - 1],
  }
}
