"use client"

import { motion } from "framer-motion"
import {
  Zap,
  Code2,
  Layers,
  RefreshCw,
  Shield,
  Globe,
  Sparkles,
  Terminal,
  Palette,
  GitBranch,
  Box,
  Cpu
} from "lucide-react"

const features = [
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Go from idea to working website in under 30 seconds. Our optimized E2B sandbox environment starts instantly.",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20"
  },
  {
    icon: Code2,
    title: "Production-Ready Code",
    description: "Generated code follows best practices with TypeScript, React 19, and modern Next.js 15 patterns.",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20"
  },
  {
    icon: Layers,
    title: "Full Stack Ready",
    description: "Build complete applications with database integration, authentication, and API routes included.",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20"
  },
  {
    icon: RefreshCw,
    title: "Iterative Development",
    description: "Refine your creation with natural language. Ask for changes and watch them happen in real-time.",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20"
  },
  {
    icon: Palette,
    title: "Beautiful UI Components",
    description: "Access 40+ pre-built shadcn/ui components. Build stunning interfaces without writing CSS.",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    borderColor: "border-pink-500/20"
  },
  {
    icon: Globe,
    title: "Instant Preview",
    description: "Every generation includes a live HTTPS preview URL you can share with anyone, anywhere.",
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    borderColor: "border-teal-500/20"
  },
]

const techStack = [
  { icon: Box, label: "Next.js 15" },
  { icon: Sparkles, label: "React 19" },
  { icon: Terminal, label: "TypeScript" },
  { icon: Palette, label: "Tailwind CSS" },
  { icon: GitBranch, label: "shadcn/ui" },
  { icon: Cpu, label: "E2B Sandbox" },
]

export function FeaturesSection() {
  return (
    <section className="relative py-24 sm:py-32 bg-[#09090B]">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.02] to-transparent pointer-events-none" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-400 mb-6 shadow-lg shadow-emerald-500/5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Everything you need to{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">build</span>
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto font-light">
              Powered by cutting-edge AI and cloud sandbox technology to transform your ideas into reality.
            </p>
          </motion.div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group relative"
            >
              {/* Card glow effect on hover */}
              <div className={`absolute -inset-0.5 bg-gradient-to-r ${feature.bgColor} rounded-xl blur opacity-0 group-hover:opacity-30 transition-opacity duration-500`} />
              
              <div className="relative h-full bg-zinc-900/50 backdrop-blur-sm rounded-xl p-6 border border-zinc-800/50 hover:border-zinc-700/50 transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1">
                {/* Icon */}
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${feature.bgColor} ${feature.borderColor} border mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-zinc-100 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Tech Stack */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mt-20"
        >
          <div className="text-center mb-8">
            <p className="text-sm text-zinc-500 uppercase tracking-wider font-medium">Built with modern technology</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {techStack.map((tech, index) => (
              <motion.div
                key={tech.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05, y: -2 }}
                className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-zinc-800/50 hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all text-zinc-300 hover:text-white shadow-lg shadow-black/10"
              >
                <tech.icon className="w-4 h-4 text-zinc-400 group-hover:text-emerald-400" />
                <span className="text-sm font-medium">{tech.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
