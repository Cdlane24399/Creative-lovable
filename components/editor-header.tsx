"use client"

import { useState } from "react"
import { ChevronDown, Home, RefreshCw, ExternalLink, Github, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface EditorHeaderProps {
  onNavigateHome?: () => void
  sandboxUrl?: string | null
  onRefresh?: () => void
  isPreviewLoading?: boolean
}

export function EditorHeader({ onNavigateHome, sandboxUrl, onRefresh, isPreviewLoading }: EditorHeaderProps) {
  const [projectName] = useState("saas-landing-page")

  // Extract display URL from sandbox URL
  const displayUrl = sandboxUrl 
    ? sandboxUrl.replace(/^https?:\/\//, "").slice(0, 40) + (sandboxUrl.length > 50 ? "..." : "")
    : null

  return (
    <header className="flex h-14 items-center justify-between px-4 bg-[#111111]">
      {/* Left - Project Title Dropdown */}
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-xl px-3 text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <span className="text-sm font-medium">{projectName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 rounded-xl border-zinc-800 bg-zinc-900 p-1">
            <DropdownMenuItem
              onClick={onNavigateHome}
              className="gap-2 rounded-lg text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer"
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center - URL Bar (pill shaped) */}
      <div className="flex items-center">
        <div className="flex h-9 items-center gap-2 rounded-full border border-zinc-700/60 bg-transparent px-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={!sandboxUrl || isPreviewLoading}
            className="h-7 w-7 rounded-full text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300 disabled:opacity-50"
          >
            {isPreviewLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          <div className="flex items-center px-2 min-w-[180px]">
            {sandboxUrl ? (
              <span className="text-xs text-zinc-400 truncate">{displayUrl}</span>
            ) : (
              <>
                <span className="text-xs text-zinc-500">lovable.dev/projects/</span>
                <span className="text-xs text-zinc-400">{projectName}</span>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => sandboxUrl && window.open(sandboxUrl, "_blank")}
            disabled={!sandboxUrl}
            className="h-7 w-7 rounded-full text-zinc-500 hover:bg-zinc-700/50 hover:text-zinc-300 disabled:opacity-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Right - Profile & GitHub */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-300"
        >
          <Github className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 overflow-hidden rounded-full p-0 hover:ring-2 hover:ring-zinc-700"
        >
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-pink-500">
            <span className="text-xs font-medium text-white">U</span>
          </div>
        </Button>
      </div>
    </header>
  )
}
