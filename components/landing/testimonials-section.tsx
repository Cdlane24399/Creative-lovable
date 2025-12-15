"use client"

import { motion } from "framer-motion"
import { Star, Quote } from "lucide-react"

const testimonials = [
  {
    quote: "I built a complete SaaS landing page in under a minute. The code quality is exceptional - clean TypeScript, proper component structure, and beautiful Tailwind styling.",
    author: "Sarah Chen",
    role: "Indie Developer",
    avatar: "SC",
    rating: 5,
    gradient: "from-violet-500 to-purple-500",
  },
  {
    quote: "The iterative workflow is incredible. I described changes in plain English and watched them happen in real-time. It feels like pair programming with a senior developer.",
    author: "Marcus Johnson",
    role: "Startup Founder",
    avatar: "MJ",
    rating: 5,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    quote: "Went from Figma mockup to working prototype in 10 minutes. The live preview feature with shareable URLs saved us hours of deployment setup.",
    author: "Emma Rodriguez",
    role: "Product Designer",
    avatar: "ER",
    rating: 5,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    quote: "The AI understands context perfectly. I asked it to 'make the pricing section more premium' and it added elegant gradients, better spacing, and refined typography.",
    author: "David Kim",
    role: "Frontend Engineer",
    avatar: "DK",
    rating: 5,
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    quote: "Best tool I've used for rapid prototyping. The shadcn/ui integration means I get production-ready components out of the box. Game changer.",
    author: "Lisa Park",
    role: "Tech Lead",
    avatar: "LP",
    rating: 5,
    gradient: "from-pink-500 to-rose-500",
  },
  {
    quote: "Error recovery is magical. When my build failed, the AI automatically detected the issue, fixed it, and verified the solution. Zero manual debugging needed.",
    author: "Alex Turner",
    role: "Full Stack Developer",
    avatar: "AT",
    rating: 5,
    gradient: "from-teal-500 to-cyan-500",
  },
]

export function TestimonialsSection() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden bg-[#09090B]">
      {/* Subtle background pattern instead of blobs */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
        style={{ 
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', 
          backgroundSize: '60px 60px' 
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
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#18181B] border border-zinc-800 text-xs font-medium text-zinc-400 mb-4">
              <Star className="w-3 h-3 text-amber-500" />
              TESTIMONIALS
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              Loved by developers
            </h2>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto font-light">
              Join thousands of developers who are building faster with AI-powered web development.
            </p>
          </motion.div>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group"
            >
              <div className="h-full bg-[#18181B] rounded-xl p-6 border border-zinc-800 hover:border-zinc-700 transition-all duration-300 relative hover:shadow-lg hover:shadow-black/20">
                {/* Quote icon */}
                <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Quote className="w-8 h-8 text-zinc-400" />
                </div>

                {/* Rating */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-500 fill-amber-500" />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-zinc-300 text-sm leading-relaxed mb-6 relative z-10 font-normal">
                  "{testimonial.quote}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${testimonial.gradient} flex items-center justify-center shadow-inner`}>
                    <span className="text-xs font-bold text-white">{testimonial.avatar}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{testimonial.author}</p>
                    <p className="text-xs text-zinc-500">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8"
        >
          {[
            { value: "10K+", label: "Developers" },
            { value: "50K+", label: "Projects Built" },
            { value: "<30s", label: "Average Build Time" },
            { value: "4.9/5", label: "User Rating" },
          ].map((stat, index) => (
            <div key={stat.label} className="text-center p-4 rounded-xl bg-[#18181B] border border-zinc-800">
              <div className="text-3xl sm:text-4xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-sm text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
