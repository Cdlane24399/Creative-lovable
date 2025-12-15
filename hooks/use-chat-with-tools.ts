"use client"

import { useChat } from "ai/react"
import type { ModelProvider } from "@/lib/ai/agent"

interface UseChatWithToolsOptions {
  projectId?: string
  model?: ModelProvider
  onError?: (error: Error) => void
}

export function useChatWithTools({ projectId, model = "anthropic", onError }: UseChatWithToolsOptions = {}) {
  const chat = useChat({
    api: "/api/chat",
    body: { projectId, model },
    onError: (error) => {
      console.error("[v0] Chat hook error:", error)
      onError?.(error)
    },
  })

  return {
    ...chat,
    isWorking: chat.isLoading,
    // Helper to get the last message
    lastMessage: chat.messages[chat.messages.length - 1],
    sendMessage: chat.append,
  }
}
