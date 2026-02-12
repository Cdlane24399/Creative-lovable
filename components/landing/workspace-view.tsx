"use client";

import { WorkspaceHero } from "./workspace-hero";
import { ProjectsSection } from "./projects-section"; // Reusing the existing robust project section
import { type ModelProvider } from "@/lib/ai/agent";
import { motion } from "framer-motion";

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
    <div className="min-h-screen">
      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* Hero / Input Section */}
        <WorkspaceHero
          onSubmit={(prompt, model) =>
            onNavigateToEditor(undefined, prompt, model)
          }
          userName={displayName}
        />

        {/* Divider / Transition */}
        <div className="h-px w-full max-w-5xl mx-auto bg-gradient-to-r from-transparent via-white/10 to-transparent mb-12" />

        {/* Projects Section - We'll wrap it to ensure it fits the workspace theme */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <ProjectsSection onNavigateToEditor={onNavigateToEditor} />
        </motion.div>
      </main>
    </div>
  );
}
