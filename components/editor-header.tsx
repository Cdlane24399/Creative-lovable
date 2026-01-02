"use client"

import { useState, useEffect } from "react"
import { ChevronDown, Home, Github, Save, Check, Layers, BarChart3, Plus, ExternalLink, Copy, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

export type EditorView = "preview" | "code" | "settings"

interface EditorHeaderProps {
  onNavigateHome?: () => void
  projectName?: string
  hasUnsavedChanges?: boolean
  onSave?: () => void
  sandboxUrl?: string | null
  currentView?: EditorView
  onViewChange?: (view: EditorView) => void
  isRefreshing?: boolean
  onRefresh?: () => void
}

export function EditorHeader({
  onNavigateHome,
  projectName = "Untitled Project",
  hasUnsavedChanges = false,
  onSave,
  sandboxUrl,
  currentView = "preview",
  onViewChange,
  isRefreshing = false,
  onRefresh,
}: EditorHeaderProps) {
  const [urlExpanded, setUrlExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  // Copy URL to clipboard
  const handleCopyUrl = () => {
    if (sandboxUrl) {
      navigator.clipboard.writeText(sandboxUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Close URL bar when clicking outside
  useEffect(() => {
    if (urlExpanded) {
      const handleClickOutside = () => setUrlExpanded(false)
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }
  }, [urlExpanded])

  return (
    <header className="flex h-14 items-center justify-between px-4 bg-[#111111] border-b border-zinc-800">
      {/* Left - Project Title Dropdown */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 rounded-xl px-3 text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
            >
              <span className="text-sm font-medium max-w-[200px] truncate">{projectName}</span>
              {hasUnsavedChanges && (
                <span className="w-2 h-2 rounded-full bg-amber-500" title="Unsaved changes" />
              )}
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
            {onSave && (
              <DropdownMenuItem
                onClick={onSave}
                disabled={!hasUnsavedChanges}
                className={cn(
                  "gap-2 rounded-lg text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer",
                  !hasUnsavedChanges && "opacity-50"
                )}
              >
                <Save className="h-4 w-4" />
                <span>Save Project</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Save status indicator */}
        {!hasUnsavedChanges && sandboxUrl && (
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Check className="h-3 w-3 text-emerald-500" />
            <span>Saved</span>
          </div>
        )}
      </div>

      {/* Center - Toggles & URL */}
      <div className="flex items-center justify-center flex-1 px-4">
        <div className="flex items-center gap-1 p-1 rounded-full bg-zinc-900/80 border border-zinc-800/50 h-9">
          {/* Preview toggle with green indicator */}
          <button
            onClick={() => onViewChange?.("preview")}
            className={cn(
              "relative flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all h-full",
              currentView === "preview"
                ? "bg-zinc-800 text-white shadow-none"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            Preview
          </button>

          {/* Icon toggles */}
          <button
            onClick={() => onViewChange?.("code")}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-full transition-all p-0",
              currentView === "code"
                ? "bg-zinc-800 text-white shadow-none"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
            title="Code"
          >
            <Layers className="h-4 w-4" />
          </button>

          <button
            onClick={() => onViewChange?.("settings")}
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-full transition-all p-0",
              currentView === "settings"
                ? "bg-zinc-800 text-white shadow-none"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
            title="Settings"
          >
            <BarChart3 className="h-4 w-4" />
          </button>

          {/* Add button */}
          <button
            type="button"
            className="flex items-center justify-center h-7 w-7 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
            title="Add"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Expandable URL bar */}
        <div className="relative ml-4" onClick={(e) => e.stopPropagation()}>
          <AnimatePresence mode="wait">
            {urlExpanded && sandboxUrl ? (
              <motion.div
                key="expanded"
                initial={{ width: 40, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 40, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/50 h-9"
              >
                {/* Refresh button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRefresh?.()
                  }}
                  disabled={!!isRefreshing}
                  className="flex items-center justify-center h-6 w-6 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all disabled:opacity-50"
                  title="Refresh"
                >
                  {isRefreshing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* URL display */}
                <span className="text-zinc-400 text-sm max-w-[300px] truncate select-all">
                  {sandboxUrl.replace(/^https?:\/\//, "")}
                </span>

                {/* Copy button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyUrl()
                  }}
                  className="flex items-center justify-center h-6 w-6 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Open external */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(sandboxUrl, "_blank")
                  }}
                  className="flex items-center justify-center h-6 w-6 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => sandboxUrl && setUrlExpanded(true)}
                disabled={!sandboxUrl}
                className={cn(
                  "flex items-center justify-center px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800/50 transition-all h-9",
                  sandboxUrl 
                    ? "text-zinc-400 hover:text-zinc-300 hover:border-zinc-700 cursor-pointer" 
                    : "text-zinc-600 cursor-not-allowed"
                )}
                title={sandboxUrl ? "Click to expand URL" : "No preview available"}
              >
                <span className="text-sm">/</span>
                {sandboxUrl && (
                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
              </motion.button>
            )}
          </AnimatePresence>
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
