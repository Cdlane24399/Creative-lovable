"use client";

import { WorkspaceHero } from "./workspace-hero";
import { ProjectsSection } from "./projects-section";
import { WorkspaceShaderBackground } from "@/components/workspace-shader-background";
import { type ModelProvider } from "@/lib/ai/agent";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/layout/app-layout";

interface WorkspaceViewProps {
  onNavigateToEditor: (
    projectId?: string,
    prompt?: string,
    model?: ModelProvider,
  ) => void;
  user?: { email?: string; user_metadata?: { full_name?: string } } | null;
}

export function WorkspaceView({
  onNavigateToEditor,
  user,
}: WorkspaceViewProps) {
  // Extract name for greeting
  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";

  return (
    <AppLayout>
      {/* Beautiful WebGL shader background */}
      <WorkspaceShaderBackground />

      <div className="relative min-h-screen flex flex-col">
        {/* Hero / Input Section - Sticky */}
        <div className="sticky top-0 z-10 w-full pt-16 pb-12 px-8">
          <div className="max-w-6xl mx-auto">
            <WorkspaceHero
              onSubmit={(prompt, model) =>
                onNavigateToEditor(undefined, prompt, model)
              }
              userName={displayName}
            />
          </div>
        </div>

        {/* Projects Section - Foreground Layer */}
        <div className="relative z-10 bg-[#111111] rounded-t-[2.5rem] pt-4 px-8 pb-20 min-h-screen border-t border-white/5 shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.5)]">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-medium text-white/90">
                  Recent Projects
                </h2>
              </div>
              <ProjectsSection onNavigateToEditor={onNavigateToEditor} />
            </motion.div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
