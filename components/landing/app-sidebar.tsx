"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import {
  Home,
  Search,
  Gift,
  Zap,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  Grid2X2,
  Star,
  Users,
  Compass,
  LayoutTemplate,
  Folder,
  Settings,
  LogOut,
} from "lucide-react";
import { LumiLogo } from "@/components/shared/icons";
import type { ProjectCardData } from "@/lib/db/types";
import { useState } from "react";

interface AppSidebarProps {
  user: { email?: string; user_metadata?: { full_name?: string } } | null;
  recentProjects?: ProjectCardData[];
  onNavigateToEditor?: (projectId?: string) => void;
}

export function AppSidebar({
  user,
  recentProjects,
  onNavigateToEditor,
}: AppSidebarProps) {
  const pathname = usePathname();
  const supabase = createClient();
  const [recentOpen, setRecentOpen] = useState(true);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  const sidebarItemClass =
    "flex items-center gap-2.5 px-2 py-1.5 text-sm rounded-lg transition-colors text-[hsl(40,9%,75%)] hover:text-foreground hover:bg-secondary w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50";

  return (
    <nav
      aria-label="Main navigation"
      className="w-[273px] flex flex-col h-screen flex-shrink-0 bg-[#0a0a0a] p-3.5"
    >
      {/* Top: Logo + Workspace Dropdown */}
      <div className="pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Workspace menu"
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 shadow-md">
                <LumiLogo className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="text-sm font-medium text-foreground truncate flex-1 text-left min-w-0">
                {displayName}&apos;s Creative
              </span>
              <ChevronDown
                className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0"
                aria-hidden="true"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="w-4 h-4 mr-2" aria-hidden="true" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-red-400 focus:text-red-400"
            >
              <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav: Home + Search */}
      <div className="space-y-0.5">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2.5 px-2 py-1.5 text-sm rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
            pathname === "/"
              ? "bg-[hsl(60,1%,25%)] text-foreground"
              : "text-[hsl(40,9%,75%)] hover:text-foreground hover:bg-secondary",
          )}
        >
          <Home size={20} aria-hidden="true" />
          Home
        </Link>
        <button className={sidebarItemClass}>
          <Search size={20} aria-hidden="true" />
          Search
        </button>
      </div>

      {/* Projects Section */}
      <ScrollArea className="flex-1 mt-4">
        <div className="space-y-6">
          {/* Projects */}
          <div>
            <span className="text-[11px] uppercase tracking-[0.5px] text-[hsl(40,9%,55%)] font-semibold px-2 mb-1.5 block select-none opacity-50">
              Projects
            </span>

            {/* Recent - Collapsible */}
            <Collapsible open={recentOpen} onOpenChange={setRecentOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 px-2 py-1.5 text-sm text-[hsl(40,9%,75%)] hover:text-foreground hover:bg-secondary rounded-lg w-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50">
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 transition-transform duration-200 flex-shrink-0",
                    recentOpen && "rotate-90",
                  )}
                  aria-hidden="true"
                />
                <Clock size={18} className="flex-shrink-0" aria-hidden="true" />
                Recent
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-2 space-y-0.5 mt-0.5">
                  {recentProjects && recentProjects.length > 0 ? (
                    recentProjects.slice(0, 5).map((project) => (
                      <button
                        key={project.id}
                        onClick={() => onNavigateToEditor?.(project.id)}
                        className="flex items-center gap-2 px-2 py-1 text-sm text-[hsl(40,9%,75%)] hover:text-foreground hover:bg-secondary rounded-md w-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50"
                      >
                        <Folder
                          className="w-3.5 h-3.5 flex-shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate min-w-0">
                          {project.title}
                        </span>
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-[hsl(40,9%,55%)] px-2 py-1 block">
                      No recent projects
                    </span>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* All projects */}
            <Link href="/" className={sidebarItemClass}>
              <Grid2X2 size={20} aria-hidden="true" />
              All projects
            </Link>

            {/* Starred */}
            <button className={sidebarItemClass}>
              <Star size={20} aria-hidden="true" />
              Starred
            </button>

            {/* Shared with me */}
            <button className={sidebarItemClass}>
              <Users size={20} aria-hidden="true" />
              Shared with me
            </button>
          </div>

          {/* Resources */}
          <div>
            <span className="text-[11px] uppercase tracking-[0.5px] text-[hsl(40,9%,55%)] font-semibold px-2 mb-1.5 block select-none opacity-50">
              Resources
            </span>
            <button className={sidebarItemClass}>
              <Compass size={20} aria-hidden="true" />
              Discover
            </button>
            <button className={sidebarItemClass}>
              <LayoutTemplate size={20} aria-hidden="true" />
              Templates
            </button>
          </div>
        </div>
      </ScrollArea>

      {/* Bottom CTAs */}
      <div className="pb-2 space-y-2">
        {/* Share Creative */}
        <button className="w-full px-3 py-3 rounded-xl bg-secondary/50 border border-border hover:bg-secondary transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50">
          <div className="flex items-center gap-2">
            <Gift size={20} className="text-purple-400" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-normal text-foreground">
                Share Creative
              </p>
              <p className="text-xs text-muted-foreground">
                Get 10 credits each
              </p>
            </div>
          </div>
        </button>

        {/* Upgrade to Pro */}
        <button className="w-full px-3 py-3 rounded-xl bg-gradient-to-r from-blue-600/15 to-purple-600/15 border border-border hover:border-sidebar-ring/30 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-blue-400" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-normal text-foreground">
                Upgrade to Pro
              </p>
              <p className="text-xs text-muted-foreground">
                Unlock more benefits
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Footer: User avatar + Inbox */}
      <div className="py-3 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-medium text-[10px] border border-blue-500/15 flex-shrink-0">
            {initials}
          </div>
          <span className="text-sm text-sidebar-foreground truncate min-w-0">
            {displayName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md flex-shrink-0"
        >
          <Bell size={20} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
