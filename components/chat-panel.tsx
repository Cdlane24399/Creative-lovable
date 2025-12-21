"use client"

import type React from "react"
import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import {
  MessageSquare,
  AudioLines,
  ArrowUp,
  X,
  Loader2,
  ChevronDown,
  Wand2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useChatWithTools } from "@/hooks/use-chat-with-tools"
import { cn } from "@/lib/utils"
import { MODEL_DISPLAY_NAMES, type ModelProvider } from "@/lib/ai/agent"
import { ChatMarkdown, ToolCallsGroup, StreamingStatus, ChatError, ChatEmptyState } from "@/components/chat"
import { motion, AnimatePresence } from "framer-motion"

// Exported handle type for programmatic control
export interface ChatPanelHandle {
  sendMessage: (text: string) => void
}

const AnthropicIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>Claude</title>
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fillRule="nonzero"></path>
  </svg>
)

const OpenAIIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>OpenAI</title>
    <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"></path>
  </svg>
)

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg role="img" viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <title>Gemini</title>
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-fill-0)"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#lobe-icons-gemini-fill-2)"></path>
    <defs>
      <linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-fill-0" x1="7" x2="11" y1="15.5" y2="12"><stop stopColor="#08B962"></stop><stop offset="1" stopColor="#08B962" stopOpacity="0"></stop></linearGradient>
      <linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-fill-1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stopColor="#F94543"></stop><stop offset="1" stopColor="#F94543" stopOpacity="0"></stop></linearGradient>
      <linearGradient gradientUnits="userSpaceOnUse" id="lobe-icons-gemini-fill-2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stopColor="#FABC12"></stop><stop offset=".46" stopColor="#FABC12" stopOpacity="0"></stop></linearGradient>
    </defs>
  </svg>
)

// Type definitions for message parts
interface TextPart {
  type: "text"
  text: string
}

// AI SDK v5 tool states
type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error"

interface ToolPart {
  type: string
  state?: ToolState
  input?: Record<string, unknown>
  output?: Record<string, unknown> | string
  errorText?: string
  toolCallId?: string
  [key: string]: unknown
}

type MessagePart = TextPart | ToolPart

