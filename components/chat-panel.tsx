"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  Plus,
  ArrowUp,
  X,
  Loader2,
  Code,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Edit3,
  PlusSquare,
  BarChart3,
  Brain,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  useChatWithTools,
  getHtmlFromToolResult,
  isAnalyzeDesignResult,
  isThinkStepResult,
} from "@/hooks/use-chat-with-tools"
import { cn } from "@/lib/utils"
import { MODEL_DISPLAY_NAMES, type ModelProvider } from "@/lib/ai/agent"
import type { DbMessage, MessagePart } from "@/lib/types/database"

interface UploadedImage {
  id: string
  file: File
  preview: string
}

interface ChatPanelProps {
  projectId: string
  onPreviewUpdate?: (content: string) => void
  onWorkingStateChange?: (isWorking: boolean) => void
  initialPrompt?: string
  initialModel?: ModelProvider
  initialMessages?: DbMessage[] | null
}

// Convert DB messages to AI SDK UI format
function convertToUIMessages(dbMessages: DbMessage[]) {
  return dbMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant' | 'system',
    parts: msg.content.parts,
    content: '', // Required by UIMessage but we use parts
  }))
}

export function ChatPanel({ projectId, onPreviewUpdate, onWorkingStateChange, initialPrompt, initialModel, initialMessages }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("")
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelProvider>(initialModel || "anthropic")
  const [initialPromptSent, setInitialPromptSent] = useState(false)
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set())
  const [inputFocused, setInputFocused] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Convert initial messages to UI format
  const convertedInitialMessages = useMemo(() => {
    if (!initialMessages || initialMessages.length === 0) {
      return []
    }
    return convertToUIMessages(initialMessages)
  }, [initialMessages])

  // Mark all loaded messages as already saved
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setSavedMessageIds(new Set(initialMessages.map(m => m.id)))
    }
  }, [initialMessages])

  const { messages, sendMessage, isWorking } = useChatWithTools({
    projectId,
    model: selectedModel,
    initialMessages: convertedInitialMessages,
    onError: (error) => {
      console.error("Chat error:", error)
    },
  })

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Notify parent of working state changes
  useEffect(() => {
    onWorkingStateChange?.(isWorking)
  }, [isWorking, onWorkingStateChange])

  // Send initial prompt when component mounts (after messages are loaded)
  useEffect(() => {
    if (initialPrompt && !initialPromptSent && !isWorking) {
      setInitialPromptSent(true)
      handleSendMessage(initialPrompt)
    }
  }, [initialPrompt, initialPromptSent, isWorking])

  // Watch for any tool that produces HTML and update preview
  useEffect(() => {
    if (!onPreviewUpdate) return

    // Look through all messages for completed tool results with HTML
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message.role === "assistant" && message.parts) {
        for (const part of message.parts as any[]) {
          // Check any tool that might produce HTML
          if (part.type?.startsWith("tool-") && part.state === "result" && part.output) {
            const html = getHtmlFromToolResult(part.output)
            if (html) {
              onPreviewUpdate(html)
              return // Use the most recent HTML
            }
          }
        }
      }
    }
  }, [messages, onPreviewUpdate])

  // Save messages to database when they change
  useEffect(() => {
    if (!projectId) return

    const saveNewMessages = async () => {
      for (const message of messages) {
        // Skip if already saved
        if (savedMessageIds.has(message.id)) continue

        // Only save complete messages (not while streaming)
        if (message.role === 'assistant' && isWorking) continue

        try {
          await fetch(`/api/projects/${projectId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: message.role,
              content: { parts: message.parts }
            })
          })
          setSavedMessageIds(prev => new Set([...prev, message.id]))
        } catch (error) {
          console.error('Failed to save message:', error)
        }
      }
    }

    saveNewMessages()
  }, [messages, projectId, savedMessageIds, isWorking])

  const handleSendMessage = useCallback(async (text: string) => {
    await sendMessage({ text })
  }, [sendMessage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() && uploadedImages.length === 0) return

    const content = inputValue.trim()
    setInputValue("")

    uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview))
    setUploadedImages([])

    await handleSendMessage(content)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newImages: UploadedImage[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }))

    setUploadedImages((prev) => [...prev, ...newImages])

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeImage = (id: string) => {
    setUploadedImages((prev) => {
      const imageToRemove = prev.find((img) => img.id === id)
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview)
      }
      return prev.filter((img) => img.id !== id)
    })
  }

  // Get tool icon based on tool name
  const getToolIcon = (toolName: string, isRunning: boolean, isComplete: boolean, hasError: boolean) => {
    if (isRunning) return <Loader2 className="h-3.5 w-3.5 animate-spin" />
    if (hasError) return <AlertCircle className="h-3.5 w-3.5 text-red-400" />
    if (isComplete) {
      switch (toolName) {
        case "generateWebsite": return <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
        case "editWebsite": return <Edit3 className="h-3.5 w-3.5 text-blue-400" />
        case "addComponent": return <PlusSquare className="h-3.5 w-3.5 text-purple-400" />
        case "analyzeDesign": return <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
        case "thinkStep": return <Brain className="h-3.5 w-3.5 text-cyan-400" />
        default: return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
      }
    }
    return <Code className="h-3.5 w-3.5" />
  }

  // Get tool accent color based on tool name
  const getToolAccentColor = (toolName: string) => {
    switch (toolName) {
      case "generateWebsite": return "border-emerald-500/30 bg-emerald-500/5"
      case "editWebsite": return "border-blue-500/30 bg-blue-500/5"
      case "addComponent": return "border-purple-500/30 bg-purple-500/5"
      case "analyzeDesign": return "border-amber-500/30 bg-amber-500/5"
      case "thinkStep": return "border-cyan-500/30 bg-cyan-500/5"
      default: return "border-zinc-700/50 bg-zinc-800/50"
    }
  }

  const renderToolPart = (part: any, index: number) => {
    const toolName = part.type.replace("tool-", "")

    // Determine the state
    const isComplete = part.state === "result"
    const isRunning = part.state === "call" || part.state === "partial-call"
    const hasError = part.state === "error"

    return (
      <div key={index} className={cn("my-2 rounded-xl border p-3", getToolAccentColor(toolName))}>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {getToolIcon(toolName, isRunning, isComplete, hasError)}
          <span className="font-medium capitalize">{toolName.replace(/([A-Z])/g, " $1").trim()}</span>
          {isRunning && part.output?.message && (
            <span className="text-zinc-500 ml-2">{part.output.message}</span>
          )}
        </div>

        {isComplete && part.output && (
          <div className="mt-2 text-xs text-zinc-300">
            {/* generateWebsite result */}
            {toolName === "generateWebsite" && (
              <div className="space-y-1">
                <p className="font-medium text-emerald-400">{part.output.title}</p>
                <p>{part.output.description}</p>
                {part.output.designRationale && (
                  <p className="text-zinc-500 text-[10px]">{part.output.designRationale}</p>
                )}
                <p className="text-zinc-500 italic">Preview available in the right panel →</p>
              </div>
            )}

            {/* editWebsite result */}
            {toolName === "editWebsite" && (
              <div className="space-y-1">
                <p className="font-medium text-blue-400">{part.output.title}</p>
                <p>{part.output.editSummary}</p>
                {part.output.changesApplied?.length > 0 && (
                  <ul className="text-zinc-500 text-[10px] list-disc list-inside">
                    {part.output.changesApplied.map((change: string, i: number) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                )}
                <p className="text-zinc-500 italic">Updated preview available →</p>
              </div>
            )}

            {/* addComponent result */}
            {toolName === "addComponent" && (
              <div className="space-y-1">
                <p className="font-medium text-purple-400">{part.output.componentName}</p>
                <p>Added <span className="text-purple-300">{part.output.componentType}</span> at {part.output.placement}</p>
                <p className="text-zinc-500 italic">Component added to preview →</p>
              </div>
            )}

            {/* analyzeDesign result */}
            {toolName === "analyzeDesign" && isAnalyzeDesignResult(part.output) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-amber-400">Score:</span>
                  <div className="flex items-center gap-1">
                    {[...Array(10)].map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-3 w-3",
                          i < part.output.overallScore ? "text-amber-400 fill-amber-400" : "text-zinc-600"
                        )}
                      />
                    ))}
                    <span className="ml-1 text-amber-400">{part.output.overallScore}/10</span>
                  </div>
                </div>
                {part.output.strengths?.length > 0 && (
                  <div>
                    <p className="text-emerald-400 text-[10px] font-medium">Strengths:</p>
                    <ul className="text-zinc-400 text-[10px] list-disc list-inside">
                      {part.output.strengths.slice(0, 3).map((s: string, i: number) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {part.output.improvements?.length > 0 && (
                  <div>
                    <p className="text-amber-400 text-[10px] font-medium">Suggested improvements:</p>
                    <ul className="text-zinc-400 text-[10px] space-y-1">
                      {part.output.improvements.slice(0, 3).map((imp: any, i: number) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className={cn(
                            "text-[8px] px-1 rounded",
                            imp.priority === "high" ? "bg-red-500/20 text-red-400" :
                            imp.priority === "medium" ? "bg-amber-500/20 text-amber-400" :
                            "bg-zinc-500/20 text-zinc-400"
                          )}>
                            {imp.priority}
                          </span>
                          <span>{imp.suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* thinkStep result */}
            {toolName === "thinkStep" && isThinkStepResult(part.output) && (
              <div className="space-y-1 text-cyan-300/80">
                <p className="text-[10px] text-zinc-500">{part.output.interpretation}</p>
                <p className="font-medium">{part.output.plannedApproach}</p>
                {part.output.toolsToUse?.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {part.output.toolsToUse.map((t: string, i: number) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fallback for unknown tools */}
            {!["generateWebsite", "editWebsite", "addComponent", "analyzeDesign", "thinkStep"].includes(toolName) && (
              typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)
            )}
          </div>
        )}

        {hasError && part.errorText && <div className="mt-2 text-xs text-red-400">{part.errorText}</div>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#111111] min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-6 min-h-0">
        <div className="flex flex-col gap-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <p className="text-sm">Start a conversation to build something amazing</p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="flex flex-col gap-1">
                {message.role === "user" ? (
                  <div className="max-w-[85%] self-end">
                    <div className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100">
                      {message.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <div key={index} className="text-sm text-zinc-300 leading-relaxed">
                            {part.text}
                          </div>
                        )
                      }

                      if (part.type.startsWith("tool-")) {
                        return renderToolPart(part, index)
                      }

                      return null
                    })}
                  </div>
                )}
              </div>
            ))
          )}

          {isWorking && (
            <div className="flex items-center gap-4 py-4">
              {/* Neural Pulse Indicator */}
              <div className="relative flex items-center justify-center">
                {/* Outer ring that expands */}
                <div className="absolute h-10 w-10 rounded-full bg-emerald-500/20 animate-neural-ring" />
                <div className="absolute h-10 w-10 rounded-full bg-emerald-500/20 animate-neural-ring" style={{ animationDelay: '0.5s' }} />

                {/* Core orb */}
                <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 animate-neural-pulse flex items-center justify-center">
                  <div className="h-3 w-3 rounded-full bg-white/80" />
                </div>

                {/* Orbiting particles */}
                <div className="absolute h-12 w-12 animate-neural-orbit">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
                </div>
                <div className="absolute h-14 w-14 animate-neural-orbit" style={{ animationDirection: 'reverse', animationDuration: '4s' }}>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-emerald-300/40" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-emerald-400">Generating...</span>
                <span className="text-xs text-zinc-500">Creating your design</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="flex-shrink-0 p-4">
        <form onSubmit={handleSubmit}>
          <div className={cn(
            "rounded-2xl bg-zinc-800/80 backdrop-blur-sm p-3 transition-all duration-300",
            inputFocused && "animate-magnetic-glow bg-zinc-800/90 scale-[1.01]",
            !inputFocused && "border border-zinc-700/50"
          )}>
            {uploadedImages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {uploadedImages.map((image) => (
                  <div
                    key={image.id}
                    className="group relative h-16 w-16 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800"
                  >
                    <img
                      src={image.preview || "/placeholder.svg"}
                      alt="Upload preview"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Describe your vision..."
              className="min-h-[44px] w-full resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              rows={1}
              disabled={isWorking}
            />

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 w-8 rounded-lg p-0 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 rounded-lg px-2 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                    >
                      {selectedModel === "anthropic" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#D97757" viewBox="0 0 16 16" className="flex-shrink-0">
                          <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 65 65" className="flex-shrink-0">
                          <defs>
                            <linearGradient id="gemini-grad-btn-chat" x1="0%" y1="100%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#1A73E8"/>
                              <stop offset="50%" stopColor="#6C47FF"/>
                              <stop offset="100%" stopColor="#9168C0"/>
                            </linearGradient>
                          </defs>
                          <path fill="url(#gemini-grad-btn-chat)" d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z"/>
                        </svg>
                      )}
                      <span className="text-xs truncate max-w-[80px]">{MODEL_DISPLAY_NAMES[selectedModel]}</span>
                      <ChevronDown className="h-3 w-3 flex-shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="bg-zinc-800 border-zinc-700">
                    <DropdownMenuItem
                      onClick={() => setSelectedModel("anthropic")}
                      className={cn(
                        "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer",
                        selectedModel === "anthropic" && "bg-zinc-700",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {/* Claude logo */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="#D97757" viewBox="0 0 16 16">
                          <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/>
                        </svg>
                        <span>{MODEL_DISPLAY_NAMES.anthropic}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSelectedModel("google")}
                      className={cn(
                        "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer",
                        selectedModel === "google" && "bg-zinc-700",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {/* Gemini logo - simplified star */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 65 65">
                          <defs>
                            <linearGradient id="gemini-grad-chat" x1="0%" y1="100%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#1A73E8"/>
                              <stop offset="50%" stopColor="#6C47FF"/>
                              <stop offset="100%" stopColor="#9168C0"/>
                            </linearGradient>
                          </defs>
                          <path fill="url(#gemini-grad-chat)" d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z"/>
                        </svg>
                        <span>{MODEL_DISPLAY_NAMES.google}</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isWorking || (!inputValue.trim() && uploadedImages.length === 0)}
                  className={cn(
                    "h-8 w-8 rounded-lg p-0 flex-shrink-0",
                    inputValue.trim() || uploadedImages.length > 0
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 btn-primary-glow"
                      : "bg-zinc-700 text-zinc-400 btn-tactile",
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
}
