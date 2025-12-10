"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { ModelProvider } from "@/lib/ai/agent"

interface UseChatWithToolsOptions {
  projectId?: string
  model?: ModelProvider
  onError?: (error: Error) => void
}

export function useChatWithTools({ projectId, model = "anthropic", onError }: UseChatWithToolsOptions = {}) {
  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { projectId, model },
    }),
    onError: (error) => {
      console.error("[v0] Chat hook error:", error)
      onError?.(error)
    },
  })

  return {
    ...chat,
    isWorking: chat.status === "streaming" || chat.status === "submitted",
    lastMessage: chat.messages[chat.messages.length - 1],
  }
}
