"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import {
  Plus,
  Sparkles,
  MessageSquare,
  AudioLines,
  ArrowUp,
  X,
  Loader2,
  Code,
  CheckCircle,
  AlertCircle,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useChatWithTools } from "@/hooks/use-chat-with-tools"
import { cn } from "@/lib/utils"
import { MODEL_DISPLAY_NAMES, type ModelProvider } from "@/lib/ai/agent"

interface UploadedImage {
  id: string
  file: File
  preview: string
}

interface ChatPanelProps {
  projectId?: string
  onPreviewUpdate?: (content: string) => void
}

export function ChatPanel({ projectId, onPreviewUpdate }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("")
  const [isChatEnabled, setIsChatEnabled] = useState(false)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelProvider>("google")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, isWorking, status } = useChatWithTools({
    projectId,
    model: selectedModel,
    onError: (error) => {
      console.error("Chat error:", error)
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() && uploadedImages.length === 0) return

    const content = inputValue.trim()
    setInputValue("")

    uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview))
    setUploadedImages([])

    await sendMessage({ text: content })
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

  const renderToolPart = (part: any, index: number) => {
    const toolName = part.type.replace("tool-", "")

    return (
      <div key={index} className="my-2 rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-3">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {part.state === "running" || part.state === "generating" || part.state === "writing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : part.state === "complete" ? (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
          ) : part.state === "error" ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
          ) : (
            <Code className="h-3.5 w-3.5" />
          )}
          <span className="font-medium capitalize">{toolName.replace(/([A-Z])/g, " $1").trim()}</span>
        </div>

        {part.state === "complete" && part.output && (
          <div className="mt-2 text-xs text-zinc-300">
            {typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)}
          </div>
        )}

        {part.state === "error" && part.error && <div className="mt-2 text-xs text-red-400">{part.error}</div>}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[#111111]">
      <div className="flex-1 overflow-y-auto px-4 py-6">
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
            <div className="flex items-center gap-2 text-zinc-400">
              <div className="flex h-5 w-5 items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 text-zinc-400"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <span className="text-sm font-medium">Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl bg-zinc-800 p-3">
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
              placeholder="Ask Lovable..."
              className="min-h-[60px] w-full resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              rows={2}
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg px-2.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-xs">Visual edits</span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg px-2.5 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-3.5 w-3.5"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                      </svg>
                      <span className="text-xs">{MODEL_DISPLAY_NAMES[selectedModel]}</span>
                      <ChevronDown className="h-3 w-3" />
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
                        <div className="h-2 w-2 rounded-full bg-orange-400" />
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
                        <div className="h-2 w-2 rounded-full bg-blue-400" />
                        <span>{MODEL_DISPLAY_NAMES.google}</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setSelectedModel("openai")}
                      className={cn(
                        "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer",
                        selectedModel === "openai" && "bg-zinc-700",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span>{MODEL_DISPLAY_NAMES.openai}</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsChatEnabled(!isChatEnabled)}
                  className={cn(
                    "h-8 gap-1.5 rounded-lg px-2.5 transition-colors",
                    isChatEnabled
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "text-zinc-500 hover:bg-zinc-700 hover:text-zinc-400",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="text-xs">Chat</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 rounded-lg p-0 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                >
                  <AudioLines className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isWorking || (!inputValue.trim() && uploadedImages.length === 0)}
                  className={cn(
                    "h-8 w-8 rounded-lg p-0 transition-all",
                    inputValue.trim() || uploadedImages.length > 0
                      ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/25"
                      : "bg-zinc-700 text-zinc-400",
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
