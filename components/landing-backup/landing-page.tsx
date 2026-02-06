"use client"

import { LandingBackground } from "./landing-background"
import {
  Header,
  HeroSection,
  FeaturesSection,
  HowItWorksSection,
  ProjectsSection,
  TestimonialsSection,
  CTASection,
  Footer,
} from "./landing"

import { type ModelProvider } from "@/lib/ai/agent"

interface LandingPageProps {
  onNavigateToEditor: (projectId?: string, prompt?: string, model?: ModelProvider) => void
}

export function LandingPage({ onNavigateToEditor }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#09090B] text-white overflow-x-hidden font-sans selection:bg-emerald-500/30">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LandingBackground />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Header />

        <main>
          <HeroSection onSubmit={(prompt, model) => onNavigateToEditor(undefined, prompt, model)} />

          <div className="relative">
            {/* Gradient Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent max-w-5xl mx-auto" />

            <div id="features">
              <FeaturesSection />
            </div>
          </div>

          <div id="how-it-works">
            <HowItWorksSection />
          </div>

          <ProjectsSection onNavigateToEditor={onNavigateToEditor} />

          <TestimonialsSection />

          <div id="pricing">
            <CTASection onNavigateToEditor={() => onNavigateToEditor()} />
          </div>
        </main>

        <Footer />
      </div>
    </div>
  )
}
