"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { ArrowRight, Sparkles, Rocket, Palette, Zap, Code2, Wand2, Loader2, Layout, ShoppingBag, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { type ModelProvider } from "@/lib/ai/agent"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { ModelSelector } from "@/components/shared/model-selector"

// Floating shape component for decorative elements
const FloatingShape = ({
  className,
  delay = 0,
  duration = 20,
  children
}: {
  className?: string
  delay?: number
  duration?: number
  children: React.ReactNode
}) => (
  <motion.div
    className={cn("absolute pointer-events-none", className)}
    animate={{
      y: [0, -20, 0, 20, 0],
      x: [0, 10, 0, -10, 0],
      rotate: [0, 5, 0, -5, 0],
    }}
    transition={{
      duration,
      delay,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  >
    {children}
  </motion.div>
)

// Animated gradient blob
const GradientBlob = ({ className, colors }: { className?: string, colors: string }) => (
  <motion.div
    className={cn(
      "absolute rounded-full blur-3xl opacity-30 pointer-events-none",
      colors,
      className
    )}
    animate={{
      scale: [1, 1.2, 1],
      opacity: [0.2, 0.35, 0.2],
    }}
    transition={{
      duration: 8,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
)

interface HeroSectionProps {
  onSubmit: (prompt: string, model: ModelProvider) => void
}

// Placeholder ideas that cycle through
const placeholderIdeas = [
  "A colorful portfolio with animated transitions...",
  "An e-commerce store with a shopping cart...",
  "A SaaS dashboard with real-time analytics...",
  "A recipe app with ingredient search...",
  "A fitness tracker with progress charts...",
  "A blog with dark mode and comments...",
  "A music player with playlist management...",
]

export function HeroSectionV2({ onSubmit }: HeroSectionProps) {
  const [inputValue, setInputValue] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelProvider>("anthropic")
  const [isImproving, setIsImproving] = useState(false)
  const [showImproveEffect, setShowImproveEffect] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState("")
  const [isTyping, setIsTyping] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Animated typing placeholder effect
  useEffect(() => {
    if (inputValue) return // Don't animate if user has typed something

    const targetText = placeholderIdeas[placeholderIndex]
    let charIndex = 0
    let isDeleting = false
    let timeout: NodeJS.Timeout

    const typeChar = () => {
      if (!isDeleting) {
        // Typing
        if (charIndex <= targetText.length) {
          setDisplayedPlaceholder(targetText.slice(0, charIndex))
          charIndex++
          timeout = setTimeout(typeChar, 50 + Math.random() * 30)
        } else {
          // Pause before deleting
          timeout = setTimeout(() => {
            isDeleting = true
            typeChar()
          }, 2000)
        }
      } else {
        // Deleting
        if (charIndex > 0) {
          charIndex--
          setDisplayedPlaceholder(targetText.slice(0, charIndex))
          timeout = setTimeout(typeChar, 25)
        } else {
          // Move to next placeholder
          isDeleting = false
          setPlaceholderIndex((prev) => (prev + 1) % placeholderIdeas.length)
        }
      }
    }

    timeout = setTimeout(typeChar, 500)
    return () => clearTimeout(timeout)
  }, [placeholderIndex, inputValue])

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

  // Typewriter effect for improved prompt
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
    { icon: Layout, text: "Landing page with animations", color: "from-violet-500 to-purple-600", bgColor: "bg-violet-500/10 hover:bg-violet-500/20", borderColor: "border-violet-500/30", iconColor: "text-violet-400" },
    { icon: ShoppingBag, text: "E-commerce with cart", color: "from-amber-500 to-orange-600", bgColor: "bg-amber-500/10 hover:bg-amber-500/20", borderColor: "border-amber-500/30", iconColor: "text-amber-400" },
    { icon: BarChart3, text: "Dashboard with charts", color: "from-cyan-500 to-blue-600", bgColor: "bg-cyan-500/10 hover:bg-cyan-500/20", borderColor: "border-cyan-500/30", iconColor: "text-cyan-400" },
    { icon: Palette, text: "Portfolio with 3D effects", color: "from-emerald-500 to-teal-600", bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20", borderColor: "border-emerald-500/30", iconColor: "text-emerald-400" },
  ]

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-16 pb-24 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden z-0">
        <GradientBlob
          className="w-[600px] h-[600px] -top-40 -left-40"
          colors="bg-gradient-to-br from-violet-600 to-purple-600"
        />
        <GradientBlob
          className="w-[500px] h-[500px] top-1/4 right-0"
          colors="bg-gradient-to-br from-cyan-500 to-blue-500"
        />
        <GradientBlob
          className="w-[400px] h-[400px] bottom-0 left-1/4"
          colors="bg-gradient-to-br from-amber-500 to-orange-500"
        />
        <GradientBlob
          className="w-[350px] h-[350px] bottom-1/4 right-1/4"
          colors="bg-gradient-to-br from-emerald-500 to-teal-500"
        />
      </div>

      {/* Floating decorative shapes - z-[1] to be above background but below content */}
      <FloatingShape className="top-20 left-[10%] z-[1]" delay={0} duration={15}>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/20 backdrop-blur-sm" />
      </FloatingShape>
      <FloatingShape className="top-40 right-[15%] z-[1]" delay={2} duration={18}>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 backdrop-blur-sm" />
      </FloatingShape>
      <FloatingShape className="bottom-32 left-[20%] z-[1]" delay={1} duration={20}>
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500/15 to-orange-500/15 border border-amber-500/20 backdrop-blur-sm rotate-12" />
      </FloatingShape>
      <FloatingShape className="top-1/3 left-[5%] z-[1]" delay={3} duration={22}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 backdrop-blur-sm" />
      </FloatingShape>
      <FloatingShape className="bottom-40 right-[10%] z-[1]" delay={1.5} duration={17}>
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500/15 to-rose-500/15 border border-pink-500/20 backdrop-blur-sm -rotate-12" />
      </FloatingShape>
      <FloatingShape className="top-1/2 right-[8%] z-[1]" delay={2.5} duration={19}>
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500/25 to-indigo-500/25 border border-violet-500/30 backdrop-blur-sm" />
      </FloatingShape>

      {/* Floating dots */}
      {[...Array(8)].map((_, i) => (
        <FloatingShape
          key={i}
          className={`z-[1] ${
            ['top-24 left-[30%]', 'top-36 right-[25%]', 'bottom-48 left-[15%]', 'bottom-36 right-[20%]',
             'top-1/2 left-[8%]', 'top-1/3 right-[5%]', 'bottom-1/4 left-[35%]', 'bottom-1/3 right-[30%]'][i]
          }`}
          delay={i * 0.5}
          duration={10 + i * 2}
        >
          <div className={cn(
            "rounded-full",
            i % 4 === 0 ? "w-3 h-3 bg-violet-400/40" :
            i % 4 === 1 ? "w-2 h-2 bg-cyan-400/50" :
            i % 4 === 2 ? "w-4 h-4 bg-amber-400/30" :
            "w-2.5 h-2.5 bg-emerald-400/40"
          )} />
        </FloatingShape>
      ))}

      <div className="w-full max-w-4xl mx-auto text-center relative z-20">
        {/* Playful badge */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-500/15 via-cyan-500/15 to-amber-500/15 border border-white/10 mb-8 shadow-xl backdrop-blur-md"
        >
          <motion.div
            animate={{
              rotate: [0, 15, -15, 0],
              scale: [1, 1.2, 1.2, 1],
            }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Sparkles className="w-5 h-5 text-amber-400" />
          </motion.div>
          <span className="text-sm font-semibold bg-gradient-to-r from-violet-400 via-cyan-400 to-amber-400 bg-clip-text text-transparent">
            Your ideas, built in seconds
          </span>
          <motion.div
            animate={{
              x: [0, 4, 0],
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Rocket className="w-4 h-4 text-cyan-400" />
          </motion.div>
        </motion.div>

        {/* Main Headline with playful styling */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, type: "spring", bounce: 0.3 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 text-white"
        >
          <motion.span
            className="inline-block"
            whileHover={{ scale: 1.05, rotate: -1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            Turn your
          </motion.span>{" "}
          <motion.span
            className="inline-block bg-gradient-to-r from-violet-400 via-pink-400 to-amber-400 bg-clip-text text-transparent"
            whileHover={{ scale: 1.05, rotate: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
            animate={{
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }}
            style={{ backgroundSize: "200% 200%" }}
          >
            imagination
          </motion.span>
          <br />
          <motion.span
            className="inline-block"
            whileHover={{ scale: 1.05, rotate: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            into
          </motion.span>{" "}
          <motion.span
            className="inline-block bg-gradient-to-r from-cyan-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent"
            whileHover={{ scale: 1.05, rotate: -1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            reality
          </motion.span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Describe any web app and watch the magic happen. Full Next.js applications with
          <span className="text-violet-400 font-medium"> beautiful UI</span>,
          <span className="text-cyan-400 font-medium"> real interactivity</span>, and
          <span className="text-amber-400 font-medium"> instant preview</span>.
        </motion.p>

        {/* Large Input Area - The Star of the Show */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3, type: "spring", bounce: 0.25 }}
          className="relative max-w-3xl mx-auto"
        >
          {/* Multi-color glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/30 via-cyan-500/30 to-amber-500/30 rounded-[28px] blur-xl opacity-60" />
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500/20 via-cyan-500/20 to-amber-500/20 rounded-[26px] blur-md" />

          <motion.div
            className={cn(
              "relative bg-zinc-900/90 backdrop-blur-2xl rounded-3xl p-5 border-2 shadow-2xl shadow-black/40 transition-all duration-300",
              showImproveEffect
                ? "border-violet-500/60"
                : "border-white/10 hover:border-white/20 focus-within:border-violet-500/40"
            )}
            whileHover={{ scale: 1.005 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={inputValue ? "" : displayedPlaceholder}
                className={cn(
                  "w-full bg-transparent text-white placeholder:text-zinc-500 resize-none outline-none text-lg min-h-[140px] px-2 py-1 font-medium transition-colors leading-relaxed",
                  showImproveEffect && "text-violet-300"
                )}
                rows={4}
                disabled={isImproving}
              />

              {/* Sparkle effect overlay during improvement */}
              <AnimatePresence>
                {showImproveEffect && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
                  >
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{
                          opacity: 0,
                          scale: 0,
                        }}
                        animate={{
                          opacity: [0, 1, 0],
                          scale: [0, 1.5, 0],
                        }}
                        transition={{
                          duration: 1.2,
                          delay: i * 0.15,
                          repeat: Infinity,
                          repeatDelay: 0.3,
                        }}
                        className="absolute w-1.5 h-1.5 rounded-full"
                        style={{
                          left: `${Math.random() * 100}%`,
                          top: `${Math.random() * 100}%`,
                          background: ['#a78bfa', '#22d3ee', '#fbbf24', '#34d399'][i % 4],
                          boxShadow: `0 0 10px 3px ${['rgba(167, 139, 250, 0.6)', 'rgba(34, 211, 238, 0.6)', 'rgba(251, 191, 36, 0.6)', 'rgba(52, 211, 153, 0.6)'][i % 4]}`
                        }}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-2">
                <ModelSelector
                  selectedModel={selectedModel}
                  onModelChange={setSelectedModel}
                  showDescriptions={true}
                  disabled={isImproving}
                  triggerClassName="rounded-xl"
                />

                {/* Improve Prompt Button */}
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleImprovePrompt}
                    disabled={!inputValue.trim() || isImproving}
                    className={cn(
                      "h-9 gap-2 rounded-xl px-3 transition-all border",
                      inputValue.trim() && !isImproving
                        ? "text-violet-400 hover:bg-violet-500/15 hover:text-violet-300 border-violet-500/20 hover:border-violet-500/40"
                        : "text-zinc-600 border-transparent cursor-not-allowed"
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
                </motion.div>
              </div>

              {/* Submit button with playful styling */}
              <motion.button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isImproving}
                className={cn(
                  "relative group h-11 px-6 flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm transition-all overflow-hidden",
                  inputValue.trim() && !isImproving
                    ? "bg-gradient-to-r from-violet-600 via-purple-600 to-cyan-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                )}
                whileHover={inputValue.trim() && !isImproving ? { scale: 1.03 } : {}}
                whileTap={inputValue.trim() && !isImproving ? { scale: 0.97 } : {}}
              >
                {/* Animated gradient overlay on hover */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-cyan-600 via-violet-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"
                />
                <span className="relative z-10">Build it</span>
                <motion.div
                  className="relative z-10"
                  animate={inputValue.trim() ? { x: [0, 4, 0] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <ArrowRight className="w-4 h-4" />
                </motion.div>
              </motion.button>
            </div>
          </motion.div>

          {/* Colorful Suggestion Pills */}
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            {suggestions.map((suggestion, index) => (
              <motion.button
                key={suggestion.text}
                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.4,
                  delay: 0.5 + index * 0.1,
                  type: "spring",
                  bounce: 0.4
                }}
                onClick={() => setInputValue(suggestion.text)}
                className={cn(
                  "group flex items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 rounded-2xl transition-all border backdrop-blur-sm",
                  suggestion.bgColor,
                  suggestion.borderColor
                )}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div
                  whileHover={{ rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.4 }}
                >
                  <suggestion.icon className={cn("w-4 h-4 transition-colors", suggestion.iconColor)} />
                </motion.div>
                <span className="font-medium">{suggestion.text}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Fun Trust Indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mt-14"
        >
          {[
            { color: "bg-violet-500", shadow: "shadow-violet-500/50", text: "Instant preview", delay: 0 },
            { color: "bg-cyan-500", shadow: "shadow-cyan-500/50", text: "Full interactivity", delay: 0.3 },
            { color: "bg-amber-500", shadow: "shadow-amber-500/50", text: "Production ready", delay: 0.6 },
            { color: "bg-emerald-500", shadow: "shadow-emerald-500/50", text: "One-click deploy", delay: 0.9 },
          ].map((item, i) => (
            <motion.div
              key={item.text}
              className="flex items-center gap-2.5 group cursor-default"
              whileHover={{ scale: 1.05 }}
            >
              <motion.div
                className={cn("w-2.5 h-2.5 rounded-full shadow-lg", item.color, item.shadow)}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: item.delay,
                }}
              />
              <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
                {item.text}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
