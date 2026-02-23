"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { LandingBackground } from "./landing-background";
import { Header, HeroSectionV3 as HeroSection, Footer } from "./landing";
import { useAuth } from "@/hooks/use-auth";
import { type ModelProvider } from "@/lib/ai/agent";

// Dynamic import below-fold sections — not needed for initial paint
const FeaturesSection = dynamic(() =>
  import("./landing/features-section").then((m) => m.FeaturesSection),
);
const HowItWorksSection = dynamic(() =>
  import("./landing/how-it-works-section").then((m) => m.HowItWorksSection),
);
const ProjectsSection = dynamic(() =>
  import("./landing/projects-section").then((m) => m.ProjectsSection),
);
const TestimonialsSection = dynamic(() =>
  import("./landing/testimonials-section").then((m) => m.TestimonialsSection),
);
const CTASection = dynamic(() =>
  import("./landing/cta-section").then((m) => m.CTASection),
);

// Dynamic import WorkspaceView — only rendered for authenticated users
const WorkspaceView = dynamic(() =>
  import("./landing/workspace-view").then((m) => m.WorkspaceView),
);

export function LandingPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const onNavigateToEditor = useCallback(
    (projectId?: string, prompt?: string, model?: ModelProvider) => {
      const id = projectId || crypto.randomUUID();
      const params = new URLSearchParams();
      if (prompt) params.set("prompt", prompt);
      if (model && model !== "anthropic") params.set("model", model);
      const qs = params.toString();
      router.push(`/project/${id}${qs ? `?${qs}` : ""}`);
    },
    [router],
  );

  const handleHeroSubmit = useCallback(
    (prompt: string, model: ModelProvider) => {
      onNavigateToEditor(undefined, prompt, model);
    },
    [onNavigateToEditor],
  );

  const handleNewProject = useCallback(() => {
    onNavigateToEditor();
  }, [onNavigateToEditor]);

  // Show a loading state or just render standard layour while loading to avoid flicker?
  // Rendering standard layout might flicker if they are logged in.
  // Rendering nothing might flash white/black.
  // Let's render the background at least.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111111]">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <LandingBackground />
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen bg-[#111111] text-white font-sans selection:bg-blue-500/30">
        <WorkspaceView onNavigateToEditor={onNavigateToEditor} user={user} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white overflow-x-hidden font-sans selection:bg-blue-500/30">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LandingBackground />
      </div>

      {/* Content */}
      <div className="relative z-10">
        <Header />

        <main>
          <>
            <HeroSection
              onSubmit={handleHeroSubmit}
            />

            <div className="relative">
              {/* Gradient Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent max-w-5xl mx-auto" />

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
              <CTASection onNavigateToEditor={handleNewProject} />
            </div>
          </>
        </main>

        <Footer />
      </div>
    </div>
  );
}