interface ChatPanelProps {
  projectId?: string
  onPreviewUpdate?: (content: string) => void
  onSandboxUrlUpdate?: (url: string | null) => void
  /** Called when AI reports files are ready (triggers dev server start) */
  onFilesReady?: (projectName: string) => void
  initialPrompt?: string | null
  initialModel?: ModelProvider
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  { projectId, onPreviewUpdate, onSandboxUrlUpdate, onFilesReady, initialPrompt, initialModel },
  ref
) {
  const [inputValue, setInputValue] = useState("")
  const [isChatEnabled, setIsChatEnabled] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ModelProvider>(initialModel || "anthropic")
  const [lastError, setLastError] = useState<Error | null>(null)
  const [isImproving, setIsImproving] = useState(false)
  const [showImproveEffect, setShowImproveEffect] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasAutoSentRef = useRef(false)

  const { messages, sendMessage, isWorking, status, isCallingTools, getToolProgress } = useChatWithTools({
    projectId,
    model: selectedModel,
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Clear error when user sends a new message
  useEffect(() => {
    if (isWorking) {
      setLastError(null)
    }
  }, [isWorking])

  // Auto-send initial prompt from landing page
  // Using a ref instead of state to prevent race conditions with effect re-runs
  useEffect(() => {
    if (initialPrompt && !hasAutoSentRef.current && messages.length === 0) {
      hasAutoSentRef.current = true
      sendMessage({ text: initialPrompt })
    }
  }, [initialPrompt, messages.length, sendMessage])

  // Track which tool outputs we've already processed
  const processedToolOutputsRef = useRef<Set<string>>(new Set())

  // Extract previewUrl from createWebsite tool results
  // Simplified approach: just look for previewUrl in any tool output
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue

      for (const part of message.parts as MessagePart[]) {
        const partType = part.type
        
        // Only process tool parts
        if (!partType.startsWith("tool-")) continue
        
        const anyPart = part as any
        const toolCallId = anyPart.toolCallId || `${message.id}-${partType}`
        
        // Skip if already processed
        if (processedToolOutputsRef.current.has(toolCallId)) continue
        
        // Get output from various possible locations (AI SDK v5 uses 'output')
        const outputData = anyPart.output || anyPart.result
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
        
        // Also notify about project name for display
        const projName = output.projectName as string | undefined
        if (projName) {
          onFilesReady?.(projName)
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

  // Get current tool being executed for status display
  const getCurrentTool = (): string | undefined => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role !== "assistant") return undefined
    
    const parts = lastMessage.parts as MessagePart[]
    const activeTool = parts.find(
      (p) => p.type.startsWith("tool-") && 
      ((p as ToolPart).state === "input-streaming" || (p as ToolPart).state === "input-available")
    )
    
    return activeTool ? activeTool.type.replace("tool-", "") : undefined
  }

  const handleRetry = () => {
    setLastError(null)
    // Re-send the last user message if there was one
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
    if (lastUserMessage) {
      const textPart = (lastUserMessage.parts as MessagePart[]).find((p) => p.type === "text") as TextPart
      if (textPart) {
        sendMessage({ text: textPart.text })
      }
    }
  }

  // Typewriter effect for improved prompt
  const typewriterEffect = async (text: string) => {
    setShowImproveEffect(true)
    setInputValue("")
    
    // Wait a moment before starting to type
    await new Promise(r => setTimeout(r, 200))
    
    // Type out the text character by character
    for (let i = 0; i <= text.length; i++) {
      setInputValue(text.slice(0, i))
      // Vary the typing speed for natural feel
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
      
      // Animate the text replacement
      await typewriterEffect(improvedPrompt)
      
      // Focus the textarea after improvement
      textareaRef.current?.focus()
    } catch (error) {
      console.error("Failed to improve prompt:", error)
    } finally {
      setIsImproving(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#111111]">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="flex flex-col gap-4">
          {messages.length === 0 && !isWorking ? (
            <ChatEmptyState />
          ) : (
            // Deduplicate messages by ID to prevent duplicate key errors
            [...new Map(messages.map((m) => [m.id, m])).values()].map((message) => (
              <div key={message.id} className="flex flex-col gap-1">
                {message.role === "user" ? (
                  <div className="max-w-[85%] self-end">
                    <div className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100">
                      {(message.parts as MessagePart[]).map((part, i) => (part.type === "text" ? <span key={i}>{(part as TextPart).text}</span> : null))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(() => {
                      // Group consecutive tool calls together
                      const parts = (message.parts as MessagePart[]).filter((part, index, arr) => {
                        // Filter out duplicate consecutive text parts
                        if (part.type === "text" && index > 0) {
                          const prevPart = arr[index - 1]
                          if (prevPart.type === "text" && (prevPart as TextPart).text === (part as TextPart).text) {
                            return false
                          }
                        }
                        return true
                      })

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
                              getToolProgress={getToolProgress}
                            />
                          )
                          currentToolGroup = []
                        }
                      }

                      parts.forEach((part, index) => {
                        if (part.type === "text") {
                          flushToolGroup()
                          elements.push(
                            <div key={`text-${index}`} className="text-sm text-zinc-300">
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

                      return elements
                    })()}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Streaming status indicator */}
          {isWorking && (
            <StreamingStatus 
              status={status as "submitted" | "streaming" | "ready" | "error"} 
              isCallingTools={isCallingTools}
              currentTool={getCurrentTool()}
            />
          )}

          {/* Error display */}
          {lastError && !isWorking && (
            <ChatError error={lastError} onRetry={handleRetry} />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit}>
          <div className={cn(
            "rounded-2xl bg-zinc-900/70 border p-3 shadow-xl backdrop-blur-xl transition-all",
            showImproveEffect 
              ? "border-violet-500/50 ring-2 ring-violet-500/20" 
              : "border-white/5"
          )}>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (!isChatEnabled) return
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                placeholder="Ask Lovable..."
                className={cn(
                  "min-h-[60px] w-full resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-400 focus:outline-none transition-colors",
                  showImproveEffect && "text-violet-300"
                )}
                rows={2}
                disabled={isWorking || !isChatEnabled || isImproving}
              />

              {/* Sparkle effect overlay during improvement */}
              <AnimatePresence>
                {showImproveEffect && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 pointer-events-none"
                  >
                    {[...Array(4)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ 
                          opacity: 0, 
                          scale: 0,
                        }}
                        animate={{ 
                          opacity: [0, 1, 0],
                          scale: [0, 1, 0],
                        }}
                        transition={{
                          duration: 1.5,
                          delay: i * 0.2,
                          repeat: Infinity,
                          repeatDelay: 0.5,
                        }}
                        className="absolute w-1 h-1 bg-violet-400 rounded-full"
                        style={{ 
                          left: `${20 + Math.random() * 60}%`,
                          top: `${20 + Math.random() * 60}%`,
                          boxShadow: "0 0 8px 2px rgba(167, 139, 250, 0.6)"
                        }}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg px-2.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                      disabled={isWorking || !isChatEnabled}
                    >
                      {(selectedModel === "anthropic" || selectedModel === "sonnet") && <AnthropicIcon className="h-3.5 w-3.5" />}
                      {selectedModel === "google" && <GoogleIcon className="h-3.5 w-3.5" />}
                      {selectedModel === "openai" && <OpenAIIcon className="h-3.5 w-3.5" />}
                      <span className="text-xs">{MODEL_DISPLAY_NAMES[selectedModel]}</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-800">
                    <DropdownMenuItem
                      onClick={() => setSelectedModel("anthropic")}
                      className={cn(
                        "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer",
                        selectedModel === "anthropic" && "bg-zinc-800",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <AnthropicIcon className="h-4 w-4" />
                        <span>{MODEL_DISPLAY_NAMES.anthropic}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSelectedModel("sonnet")}
                      className={cn(
                        "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer",
                        selectedModel === "sonnet" && "bg-zinc-800",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <AnthropicIcon className="h-4 w-4" />
                        <span>{MODEL_DISPLAY_NAMES.sonnet}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSelectedModel("google")}
                      className={cn(
                        "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer",
                        selectedModel === "google" && "bg-zinc-800",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <GoogleIcon className="h-4 w-4" />
                        <span>{MODEL_DISPLAY_NAMES.google}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSelectedModel("openai")}
                      className={cn(
                        "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer",
                        selectedModel === "openai" && "bg-zinc-800",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <OpenAIIcon className="h-4 w-4" />
                        <span>{MODEL_DISPLAY_NAMES.openai}</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Improve Prompt Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleImprovePrompt}
                  disabled={!inputValue.trim() || isImproving || isWorking}
                  className={cn(
                    "h-8 gap-1.5 rounded-lg px-2.5 transition-all",
                    inputValue.trim() && !isImproving && !isWorking
                      ? "text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
                      : "text-zinc-600 cursor-not-allowed"
                  )}
                >
                  {isImproving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs">Improve</span>
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                  disabled={isWorking || !isChatEnabled}
                >
                  <AudioLines className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isWorking || !isChatEnabled || !inputValue.trim() || isImproving}
                  className={cn(
                    "h-8 w-8 rounded-lg p-0 transition-all",
                    inputValue.trim() && !isImproving
                      ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/25"
                      : "bg-zinc-800 text-zinc-500",
                  )}
                >
                  {isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
})
