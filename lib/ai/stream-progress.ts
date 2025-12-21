/**
 * Stream Progress Utilities
 * 
 * Types and utilities for streaming real-time progress updates
 * from tool executions to the client via AI SDK data stream protocol.
 */

// Type for the data stream writer from createDataStreamResponse
interface DataStreamWriter {
  writeData: (data: unknown) => void
}

// Progress event types for different tools
export type ToolProgressPhase = 
  | "initializing"
  | "creating-sandbox"
  | "checking-project"
  | "scaffolding"
  | "writing-files"
  | "installing-dependencies"
  | "starting-server"
  | "waiting-for-server"
  | "complete"
  | "error"

export interface ToolProgressEvent {
  type: "tool-progress"
  toolCallId: string
  toolName: string
  phase: ToolProgressPhase
  message: string
  detail?: string
  progress?: number // 0-100 percentage
  timestamp: number
}

export interface TerminalOutputEvent {
  type: "terminal-output"
  toolCallId: string
  content: string
  stream: "stdout" | "stderr"
  timestamp: number
}

export interface FileWriteEvent {
  type: "file-write"
  toolCallId: string
  path: string
  action: "created" | "updated"
  timestamp: number
}

export type StreamEvent = ToolProgressEvent | TerminalOutputEvent | FileWriteEvent

// Phase configurations for UI display
export const PHASE_CONFIG: Record<ToolProgressPhase, { label: string; icon: string; estimatedMs: number }> = {
  "initializing": { label: "Initializing", icon: "⚡", estimatedMs: 500 },
  "creating-sandbox": { label: "Creating sandbox", icon: "📦", estimatedMs: 3000 },
  "checking-project": { label: "Checking project", icon: "🔍", estimatedMs: 1000 },
  "scaffolding": { label: "Setting up project structure", icon: "🏗️", estimatedMs: 2000 },
  "writing-files": { label: "Writing files", icon: "📝", estimatedMs: 5000 },
  "installing-dependencies": { label: "Installing dependencies", icon: "📥", estimatedMs: 30000 },
  "starting-server": { label: "Starting dev server", icon: "🚀", estimatedMs: 5000 },
  "waiting-for-server": { label: "Waiting for server", icon: "⏳", estimatedMs: 10000 },
  "complete": { label: "Complete", icon: "✅", estimatedMs: 0 },
  "error": { label: "Error", icon: "❌", estimatedMs: 0 },
}

// Tool-specific phase sequences
export const TOOL_PHASES: Record<string, ToolProgressPhase[]> = {
  createWebsite: [
    "initializing",
    "creating-sandbox",
    "checking-project",
    "scaffolding",
    "writing-files",
    "installing-dependencies",
    "starting-server",
    "waiting-for-server",
    "complete",
  ],
  writeFile: ["initializing", "writing-files", "complete"],
  editFile: ["initializing", "writing-files", "complete"],
  readFile: ["initializing", "complete"],
  installPackage: ["initializing", "installing-dependencies", "complete"],
  runCommand: ["initializing", "complete"],
  executeCode: ["initializing", "complete"],
  getProjectStructure: ["initializing", "complete"],
  getBuildStatus: ["initializing", "complete"],
}

/**
 * Creates a progress emitter for a specific tool execution
 */
export function createProgressEmitter(
  dataStream: DataStreamWriter | null,
  toolCallId: string,
  toolName: string
) {
  return {
    /**
     * Emit a progress update
     */
    emit(phase: ToolProgressPhase, message: string, detail?: string, progress?: number) {
      if (!dataStream) return

      const event: ToolProgressEvent = {
        type: "tool-progress",
        toolCallId,
        toolName,
        phase,
        message,
        detail,
        progress,
        timestamp: Date.now(),
      }

      dataStream.writeData(event)
    },

    /**
     * Emit terminal output
     */
    terminal(content: string, stream: "stdout" | "stderr" = "stdout") {
      if (!dataStream) return

      const event: TerminalOutputEvent = {
        type: "terminal-output",
        toolCallId,
        content,
        stream,
        timestamp: Date.now(),
      }

      dataStream.writeData(event)
    },

    /**
     * Emit file write notification
     */
    fileWrite(path: string, action: "created" | "updated") {
      if (!dataStream) return

      const event: FileWriteEvent = {
        type: "file-write",
        toolCallId,
        path,
        action,
        timestamp: Date.now(),
      }

      dataStream.writeData(event)
    },
  }
}

export type ProgressEmitter = ReturnType<typeof createProgressEmitter>

/**
 * Helper to get contextual status message based on tool input
 */
export function getContextualMessage(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "createWebsite": {
      const pages = (input.pages as Array<unknown>)?.length || 0
      const projectName = input.projectName as string || "project"
      return `Building "${projectName}" with ${pages} page(s)`
    }
    case "writeFile": {
      const path = input.path as string || "file"
      return `Writing ${path}`
    }
    case "editFile": {
      const path = input.path as string || "file"
      return `Editing ${path}`
    }
    case "readFile": {
      const path = input.path as string || "file"
      return `Reading ${path}`
    }
    case "installPackage": {
      const pkg = input.packageName as string || "package"
      return `Installing ${pkg}`
    }
    case "runCommand": {
      const cmd = (input.command as string || "").slice(0, 40)
      return cmd.length === 40 ? `Running: ${cmd}...` : `Running: ${cmd}`
    }
    case "executeCode": {
      const lang = input.language as string || "code"
      return `Executing ${lang} code`
    }
    case "getProjectStructure": {
      return "Analyzing project structure"
    }
    case "getBuildStatus": {
      return "Checking build status"
    }
    case "planChanges": {
      const steps = (input.steps as Array<unknown>)?.length || 0
      return `Creating plan with ${steps} steps`
    }
    case "analyzeProjectState": {
      return "Analyzing project state"
    }
    default:
      return `Running ${toolName}`
  }
}
