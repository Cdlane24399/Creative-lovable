"use client"

import type React from "react"
import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import { useChatWithTools } from "@/hooks/use-chat-with-tools"
import { type ModelProvider } from "@/lib/ai/agent"
import { MessageList } from "@/components/chat/message-list"
import { PromptInput } from "@/components/chat/prompt-input"
import type { MessagePart } from "@/components/chat/message" // Import shared type
import type { Message } from "@/lib/db/types"

// Exported handle type for programmatic control
export interface ChatPanelHandle {
  sendMessage: (text: string) => void
}

interface ChatPanelProps {
  projectId?: string
  onPreviewUpdate?: (content: string) => void
  onSandboxUrlUpdate?: (url: string | null) => void
  /** Called when AI reports files are ready (triggers dev server start) */
  onFilesReady?: (projectName: string, sandboxId?: string) => void
  initialPrompt?: string | null
  initialModel?: ModelProvider
  /** Messages loaded from database for chat history restoration */
  savedMessages?: Message[]
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  { projectId, onPreviewUpdate, onSandboxUrlUpdate, onFilesReady, initialPrompt, initialModel, savedMessages },
  ref
) {
  const [inputValue, setInputValue] = useState("")
  const [isChatEnabled, setIsChatEnabled] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ModelProvider>(initialModel || "anthropic")
  const [lastError, setLastError] = useState<Error | null>(null)
  const [isImproving, setIsImproving] = useState(false)
  const [showImproveEffect, setShowImproveEffect] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasAutoSentRef = useRef(false)

  const { messages, sendMessage, isWorking, isCallingTools, getThinkingTime } = useChatWithTools({
    projectId,
    model: selectedModel,
    initialMessages: savedMessages,
    onError: (error) => {
      console.error("Chat error:", error)
      setLastError(error)
    },
  })

  // Expose sendMessage via ref for programmatic control (e.g., auto-fix)
  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => {
      sendMessage({ text })
    },
  }), [sendMessage])

  // Clear error when user sends a new message
  useEffect(() => {
    if (isWorking) {
      setLastError(null)
    }
  }, [isWorking])

  // Auto-send initial prompt from landing page
  useEffect(() => {
    if (initialPrompt && !hasAutoSentRef.current && messages.length === 0) {
      hasAutoSentRef.current = true
      sendMessage({ text: initialPrompt })
    }
  }, [initialPrompt, messages.length, sendMessage])

  // Track which tool outputs we've already processed
  const processedToolOutputsRef = useRef<Set<string>>(new Set())

  // Extract previewUrl from createWebsite tool results
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue

      for (const part of message.parts as MessagePart[]) {
        const partType = part.type

        // Only process tool parts
        if (!partType.startsWith("tool-")) continue

        const anyPart = part as any
        const toolCallId = anyPart.toolCallId || `${message.id}-${partType}`
        const state = anyPart.state

        // Skip if already processed
        if (processedToolOutputsRef.current.has(toolCallId)) continue

        // AI SDK v6: Only process tools that have completed with output-available state
        if (state !== "output-available") continue

        // Get output
        const outputData = anyPart.output
        if (!outputData) continue

        // Parse output if it's a string
        let output: Record<string, unknown> = {}
        if (typeof outputData === "string") {
          try {
            output = JSON.parse(outputData) as Record<string, unknown>
          } catch {
            continue
          }
        } else if (typeof outputData === "object" && outputData !== null) {
          output = outputData as Record<string, unknown>
        }

        // Only process successful outputs
        if (output.success !== true) continue

        // Mark as processed
        processedToolOutputsRef.current.add(toolCallId)

        // Extract and emit previewUrl
        const previewUrl = output.previewUrl ?? output.url
        if (typeof previewUrl === "string" && previewUrl.length > 0) {
          console.log("[ChatPanel] Got previewUrl from tool:", previewUrl)
          onSandboxUrlUpdate?.(previewUrl)
        }

        // Notify about files ready
        const projName = output.projectName as string | undefined
        const sandboxId = output.sandboxId as string | undefined
        const filesReady = output.filesReady === true
        if (projName && filesReady) {
          console.log("[ChatPanel] Files ready, project:", projName, "sandboxId:", sandboxId)
          onFilesReady?.(projName, sandboxId)
        }
      }
    }
  }, [messages, onSandboxUrlUpdate, onFilesReady])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isChatEnabled) return
    if (!inputValue.trim()) return

    const content = inputValue.trim()
    setInputValue("")

    await sendMessage({ text: content })
  }

  const handleRetry = () => {
    setLastError(null)
    // Re-send the last user message if there was one
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMessage) {
      const textPart = (lastUserMessage.parts as MessagePart[]).find((p) => p.type === "text")
      if (textPart && textPart.type === "text") {
        sendMessage({ text: (textPart as { type: "text"; text: string }).text })
      }
    }
  }

  const typewriterEffect = async (text: string) => {
    setShowImproveEffect(true)
    setInputValue("")

    await new Promise(r => setTimeout(r, 200))

    for (let i = 0; i <= text.length; i++) {
      setInputValue(text.slice(0, i))
      const delay = Math.random() * 20 + 10
      await new Promise(r => setTimeout(r, delay))
    }

    setShowImproveEffect(false)
  }

  const handleImprovePrompt = async () => {
    if (!inputValue.trim() || isImproving || isWorking) return

    setIsImproving(true)

    try {
      const response = await fetch("/api/improve-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: inputValue }),
      })

      if (!response.ok) throw new Error("Failed to improve prompt")

      const { improvedPrompt } = await response.json()

      await typewriterEffect(improvedPrompt)
      textareaRef.current?.focus()
    } catch (error) {
      console.error("Failed to improve prompt:", error)
    } finally {
      setIsImproving(false)
    }
  }

  const handleSelectSuggestion = (suggestion: string) => {
    if (isWorking) return
    // Send the suggestion immediately
    sendMessage({ text: suggestion })
  }

  return (
    <div className="flex h-full flex-col bg-[#111111]">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        <div className="mx-auto w-full max-w-3xl">
          <MessageList
            messages={messages}
            isWorking={isWorking}
            isCallingTools={isCallingTools}
            error={lastError}
            onRetry={handleRetry}
            getThinkingTime={getThinkingTime}
            onSelectSuggestion={handleSelectSuggestion}
          />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 pt-2">
        <PromptInput
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSubmit={handleSubmit}
          isWorking={isWorking}
          isChatEnabled={isChatEnabled}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onImprovePrompt={handleImprovePrompt}
          isImproving={isImproving}
          showImproveEffect={showImproveEffect}
          inputRef={textareaRef}
        />
      </div>
    </div>
  )
})
