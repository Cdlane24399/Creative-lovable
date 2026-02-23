"use client";

import { AppSidebar } from "@/components/landing/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import type { ProjectCardData } from "@/lib/db/types";

interface SidebarProps {
  recentProjects?: ProjectCardData[];
  onNavigateToEditor?: (projectId?: string) => void;
}

interface AppLayoutProps {
  children: React.ReactNode;
  sidebarProps?: SidebarProps;
}

export function AppLayout({ children, sidebarProps }: AppLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden font-sans text-foreground selection:bg-blue-500/30">
      {/* Sidebar — flat background layer */}
      <div className="relative z-20 flex-shrink-0">
        <AppSidebar
          user={user}
          recentProjects={sidebarProps?.recentProjects}
          onNavigateToEditor={sidebarProps?.onNavigateToEditor}
        />
      </div>

      {/* Elevated content panel */}
      <main className="relative z-20 flex-1 bg-[#161616] rounded-[20px] m-1.5 ml-0 shadow-[0_0_60px_-10px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.06] overflow-hidden">
        <div className="h-full overflow-y-auto overflow-x-hidden scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  );
}
