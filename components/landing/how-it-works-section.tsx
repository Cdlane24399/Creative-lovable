"use client"

import { motion } from "framer-motion"
import { MessageSquare, Cpu, Eye, Repeat } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: MessageSquare,
    title: "Describe Your Vision",
    description: "Tell the AI what you want to build using natural language. Be as detailed or simple as you want - the AI understands context.",
    visual: (
      <div className="bg-[#18181B] rounded-xl p-4 border border-zinc-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 border border-violet-500/30">
            <span className="text-xs font-medium text-violet-400">You</span>
          </div>
          <div className="space-y-2 flex-1">
            <div className="h-3 bg-zinc-800 rounded-full w-full" />
            <div className="h-3 bg-zinc-800 rounded-full w-4/5" />
            <div className="h-3 bg-zinc-800 rounded-full w-3/5" />
          </div>
        </div>
      </div>
    ),
  },
  {
    number: "02",
    icon: Cpu,
    title: "AI Generates Code",
    description: "Advanced AI models analyze your request and generate production-quality Next.js code with proper structure, styling, and best practices.",
    visual: (
      <div className="bg-[#18181B] rounded-xl p-4 border border-zinc-800 font-mono text-xs shadow-sm">
        <div className="space-y-1.5">
          <div className="text-emerald-500">{"// page.tsx"}</div>
          <div className="text-zinc-500">{"export default function Page() {"}</div>
          <div className="text-zinc-500 pl-4">{"return ("}</div>
          <div className="text-cyan-500 pl-8">{"<main className=\"...\">"}</div>
          <div className="text-amber-500 pl-12 animate-pulse">{"..."}</div>
          <div className="text-cyan-500 pl-8">{"</main>"}</div>
          <div className="text-zinc-500 pl-4">{")"}</div>
          <div className="text-zinc-500">{"}"}</div>
        </div>
      </div>
    ),
  },
  {
    number: "03",
    icon: Eye,
    title: "Live Preview Ready",
    description: "Your application spins up instantly in an E2B sandbox. Get a shareable HTTPS URL within seconds to preview and share your creation.",
    visual: (
      <div className="bg-[#18181B] rounded-xl overflow-hidden border border-zinc-800 shadow-sm">
        <div className="bg-zinc-800/50 px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          </div>
          <div className="flex-1 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-900 rounded-md text-[10px] text-zinc-400 border border-zinc-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              https://your-app.e2b.dev
            </div>
          </div>
        </div>
        <div className="p-4 h-20 bg-zinc-900/30 flex items-center justify-center">
          <div className="text-xs text-zinc-500">Your live application</div>
        </div>
      </div>
    ),
  },
  {
    number: "04",
    icon: Repeat,
    title: "Iterate & Refine",
    description: "Ask for changes in plain English. Add features, tweak styling, fix bugs - the AI understands context and maintains your project state.",
    visual: (
      <div className="space-y-2">
        <div className="bg-[#18181B] rounded-xl p-3 border border-zinc-800 text-xs text-zinc-400">
          &ldquo;Make the header sticky and add a dark mode toggle&rdquo;
        </div>
        <div className="flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Repeat className="w-3 h-3 text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
        </div>
        <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/20 text-xs text-emerald-500 font-medium">
          Changes applied successfully!
        </div>
      </div>
    ),
  },
]

export function HowItWorksSection() {
  return (
    <section className="relative py-24 sm:py-32 bg-[#111111] overflow-hidden">
      {/* Gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
      
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" 
        style={{ 
          backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', 
          backgroundSize: '40px 40px' 
        }} 
      />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 text-xs font-medium text-violet-400 mb-6 shadow-lg shadow-violet-500/5">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              HOW IT WORKS
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              From idea to{" "}
              <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">deployment</span>
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto font-light">
              Four simple steps to transform your concepts into working web applications.
            </p>
          </motion.div>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group"
            >
              <div className="flex gap-6">
                {/* Number & Icon */}
                <div className="flex-shrink-0">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 flex items-center justify-center group-hover:border-emerald-500/30 transition-all duration-300 shadow-lg shadow-black/20 group-hover:shadow-emerald-500/10">
                      <step.icon className="w-6 h-6 text-zinc-400 group-hover:text-emerald-400 transition-colors duration-300" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                      <span className="text-[10px] font-bold text-white">{step.number}</span>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors duration-300">
                    {step.title}
                  </h3>
                  <p className="text-zinc-400 text-sm leading-relaxed mb-4 group-hover:text-zinc-300 transition-colors">
                    {step.description}
                  </p>
                  {/* Visual */}
                  <div className="transform group-hover:translate-y-[-4px] group-hover:scale-[1.02] transition-all duration-300">
                    {step.visual}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
