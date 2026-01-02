"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { ArrowUp, AudioLines, Sparkles, Zap, Code2, Wand2, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MODEL_DISPLAY_NAMES, type ModelProvider } from "@/lib/ai/agent"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { ModelSelector } from "@/components/shared/model-selector"

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

interface HeroSectionProps {
  onSubmit: (prompt: string, model: ModelProvider) => void
}

export function HeroSection({ onSubmit }: HeroSectionProps) {
  const [inputValue, setInputValue] = useState("")
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<ModelProvider>("anthropic")
  const [isImproving, setIsImproving] = useState(false)
  const [showImproveEffect, setShowImproveEffect] = useState(false)
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

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index))
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

  const suggestions = [
    { icon: Code2, text: "Build a SaaS dashboard with analytics" },
    { icon: Sparkles, text: "Create a startup landing page" },
    { icon: Zap, text: "Design an e-commerce store" },
  ]

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-20 pb-32">
      <div className="w-full max-w-4xl mx-auto text-center">
        {/* Badge */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#18181B] border border-zinc-800 mb-8 shadow-sm"
        >
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-medium text-zinc-300">AI-Powered Web Development</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-white"
        >
          <span>Build web apps</span>
          <br />
          <span className="text-emerald-500">
            in seconds
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed font-light"
        >
          Describe what you want to build and watch as AI creates a fully interactive
          Next.js application with multiple pages, components, and live preview.
        </motion.p>

        {/* Chat Input */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative max-w-3xl mx-auto"
        >
          <div className={cn(
            "bg-zinc-900/50 backdrop-blur-2xl rounded-2xl p-4 border shadow-2xl shadow-black/50 transition-all",
            showImproveEffect 
              ? "border-violet-500/50 ring-2 ring-violet-500/20" 
              : "border-white/10 hover:border-white/20 focus-within:border-white/20"
          )}>
            {uploadedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={image || "/placeholder.svg"}
                      alt={`Upload ${index + 1}`}
                      className="h-16 w-16 object-cover rounded-xl border border-white/10"
                    />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-1.5 -right-1.5 bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 hover:bg-zinc-700 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the web app you want to build..."
                className={cn(
                  "w-full bg-transparent text-white placeholder:text-zinc-500 resize-none outline-none text-base min-h-[80px] px-1 font-medium transition-colors",
                  showImproveEffect && "text-violet-300"
                )}
                rows={3}
                disabled={isImproving}
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
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ 
                          opacity: 0, 
                          scale: 0,
                          x: Math.random() * 100 + "%",
                          y: Math.random() * 100 + "%"
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
                          left: `${Math.random() * 100}%`,
                          top: `${Math.random() * 100}%`,
                          boxShadow: "0 0 8px 2px rgba(167, 139, 250, 0.6)"
                        }}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between mt-3 pt-3">
              <div className="flex items-center gap-2">
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  showDescriptions={true}
                  disabled={isImproving}
                />

                {/* Improve Prompt Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleImprovePrompt}
                  disabled={!inputValue.trim() || isImproving}
                  className={cn(
                    "h-9 gap-2 rounded-xl px-3 transition-all border border-transparent",
                    inputValue.trim() && !isImproving
                      ? "text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 hover:border-violet-500/20"
                      : "text-zinc-600 cursor-not-allowed"
                  )}
                >
                  {isImproving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm hidden sm:inline">Improving...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      <span className="text-sm hidden sm:inline">Improve</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <button className="text-zinc-500 hover:text-zinc-300 h-9 w-9 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors border border-transparent hover:border-white/5">
                  <AudioLines className="w-4 h-4" />
                </button>

                <button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isImproving}
                  className="bg-emerald-600 text-white disabled:bg-zinc-800 disabled:text-zinc-600 h-9 px-4 flex items-center justify-center gap-2 rounded-xl transition-all hover:bg-emerald-500 active:scale-[0.98] font-medium text-sm shadow-sm"
                >
                  <span className="hidden sm:inline">Generate</span>
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Suggestion Pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.text}
                onClick={() => setInputValue(suggestion.text)}
                className="group flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 bg-[#18181B] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-full transition-all hover:text-white"
              >
                <suggestion.icon className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                {suggestion.text}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex flex-wrap items-center justify-center gap-6 mt-12 text-zinc-500 text-sm font-medium"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Live preview in seconds</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Full app architecture</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500" />
            <span>Interactive components</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
