"use client"

import type React from "react"
import { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from "react"
import { useChatWithTools } from "@/hooks/use-chat-with-tools"
import { type ModelProvider } from "@/lib/ai/agent"
import { MessageList } from "@/components/chat/message-list"
import { PromptInput } from "@/components/chat/prompt-input"
import type { MessagePart } from "@/components/chat/message" // Import shared type
import type { Message } from "@/lib/db/types"
import { parseToolOutputs } from "@/lib/parsers/tool-outputs"

const VALID_MODEL_KEYS = new Set<ModelProvider>([
  "anthropic",
  "opus",
  "google",
  "googlePro",
  "openai",
  "minimax",
  "moonshot",
  "glm",
])

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
  { projectId, onPreviewUpdate: _onPreviewUpdate, onSandboxUrlUpdate, onFilesReady, initialPrompt, initialModel, savedMessages },
  ref
) {
  const [inputValue, setInputValue] = useState("")
  const [isChatEnabled, _setIsChatEnabled] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ModelProvider>(initialModel || "anthropic")
  const [lastError, setLastError] = useState<Error | null>(null)
  const [isImproving, setIsImproving] = useState(false)
  const [showImproveEffect, setShowImproveEffect] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasAutoSentRef = useRef(false)

  // Load saved model preference from localStorage
  useEffect(() => {
    if (!projectId) return

    const savedModel = localStorage.getItem(`project-model-${projectId}`)
    if (!savedModel || !VALID_MODEL_KEYS.has(savedModel as ModelProvider)) return

    setSelectedModel((prev) => {
      const nextModel = savedModel as ModelProvider
      return prev === nextModel ? prev : nextModel
    })
  }, [projectId])

  const handleChatError = useCallback((error: Error) => {
    console.error("Chat error:", error)
    setLastError(error)
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isChatEnabled) return
    if (!inputValue.trim()) return

    const content = inputValue.trim()
    setInputValue("")

    await sendMessage({ text: content })
  }, [inputValue, isChatEnabled, sendMessage])

  const handleRetry = useCallback(() => {
    setLastError(null)
    // Re-send the last user message if there was one
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMessage) {
      const textPart = (lastUserMessage.parts as MessagePart[]).find((p) => p.type === "text")
      if (textPart && textPart.type === "text") {
        sendMessage({ text: (textPart as { type: "text"; text: string }).text })
      }
    }
  }, [messages, sendMessage])

  const typewriterEffect = useCallback(async (text: string) => {
    setShowImproveEffect(true)
    setInputValue("")

    await new Promise((r) => setTimeout(r, 200))

    for (let i = 0; i <= text.length; i++) {
      setInputValue(text.slice(0, i))
      const delay = Math.random() * 20 + 10
      await new Promise((r) => setTimeout(r, delay))
    }

    setShowImproveEffect(false)
  }, [])

  const handleImprovePrompt = useCallback(async () => {
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
  }, [inputValue, isImproving, isWorking, typewriterEffect])

  const handleSelectSuggestion = useCallback((suggestion: string) => {
    if (isWorking) return
    // Send the suggestion immediately
    sendMessage({ text: suggestion })
  }, [isWorking, sendMessage])

  // Save model preference when it changes
  useEffect(() => {
    if (projectId && selectedModel) {
      localStorage.setItem(`project-model-${projectId}`, selectedModel)
    }
  }, [projectId, selectedModel])

  const { messages, sendMessage, isWorking, isCallingTools, getThinkingTime, stop } = useChatWithTools({
    projectId,
    model: selectedModel,
    initialMessages: savedMessages,
    onError: handleChatError,
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

  // Extract tool outputs using dedicated parser
  useEffect(() => {
    const { latestPreviewUrl, filesReadyInfo } = parseToolOutputs(
      messages,
      processedToolOutputsRef.current
    )

    if (latestPreviewUrl) {
      console.log("[ChatPanel] Got previewUrl from tool:", latestPreviewUrl)
      onSandboxUrlUpdate?.(latestPreviewUrl)
    }

    if (filesReadyInfo) {
      console.log("[ChatPanel] Files ready, project:", filesReadyInfo.projectName, "sandboxId:", filesReadyInfo.sandboxId)
      onFilesReady?.(filesReadyInfo.projectName, filesReadyInfo.sandboxId)
    }
  }, [messages, onSandboxUrlUpdate, onFilesReady])

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
          onStop={stop}
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
