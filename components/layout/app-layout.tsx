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
    <div className="flex h-screen bg-[#0f0f0f] overflow-hidden font-sans text-foreground selection:bg-blue-500/30">
      {/* Sidebar — always above content */}
      <div className="relative z-20 flex-shrink-0">
        <AppSidebar
          user={user}
          recentProjects={sidebarProps?.recentProjects}
          onNavigateToEditor={sidebarProps?.onNavigateToEditor}
        />
      </div>

      {/* Main content area */}
      <main className="relative flex-1 overflow-hidden w-full z-10 rounded-xl my-1 mr-1">
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden h-full scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  );
}
