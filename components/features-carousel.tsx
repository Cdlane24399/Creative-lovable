"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronUp, ChevronDown, Pause, Play } from "lucide-react"
import { cn } from "@/lib/utils"

interface Feature {
  id: number
  title: string
  description: string
  image: string
  gradient: string
}

const features: Feature[] = [
  {
    id: 1,
    title: "Lovable Cloud",
    description: "Describe features, get full apps. Data, hosting, auth, AI included.",
    image: "/lovable-cloud-dashboard.png",
    gradient: "from-orange-500/20 via-red-500/10 to-transparent",
  },
  {
    id: 2,
    title: "AI Assistant",
    description: "Intelligent code generation. Build faster with natural language commands.",
    image: "/ai-chat-interface.png",
    gradient: "from-blue-500/20 via-cyan-500/10 to-transparent",
  },
  {
    id: 3,
    title: "Real-time Collaboration",
    description: "Work together seamlessly. Live cursors, instant sync, zero conflicts.",
    image: "/collaborative-editor.png",
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
  },
  {
    id: 4,
    title: "Edge Functions",
    description: "Deploy globally. Lightning-fast serverless functions at the edge.",
    image: "/edge-functions-global.png",
    gradient: "from-purple-500/20 via-pink-500/10 to-transparent",
  },
  {
    id: 5,
    title: "Analytics Dashboard",
    description: "Understand your users. Real-time insights and performance metrics.",
    image: "/analytics-dashboard-new.png",
    gradient: "from-amber-500/20 via-yellow-500/10 to-transparent",
  },
]

