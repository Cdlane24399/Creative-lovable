"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type User } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import { LandingBackground } from "./landing-background";
import { Header, HeroSectionV3 as HeroSection, Footer } from "./landing";

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

import { type ModelProvider } from "@/lib/ai/agent";

interface LandingPageProps {
  onNavigateToEditor: (
    projectId?: string,
    prompt?: string,
    model?: ModelProvider,
  ) => void;
}

export function LandingPage({ onNavigateToEditor }: LandingPageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Check active session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show a loading state or just render standard layour while loading to avoid flicker?
  // Rendering standard layout might flicker if they are logged in.
  // Rendering nothing might flash white/black.
  // Let's render the background at least.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090B]">
        <div className="fixed inset-0 z-0 pointer-events-none">
          <LandingBackground />
        </div>
      </div>
    );
  }

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
          {user ? (
            <WorkspaceView
              onNavigateToEditor={onNavigateToEditor}
              user={user}
            />
          ) : (
            <>
              <HeroSection
                onSubmit={(prompt, model) =>
                  onNavigateToEditor(undefined, prompt, model)
                }
              />

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
            </>
          )}
        </main>

        {!user && <Footer />}
      </div>
    </div>
  );
}
