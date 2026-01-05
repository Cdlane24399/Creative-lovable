"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import type { ModelProvider } from "@/lib/ai/agent"
import { useCallback, useMemo } from "react"

interface UseChatWithToolsOptions {
  projectId?: string
  model?: ModelProvider
  currentHtml?: string
  onError?: (error: Error) => void
  onToolStart?: (toolName: string) => void
  onToolComplete?: (toolName: string, result: unknown) => void
  initialMessages?: any[]
}

// Tool result types for type-safe access
export interface GenerateWebsiteResult {
  state: "complete"
  title: string
  description: string
  html: string
  designRationale?: string
  success: boolean
}

export interface EditWebsiteResult {
  state: "complete"
  title: string
  editSummary: string
  changesApplied: string[]
  html: string
  success: boolean
}

export interface AddComponentResult {
  state: "complete"
  componentName: string
  componentType: string
  placement: string
  description: string
  html: string
  success: boolean
}

export interface AnalyzeDesignResult {
  state: "complete"
  overallScore: number
  strengths: string[]
  improvements: Array<{
    area: string
    suggestion: string
    priority: "high" | "medium" | "low"
  }>
  accessibilityNotes: string[]
  performanceNotes: string[]
  success: boolean
}

export interface ThinkStepResult {
  state: "complete"
  thought: string
  interpretation: string
  plannedApproach: string
  toolsToUse: string[]
  success: boolean
}

export type ToolResult =
  | GenerateWebsiteResult
  | EditWebsiteResult
  | AddComponentResult
  | AnalyzeDesignResult
  | ThinkStepResult

// Type guard helpers
export function isGenerateWebsiteResult(result: unknown): result is GenerateWebsiteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "state" in result &&
    result.state === "complete" &&
    "html" in result &&
    "title" in result
  )
}

export function isEditWebsiteResult(result: unknown): result is EditWebsiteResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "state" in result &&
    result.state === "complete" &&
    "editSummary" in result &&
    "changesApplied" in result
  )
}

export function isAddComponentResult(result: unknown): result is AddComponentResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "state" in result &&
    result.state === "complete" &&
    "componentName" in result &&
    "componentType" in result
  )
}

export function isAnalyzeDesignResult(result: unknown): result is AnalyzeDesignResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "state" in result &&
    result.state === "complete" &&
    "overallScore" in result &&
    "improvements" in result
  )
}

export function isThinkStepResult(result: unknown): result is ThinkStepResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "state" in result &&
    result.state === "complete" &&
    "thought" in result &&
    "plannedApproach" in result
  )
}

// Get HTML from any tool result that produces it
export function getHtmlFromToolResult(result: unknown): string | null {
  if (isGenerateWebsiteResult(result) || isEditWebsiteResult(result) || isAddComponentResult(result)) {
    return result.html
  }
  return null
}

export function useChatWithTools({
  projectId,
  model = "anthropic",
  currentHtml,
  onError,
  onToolStart,
  onToolComplete,
  initialMessages,
}: UseChatWithToolsOptions = {}) {
  // Build transport body with context
  const transportBody = useMemo(
    () => ({
      projectId,
      model,
      context: currentHtml ? { currentHtml } : undefined,
    }),
    [projectId, model, currentHtml]
  )

  const chat = useChat({
    initialMessages: initialMessages || [],
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: transportBody,
    }),
    onError: (error) => {
      console.error("[Agent] Chat hook error:", error)
      onError?.(error)
    },
  })

  // Extract the latest HTML from any tool that produces it
  const latestHtml = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const message = chat.messages[i]
      if (message.role === "assistant" && message.parts) {
        for (const part of message.parts as unknown[]) {
          const typedPart = part as { type?: string; output?: unknown }
          if (
            typedPart.type?.startsWith("tool-") &&
            typedPart.output
          ) {
            const html = getHtmlFromToolResult(typedPart.output)
            if (html) return html
          }
        }
      }
    }
    return null
  }, [chat.messages])

  // Get all tool calls from the conversation
  const toolCalls = useMemo(() => {
    const calls: Array<{
      toolName: string
      state: string
      output?: unknown
      timestamp: number
    }> = []

    for (const message of chat.messages) {
      if (message.role === "assistant" && message.parts) {
        for (const part of message.parts as unknown[]) {
          const typedPart = part as { type?: string; state?: string; output?: unknown }
          if (typedPart.type?.startsWith("tool-")) {
            calls.push({
              toolName: typedPart.type.replace("tool-", ""),
              state: typedPart.state || "unknown",
              output: typedPart.output,
              timestamp: Date.now(),
            })
          }
        }
      }
    }

    return calls
  }, [chat.messages])

  // Get the latest analysis result if any
  const latestAnalysis = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const message = chat.messages[i]
      if (message.role === "assistant" && message.parts) {
        for (const part of message.parts as unknown[]) {
          const typedPart = part as { type?: string; output?: unknown }
          if (
            typedPart.type === "tool-analyzeDesign" &&
            isAnalyzeDesignResult(typedPart.output)
          ) {
            return typedPart.output
          }
        }
      }
    }
    return null
  }, [chat.messages])

  // Enhanced send message with context
  const sendMessageWithContext = useCallback(
    async (options: { text: string; images?: File[] }) => {
      return chat.sendMessage(options)
    },
    [chat]
  )

  return {
    ...chat,
    // Enhanced helpers
    sendMessage: sendMessageWithContext,
    setMessages: chat.setMessages,

    // Status helpers
    isWorking: chat.status === "streaming" || chat.status === "submitted" || chat.status === "in_progress",
    isStreaming: chat.status === "streaming",
    isSubmitted: chat.status === "submitted",

    // Message helpers
    lastMessage: chat.messages[chat.messages.length - 1],
    messageCount: chat.messages.length,

    // Tool result helpers
    latestHtml,
    latestAnalysis,
    toolCalls,

    // Utility to check if any tool is currently running
    hasActiveToolCall: chat.messages.some((msg) => {
      if (msg.role !== "assistant" || !msg.parts) return false
      return (msg.parts as unknown[]).some((part) => {
        const typedPart = part as { type?: string; state?: string }
        return (
          typedPart.type?.startsWith("tool-") &&
          (typedPart.state === "call" || typedPart.state === "partial-call")
        )
      })
    }),
  }
}
