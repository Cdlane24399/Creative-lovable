"use client"

import { useEffect, useRef } from "react"
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { type DevServerStatus } from "@/hooks/use-dev-server"

interface DevServerStatusProps {
  status: DevServerStatus
  isStarting: boolean
  isStopping: boolean
  error: string | null
  onRestart: () => void
  onAutoFix?: (errorDetails: string) => void
  className?: string
}

export function DevServerStatusIndicator({
  status,
  isStarting,
  isStopping,
  error,
  onRestart,
  onAutoFix,
  className,
}: DevServerStatusProps) {
  const lastErrorsRef = useRef<string[]>([])

  // Show toast for new errors
  useEffect(() => {
    if (status.errors.length > 0) {
      const newErrors = status.errors.filter(e => !lastErrorsRef.current.includes(e))
      
      for (const errorLine of newErrors.slice(0, 3)) {
        const errorDetails = status.errors.join("\n")
        
        toast.error("Build Error Detected", {
          description: errorLine.slice(0, 100) + (errorLine.length > 100 ? "..." : ""),
          duration: 10000,
          action: onAutoFix ? {
            label: "Auto-fix",
            onClick: () => onAutoFix(errorDetails),
          } : undefined,
        })
      }
      
      lastErrorsRef.current = status.errors
    }
  }, [status.errors, onAutoFix])

  // Show toast for general errors
  useEffect(() => {
    if (error) {
      toast.error("Dev Server Error", {
        description: error,
        duration: 8000,
        action: {
          label: "Retry",
          onClick: onRestart,
        },
      })
    }
  }, [error, onRestart])

  // Determine the current state
  const getState = () => {
    if (isStarting) return "starting"
    if (isStopping) return "stopping"
    if (error) return "error"
    if (status.errors.length > 0) return "build-error"
    if (status.isRunning) return "running"
    return "stopped"
  }

  const state = getState()

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Status Icon */}
      {state === "starting" && (
        <div className="flex items-center gap-2 text-amber-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Starting server...</span>
        </div>
      )}

      {state === "stopping" && (
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Stopping...</span>
        </div>
      )}

      {state === "running" && (
        <div className="flex items-center gap-2 text-emerald-500">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs">Server running</span>
        </div>
      )}

      {state === "build-error" && (
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs">Build errors</span>
          {onAutoFix && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
              onClick={() => onAutoFix(status.errors.join("\n"))}
            >
              <Wrench className="h-3 w-3 mr-1" />
              Fix
            </Button>
          )}
        </div>
      )}

      {state === "error" && (
        <div className="flex items-center gap-2 text-red-500">
          <XCircle className="h-4 w-4" />
          <span className="text-xs">Error</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10"
            onClick={onRestart}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {state === "stopped" && (
        <div className="flex items-center gap-2 text-zinc-500">
          <div className="h-2 w-2 rounded-full bg-zinc-500" />
          <span className="text-xs">Server stopped</span>
        </div>
      )}
    </div>
  )
}

/**
 * Generates a prompt for the AI to fix build errors
 */
export function generateAutoFixPrompt(errorDetails: string, projectName?: string): string {
  return `I'm seeing build errors in my project${projectName ? ` "${projectName}"` : ""}. Please analyze these errors and fix them:

\`\`\`
${errorDetails}
\`\`\`

Please:
1. Identify what's causing each error
2. Fix the issues by updating the relevant files
3. Explain what you changed and why

Focus on fixing the actual code issues, not just explaining them.`
}