export function FeaturesCarousel({ compact = false }: { compact?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const [progress, setProgress] = useState(0)

  const INTERVAL_DURATION = 5000

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % features.length)
    setProgress(0)
  }, [])

  const goToPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + features.length) % features.length)
    setProgress(0)
  }, [])

  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index)
    setProgress(0)
  }, [])

  useEffect(() => {
    if (!isPlaying) return

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          goToNext()
          return 0
        }
        return prev + 100 / (INTERVAL_DURATION / 50)
      })
    }, 50)

    return () => clearInterval(progressInterval)
  }, [isPlaying, goToNext])

  if (compact) {
    return (
      <div className="relative flex h-full w-full items-center justify-center p-4">
        <div className="relative z-10 flex w-full max-w-3xl items-center gap-4">
          {/* Left Progress Indicator */}
          <div className="flex flex-col items-center gap-2">
            <div className="relative h-20 w-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="absolute left-0 top-0 w-full rounded-full bg-white/80 transition-all duration-100 ease-linear"
                style={{ height: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {features.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className="group flex items-center gap-2"
                  aria-label={`Go to slide ${index + 1}`}
                >
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-all duration-300",
                      activeIndex === index ? "scale-125 bg-white" : "bg-white/30 group-hover:bg-white/50",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Main Card - Compact */}
          <div className="flex-1">
            <div className="relative rounded-2xl border border-white/10 bg-[#1a1a1a]/60 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#0d0d0d]">
                <div className="flex items-center gap-2 border-b border-white/5 bg-[#1a1a1a] px-3 py-2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-white/20" />
                    <div className="h-2 w-2 rounded-full bg-white/20" />
                    <div className="h-2 w-2 rounded-full bg-white/20" />
                  </div>
                  <div className="flex flex-1 justify-center">
                    <div className="rounded-full bg-white/5 px-3 py-0.5 text-[10px] font-medium text-white/60">
                      {features[activeIndex].title}
                    </div>
                  </div>
                  <div className="w-8" />
                </div>

                <div className="relative aspect-[16/10] overflow-hidden">
                  {features.map((feature, index) => (
                    <div
                      key={feature.id}
                      className={cn(
                        "absolute inset-0 transition-all duration-700 ease-out",
                        activeIndex === index
                          ? "translate-y-0 scale-100 opacity-100"
                          : index < activeIndex
                            ? "-translate-y-8 scale-95 opacity-0"
                            : "translate-y-8 scale-95 opacity-0",
                      )}
                    >
                      <img
                        src={feature.image || "/placeholder.svg"}
                        alt={feature.title}
                        className="h-full w-full object-cover"
                      />
                      <div className={cn("absolute inset-0 bg-gradient-to-t opacity-80", feature.gradient)} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-1">
                <h3 className="text-lg font-semibold tracking-tight text-white">{features[activeIndex].title}</h3>
                <p className="max-w-md text-sm leading-relaxed text-white/60">{features[activeIndex].description}</p>
              </div>
            </div>
          </div>

          {/* Right Navigation Controls */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={goToPrev}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white"
              aria-label="Previous slide"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}
            </button>
            <button
              onClick={goToNext}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white"
              aria-label="Next slide"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] px-4 py-20">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a] to-[#0a0a0a]" />

      <div className="relative z-10 mx-auto flex max-w-6xl items-center gap-8">
        <div className="hidden flex-col items-center gap-3 md:flex">
          <div className="relative h-32 w-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="absolute left-0 top-0 w-full rounded-full bg-white/80 transition-all duration-100 ease-linear"
              style={{ height: `${progress}%` }}
            />
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {features.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className="group flex items-center gap-2"
                aria-label={`Go to slide ${index + 1}`}
              >
                <div
                  className={cn(
                    "h-2 w-2 rounded-full transition-all duration-300",
                    activeIndex === index ? "scale-125 bg-white" : "bg-white/30 group-hover:bg-white/50",
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-4xl flex-1">
          <div className="relative">
            <div className="relative rounded-3xl border border-white/10 bg-[#1a1a1a]/60 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#0d0d0d]">
                <div className="flex items-center gap-2 border-b border-white/5 bg-[#1a1a1a] px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-white/20" />
                    <div className="h-3 w-3 rounded-full bg-white/20" />
                    <div className="h-3 w-3 rounded-full bg-white/20" />
                  </div>
                  <div className="flex flex-1 justify-center">
                    <div className="rounded-full bg-white/5 px-4 py-1 text-xs font-medium text-white/60">
                      {features[activeIndex].title}
                    </div>
                  </div>
                  <div className="w-12" />
                </div>

                <div className="relative aspect-[16/10] overflow-hidden">
                  {features.map((feature, index) => (
                    <div
                      key={feature.id}
                      className={cn(
                        "absolute inset-0 transition-all duration-700 ease-out",
                        activeIndex === index
                          ? "translate-y-0 scale-100 opacity-100"
                          : index < activeIndex
                            ? "-translate-y-8 scale-95 opacity-0"
                            : "translate-y-8 scale-95 opacity-0",
                      )}
                    >
                      <img
                        src={feature.image || "/placeholder.svg"}
                        alt={feature.title}
                        className="h-full w-full object-cover"
                      />
                      <div className={cn("absolute inset-0 bg-gradient-to-t opacity-80", feature.gradient)} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <h3 className="text-2xl font-semibold tracking-tight text-white">{features[activeIndex].title}</h3>
                <p className="max-w-lg text-base leading-relaxed text-white/60">{features[activeIndex].description}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden flex-col items-center gap-3 md:flex">
          <button
            onClick={goToPrev}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white"
            aria-label="Previous slide"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button
            onClick={goToNext}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition-all duration-200 hover:bg-white/10 hover:text-white"
            aria-label="Next slide"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-4 md:hidden">
        <div className="flex gap-2">
          {features.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={cn(
                "h-2 w-2 rounded-full transition-all duration-300",
                activeIndex === index ? "w-6 bg-white" : "bg-white/30",
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={goToPrev}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60"
            aria-label="Previous slide"
          >
            <ChevronUp className="h-5 w-5 rotate-[-90deg]" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button
            onClick={goToNext}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60"
            aria-label="Next slide"
          >
            <ChevronDown className="h-5 w-5 rotate-[-90deg]" />
          </button>
        </div>
      </div>
    </section>
  )
}
