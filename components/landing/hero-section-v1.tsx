"use client"

import type React from "react"
import { useState, useRef } from "react"
import { ArrowUp, Wand2, Loader2 } from "lucide-react"
import { type ModelProvider } from "@/lib/ai/agent"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { ModelSelector } from "@/components/shared/model-selector"

interface HeroSectionProps {
  onSubmit: (prompt: string, model: ModelProvider) => void
}

export function HeroSectionV1({ onSubmit }: HeroSectionProps) {
  const [inputValue, setInputValue] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelProvider>("anthropic")
  const [isImproving, setIsImproving] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onSubmit(inputValue.trim(), selectedModel)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const typewriterEffect = async (text: string) => {
    setInputValue("")
    await new Promise(r => setTimeout(r, 200))

    for (let i = 0; i <= text.length; i++) {
      setInputValue(text.slice(0, i))
      const delay = Math.random() * 20 + 10
      await new Promise(r => setTimeout(r, delay))
    }
  }

  const handleImprovePrompt = async () => {
    if (!inputValue.trim() || isImproving) return

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

  const suggestions = [
    "A minimal portfolio",
    "SaaS dashboard",
  ]

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 relative">
      {/* Subtle ambient glow - very understated */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/[0.03] rounded-full blur-[150px] pointer-events-none" />

      <div className="w-full max-w-2xl mx-auto text-center relative z-10">
        {/* Headline - minimal, elegant */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-white/90 mb-16 leading-tight"
        >
          What would you like to build?
        </motion.h1>

        {/* Main Input - The Hero Element */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative"
        >
          {/* Subtle focus ring glow */}
          <motion.div
            className="absolute -inset-px rounded-2xl bg-gradient-to-b from-emerald-500/20 to-transparent opacity-0 blur-sm transition-opacity duration-500"
            animate={{ opacity: isFocused ? 0.5 : 0 }}
          />

          <div className={cn(
            "relative bg-zinc-900/40 backdrop-blur-xl rounded-2xl transition-all duration-500",
            "shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_2px_4px_rgba(0,0,0,0.1),0_12px_24px_rgba(0,0,0,0.1)]",
            isFocused && "shadow-[0_0_0_1px_rgba(16,185,129,0.1),0_2px_4px_rgba(0,0,0,0.1),0_24px_48px_rgba(0,0,0,0.15)]"
          )}>
            <div className="p-6">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Describe your vision..."
                className={cn(
                  "w-full bg-transparent text-white/90 placeholder:text-zinc-600 resize-none outline-none",
                  "text-lg leading-relaxed font-light tracking-wide",
                  "min-h-[120px]"
                )}
                rows={4}
                disabled={isImproving}
              />
            </div>

            {/* Bottom toolbar - minimal */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.03]">
              <div className="flex items-center gap-1">
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  showDescriptions={true}
                  disabled={isImproving}
                  triggerClassName="text-zinc-500 hover:text-zinc-400 hover:bg-white/[0.03]"
                />

                <motion.button
                  type="button"
                  onClick={handleImprovePrompt}
                  disabled={!inputValue.trim() || isImproving}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "h-9 px-3 rounded-lg flex items-center gap-2 transition-all duration-300",
                    inputValue.trim() && !isImproving
                      ? "text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/[0.05]"
                      : "text-zinc-700 cursor-not-allowed"
                  )}
                >
                  {isImproving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  <span className="text-sm font-light hidden sm:inline">
                    {isImproving ? "Improving" : "Improve"}
                  </span>
                </motion.button>
              </div>

              <motion.button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isImproving}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  "h-10 px-5 rounded-xl flex items-center gap-2 transition-all duration-300 font-medium text-sm",
                  inputValue.trim() && !isImproving
                    ? "bg-emerald-500 text-white hover:bg-emerald-400"
                    : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                )}
              >
                <span>Create</span>
                <ArrowUp className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Minimal suggestions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex justify-center gap-3 mt-8"
        >
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={suggestion}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
              onClick={() => setInputValue(suggestion)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-400 transition-colors duration-300"
            >
              {suggestion}
            </motion.button>
          ))}
        </motion.div>

        {/* Single subtle trust indicator */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-zinc-700 text-sm mt-16 font-light tracking-wide"
        >
          Powered by AI. Ready in seconds.
        </motion.p>
      </div>
    </div>
  )
}
