"use client"

import { useMemo } from "react"
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  Package,
  FileCode,
  Server,
  Clock,
  Zap,
  FolderOpen,
  Download,
  Rocket,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { PHASE_CONFIG, TOOL_PHASES, type ToolProgressPhase } from "@/lib/ai/stream-progress"
import type { ToolProgress as ToolProgressType } from "@/hooks/use-chat-with-tools"

interface ToolProgressProps {
  toolName: string
  progress?: ToolProgressType
  className?: string
}

// Icon mapping for phases
const PHASE_ICONS: Record<ToolProgressPhase, React.ElementType> = {
  "initializing": Zap,
  "creating-sandbox": Package,
  "checking-project": FolderOpen,
  "scaffolding": FolderOpen,
  "writing-files": FileCode,
  "installing-dependencies": Download,
  "starting-server": Rocket,
  "waiting-for-server": Clock,
  "complete": CheckCircle,
  "error": XCircle,
}

export function ToolProgressIndicator({ toolName, progress, className }: ToolProgressProps) {
  // Get the phases for this tool
  const phases = TOOL_PHASES[toolName] || ["initializing", "complete"]
  
  // Determine current phase index
  const currentPhaseIndex = useMemo(() => {
    if (!progress) return 0
    return phases.indexOf(progress.phase as ToolProgressPhase)
  }, [phases, progress])

  // Calculate overall progress percentage
  const overallProgress = useMemo(() => {
    if (progress?.progress !== undefined) return progress.progress
    if (currentPhaseIndex < 0) return 0
    return Math.round((currentPhaseIndex / (phases.length - 1)) * 100)
  }, [currentPhaseIndex, phases.length, progress?.progress])

  const isComplete = progress?.phase === "complete"
  const isError = progress?.phase === "error"

  return (
    <div className={cn("rounded-xl border border-zinc-700/50 bg-zinc-800/30 overflow-hidden", className)}>
      {/* Header with progress bar */}
      <div className="px-3 py-2.5 border-b border-zinc-700/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : isError ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            )}
            <span className="text-sm font-medium text-zinc-200">
              {formatToolName(toolName)}
            </span>
          </div>
          <span className={cn(
            "text-xs font-medium",
            isComplete ? "text-emerald-400" : isError ? "text-red-400" : "text-zinc-400"
          )}>
            {overallProgress}%
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="h-1.5 bg-zinc-700/50 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              isComplete ? "bg-emerald-500" : isError ? "bg-red-500" : "bg-blue-500"
            )}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Phase steps */}
      <div className="px-3 py-2 space-y-1">
        {phases.map((phase, index) => {
          const isCurrentPhase = progress?.phase === phase
          const isPastPhase = currentPhaseIndex > index
          const isFuturePhase = currentPhaseIndex < index
          const PhaseIcon = PHASE_ICONS[phase] || Circle

          return (
            <div
              key={phase}
              className={cn(
                "flex items-center gap-2 py-1 transition-opacity",
                isFuturePhase && "opacity-40"
              )}
            >
              {/* Phase status icon */}
              {isPastPhase ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              ) : isCurrentPhase ? (
                isError ? (
                  <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 flex-shrink-0" />
                )
              ) : (
                <Circle className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
              )}

              {/* Phase label */}
              <span className={cn(
                "text-xs",
                isPastPhase && "text-zinc-400",
                isCurrentPhase && !isError && "text-zinc-200 font-medium",
                isCurrentPhase && isError && "text-red-400 font-medium",
                isFuturePhase && "text-zinc-500"
              )}>
                {PHASE_CONFIG[phase]?.label || phase}
              </span>

              {/* Current phase detail */}
              {isCurrentPhase && progress?.detail && (
                <span className="text-[10px] text-zinc-500 truncate ml-auto max-w-[150px]">
                  {progress.detail}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Files written section */}
      {progress?.filesWritten && progress.filesWritten.length > 0 && (
        <div className="px-3 py-2 border-t border-zinc-700/30 bg-zinc-900/30">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">
            Files Written
          </div>
          <div className="flex flex-wrap gap-1">
            {progress.filesWritten.slice(-5).map((file, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400"
              >
                <FileCode className="h-2.5 w-2.5" />
                {file}
              </span>
            ))}
            {progress.filesWritten.length > 5 && (
              <span className="text-[10px] text-zinc-500 px-1">
                +{progress.filesWritten.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Compact inline progress indicator
export function InlineToolProgress({ progress }: { progress?: ToolProgressType }) {
  if (!progress) return null

  const isComplete = progress.phase === "complete"
  const isError = progress.phase === "error"

  return (
    <div className="flex items-center gap-2 text-xs">
      {isComplete ? (
        <CheckCircle className="h-3 w-3 text-emerald-400" />
      ) : isError ? (
        <XCircle className="h-3 w-3 text-red-400" />
      ) : (
        <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
      )}
      <span className={cn(
        isComplete && "text-emerald-400",
        isError && "text-red-400",
        !isComplete && !isError && "text-zinc-400"
      )}>
        {progress.message}
      </span>
      {progress.progress !== undefined && !isComplete && !isError && (
        <span className="text-zinc-500">({progress.progress}%)</span>
      )}
    </div>
  )
}

// Helper to format tool name for display
function formatToolName(toolName: string): string {
  return toolName
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (str) => str.toUpperCase())
}

export default ToolProgressIndicator
