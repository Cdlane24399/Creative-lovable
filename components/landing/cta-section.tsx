"use client"

import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"

interface CTASectionProps {
  onNavigateToEditor: () => void
}

export function CTASection({ onNavigateToEditor }: CTASectionProps) {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden bg-[#09090B] border-t border-zinc-800">
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#18181B] border border-zinc-800 mb-8 shadow-sm">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium text-zinc-300">Start building for free</span>
          </div>

          {/* Headline */}
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight tracking-tight">
            Ready to transform{" "}
            <span className="text-emerald-500">
              your ideas
            </span>{" "}
            into reality?
          </h2>

          {/* Subtext */}
          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
            Join thousands of developers building production-ready web applications with AI.
            No credit card required to get started.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onNavigateToEditor}
              className="group relative px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                Start Building Now
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            <a
              href="#"
              className="px-8 py-4 text-zinc-300 hover:text-white font-medium rounded-xl border border-zinc-700 hover:border-zinc-600 transition-all hover:bg-zinc-800"
            >
              View Documentation
            </a>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-zinc-500 font-medium">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Free to start
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Cancel anytime
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
