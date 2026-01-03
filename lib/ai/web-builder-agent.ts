/**
 * Web Builder Agent - AI SDK v6 Beta ToolLoopAgent Implementation
 *
 * Provides deep context awareness and intelligent agentic flow for
 * building and iterating on web applications in E2B sandboxes.
 *
 * AI SDK v6 Features Used:
 * - Preliminary Tool Results: AsyncIterable for streaming progress
 * - Tool Input Lifecycle Hooks: onInputStart, onInputDelta, onInputAvailable
 * - Tool Execution Options: toolCallId, messages, abortSignal
 * - Context Awareness: Full project state tracking
 *
 * Best Practices Applied:
 * - Discriminated unions for tool progress states
 * - Custom error classes for structured error handling
 * - Const assertions for type safety
 * - Parallel operations where safe
 * - Comprehensive JSDoc documentation
 * - Zod schemas with detailed descriptions
 */

import { tool } from "ai"
import { z } from "zod"
import path from "node:path"
import {
  getAgentContext,
  updateFileInContext,
  recordToolExecution,
  updateBuildStatus,
  setProjectInfo,
  addDependency,
  setCurrentPlan,
  completeStep,
  generateContextSummary,
  getContextRecommendations,
} from "./agent-context"
import {
  createSandbox,
  createSandboxWithAutoPause,
  getCodeInterpreterSandbox,
  executeCode,
  writeFile as writeFileToSandbox,
  readFile as readFileFromSandbox,
  executeCommand,
  directoryExists,
  saveFilesSnapshot,
  type CodeLanguage,
} from "@/lib/e2b/sandbox"
import { quickSyncToDatabase } from "@/lib/e2b/sync-manager"

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of files to include in project structure scans */
const MAX_PROJECT_FILES = 50 as const

/** Maximum number of files to read contents for */
const MAX_FILE_CONTENTS = 10 as const

/** Maximum content preview length in bytes */
const MAX_CONTENT_PREVIEW = 1000 as const

/** Supported code languages for execution */
const SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "js", "ts"] as const

/** Tool execution phases for progress tracking */
const PHASES = {
  INIT: "init",
  SANDBOX: "sandbox",
  SCAFFOLD: "scaffold",
  FILES: "files",
  INSTALL: "install",
  COMPLETE: "complete",
  ERROR: "error",
} as const

// ============================================================================
// TYPES
// ============================================================================

/** Page definition for website creation */
interface PageDefinition {
  readonly path: string
  readonly content: string
  readonly action?: "create" | "update" | "delete"
}

/** Component definition for website creation */
interface ComponentDefinition {
  readonly name: string
  readonly content: string
  readonly action?: "create" | "update" | "delete"
}

/** Result type for tool operations */
type ToolResult<T = Record<string, unknown>> =
  | ({ success: true } & T)
  | { success: false; error: string }

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

/**
 * Base error class for web builder agent errors.
 * Provides structured error information for better debugging and user feedback.
 */
class WebBuilderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = "WebBuilderError"
  }
}

/** Error thrown when file path validation fails */
class InvalidPathError extends WebBuilderError {
  constructor(rawPath: string) {
    super(`Invalid file path: "${rawPath}"`, "INVALID_PATH", { rawPath })
    this.name = "InvalidPathError"
  }
}

/** Error thrown when sandbox operations fail */
class SandboxError extends WebBuilderError {
  constructor(operation: string, cause?: Error) {
    super(
      `Sandbox operation failed: ${operation}`,
      "SANDBOX_ERROR",
      { operation, cause: cause?.message }
    )
    this.name = "SandboxError"
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalizes a file path for sandbox operations.
 * Handles various path formats that AI models might generate.
 *
 * @param rawPath - The raw path string from tool input
 * @param stripPrefix - Optional prefix to strip from the path
 * @returns Normalized, validated path
 * @throws InvalidPathError if the path is invalid or attempts directory traversal
 */
function normalizeSandboxRelativePath(rawPath: string, stripPrefix?: string): string {
  // Normalize slashes and trim whitespace
  const raw = rawPath.trim().replaceAll("\\", "/")

  // Remove leading slashes and "./"
  let cleaned = raw.replace(/^\/+/, "").replace(/^\.\//, "")

  // Strip optional prefix
  if (stripPrefix && cleaned.startsWith(stripPrefix)) {
    cleaned = cleaned.slice(stripPrefix.length)
  }

  // Handle common AI model path mistakes - they sometimes include container paths
  const prefixesToStrip = ["app/", "components/"] as const
  for (const prefix of prefixesToStrip) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length)
      break // Only strip one prefix
    }
  }

  // Normalize and validate
  const normalized = path.posix.normalize(cleaned)

  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new InvalidPathError(rawPath)
  }

  return normalized
}

/**
 * Creates a standardized error result for tool responses.
 * Ensures consistent error formatting across all tools.
 */
function createErrorResult(error: unknown, context?: Record<string, unknown>): ToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    success: false,
    error: message,
    ...context,
  }
}

/**
 * Measures execution time and returns formatted duration.
 */
function formatDuration(startTime: Date): string {
  const ms = Date.now() - startTime.getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * Type guard to check if a value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/** Schema for plan steps - validates non-empty array of non-empty strings */
const planStepsSchema = z
  .array(z.string().min(1, "Step cannot be empty"))
  .min(1, "At least one step is required")
  .describe("Ordered list of discrete steps to accomplish the goal")

/** Schema for file path - validates reasonable path format */
const filePathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .max(256, "Path too long")
  .refine((p) => !p.includes(".."), "Path cannot contain '..'")
  .describe("File path relative to project root (e.g., 'app/page.tsx', 'components/Button.tsx')")

/** Schema for project name - descriptive, lowercase with hyphens */
const projectNameSchema = z
  .string()
  .min(1, "Project name required")
  .max(64, "Project name too long")
  .regex(/^[a-z][a-z0-9-]*$/, "Must be lowercase, start with letter, contain only letters, numbers, and hyphens")
  .describe("Descriptive project name based on user's request (lowercase with hyphens, e.g., 'coffee-shop-landing', 'portfolio-site', 'fitness-tracker'). NEVER use generic names like 'project' or 'my-app'.")

/** Schema for page definition */
const pageSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine((p) => !p.includes(".."), "Page path cannot contain '..' - use the 'components' array for components")
    .describe("Page path relative to app directory (e.g., 'page.tsx', 'about/page.tsx'). Do NOT use '../' paths - components belong in the 'components' array."),
  content: z.string().min(1).describe("Full React/Next.js page component code"),
  action: z
    .enum(["create", "update", "delete"])
    .optional()
    .default("create")
    .describe("Action to perform on this page"),
})

/** Schema for component definition */
const componentSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("Component file name (e.g., 'Button.tsx', 'ui/Card.tsx')"),
  content: z.string().min(1).describe("React component code"),
  action: z
    .enum(["create", "update", "delete"])
    .optional()
    .default("create")
    .describe("Action to perform on this component"),
})

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Creates context-aware tools for the web builder agent.
 * Each tool automatically tracks execution in the AgentContext.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing all available tools
 */
export function createContextAwareTools(projectId: string) {
  // Helper to get current context
  const ctx = () => getAgentContext(projectId)

  return {
    // =========================================================================
    // PLANNING TOOLS
    // =========================================================================

    /**
     * Creates a detailed plan for implementing features or changes.
     * Use FIRST before starting complex multi-step tasks.
     */
    planChanges: tool({
      description:
        "Create a detailed plan for implementing a feature or making changes. " +
        "Use this FIRST before starting complex tasks to break them into manageable steps. " +
        "Each step should be a discrete, verifiable action.",
      inputSchema: z.object({
        goal: z
          .string()
          .min(1)
          .max(500)
          .describe("The overall goal or feature to implement - be specific and measurable"),
        steps: planStepsSchema,
      }),
      execute: async ({ goal, steps }) => {
        const startTime = new Date()

        try {
          setCurrentPlan(projectId, steps)

          recordToolExecution(
            projectId,
            "planChanges",
            { goal, steps },
            { success: true },
            true,
            undefined,
            startTime
          )

          return {
            success: true,
            goal,
            totalSteps: steps.length,
            steps,
            message: `Plan created with ${steps.length} steps. Execute steps sequentially and mark each complete.`,
            nextStep: steps[0],
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Planning failed"
          recordToolExecution(projectId, "planChanges", { goal, steps }, undefined, false, errorMsg, startTime)
          return createErrorResult(error)
        }
      },
    }),

    /**
     * Marks a planned step as complete with optional notes.
     * Use after finishing each step to track progress.
     */
    markStepComplete: tool({
      description:
        "Mark a planned step as complete. Use this after finishing each step in your plan. " +
        "Provides progress tracking and shows remaining steps.",
      inputSchema: z.object({
        step: z.string().min(1).describe("Description of the completed step (should match plan)"),
        notes: z
          .string()
          .max(500)
          .optional()
          .describe("Optional notes about implementation details or issues encountered"),
      }),
      execute: async ({ step, notes }) => {
        const startTime = new Date()

        try {
          completeStep(projectId, step)
          const context = ctx()

          const totalSteps = context.currentPlan?.length ?? 0
          const completedCount = context.completedSteps.length
          const remainingSteps = context.currentPlan?.slice(completedCount) ?? []

          const result = {
            success: true,
            completedStep: step,
            progress: `${completedCount}/${totalSteps}`,
            progressPercent: totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 100,
            remainingSteps,
            nextStep: remainingSteps[0] ?? null,
            notes,
            isComplete: remainingSteps.length === 0,
          }

          recordToolExecution(projectId, "markStepComplete", { step, notes }, result, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to mark step complete"
          recordToolExecution(projectId, "markStepComplete", { step }, undefined, false, errorMsg, startTime)
          return createErrorResult(error)
        }
      },
    }),

    // =========================================================================
    // STATE AWARENESS TOOLS
    // =========================================================================

    /**
     * Analyzes the current state of the project.
     * Use to understand context before making decisions.
     */
    analyzeProjectState: tool({
      description:
        "Analyze the current state of the project including files, build status, " +
        "server state, and recent errors. Use this to understand what's happening " +
        "before making decisions or when debugging issues.",
      inputSchema: z.object({
        includeFileContents: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include content previews of recently modified files (first 1KB each)"),
      }),
      execute: async ({ includeFileContents }) => {
        const startTime = new Date()

        try {
          const context = ctx()
          const summary = generateContextSummary(projectId)
          const recommendations = getContextRecommendations(projectId)

          const result: Record<string, unknown> = {
            success: true,
            summary,
            recommendations,
            stats: {
              filesTracked: context.files.size,
              dependenciesTracked: context.dependencies.size,
            },
            buildStatus: context.buildStatus,
            serverState: context.serverState,
            recentErrors: context.errorHistory.slice(-5),
            planProgress: context.currentPlan
              ? {
                total: context.currentPlan.length,
                completed: context.completedSteps.length,
                remaining: context.currentPlan.length - context.completedSteps.length,
                nextStep: context.currentPlan[context.completedSteps.length] ?? null,
                completedSteps: context.completedSteps,
              }
              : null,
          }

          // Optionally include file content previews
          if (includeFileContents && context.files.size > 0) {
            const recentFiles: Record<string, string> = {}
            const entries = Array.from(context.files.entries()).slice(-5)

            for (const [filePath, info] of entries) {
              if (info.content) {
                recentFiles[filePath] = info.content.slice(0, MAX_CONTENT_PREVIEW)
              }
            }

            result.recentFileContents = recentFiles
          }

          recordToolExecution(
            projectId,
            "analyzeProjectState",
            { includeFileContents },
            result,
            true,
            undefined,
            startTime
          )

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Analysis failed"
          recordToolExecution(
            projectId,
            "analyzeProjectState",
            { includeFileContents },
            undefined,
            false,
            errorMsg,
            startTime
          )
          return createErrorResult(error)
        }
      },
    }),

    // =========================================================================
    // FILE OPERATIONS
    // =========================================================================

    /**
     * Writes content to a file in the project sandbox.
     * Creates parent directories automatically.
     */
    writeFile: tool({
      description:
        "Write content to a file in the project sandbox. Creates parent directories " +
        "if they don't exist. Use for creating new files or completely replacing existing ones.",
      inputSchema: z.object({
        path: filePathSchema,
        content: z.string().describe("Complete file content to write"),
      }),
      execute: async ({ path: filePath, content }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${context.projectName || "project"}`
        const fullPath = `${projectDir}/${filePath}`

        try {
          const sandbox = await createSandbox(projectId)

          // Ensure parent directory exists
          const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
          await executeCommand(sandbox, `mkdir -p "${dir}"`)

          await writeFileToSandbox(sandbox, fullPath, content)

          // Track file state
          const isNew = !context.files.has(filePath)
          updateFileInContext(projectId, filePath, content, isNew ? "created" : "updated")

          const result = {
            success: true as const,
            path: filePath,
            action: isNew ? ("created" as const) : ("updated" as const),
            bytes: content.length,
            message: `File ${isNew ? "created" : "updated"}: ${filePath}`,
          }

          recordToolExecution(projectId, "writeFile", { path: filePath }, result, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Write failed"
          recordToolExecution(projectId, "writeFile", { path: filePath }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { path: filePath })
        }
      },
    }),

    /**
     * Reads content from a file in the project sandbox.
     * Caches content in context for future reference.
     */
    readFile: tool({
      description:
        "Read content from a file in the project sandbox. Use to examine existing " +
        "code before making edits or to understand project structure.",
      inputSchema: z.object({
        path: filePathSchema,
      }),
      execute: async ({ path: filePath }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${context.projectName || "project"}`
        const fullPath = `${projectDir}/${filePath}`

        try {
          const sandbox = await createSandbox(projectId)
          const result = await readFileFromSandbox(sandbox, fullPath)

          // Cache in context
          updateFileInContext(projectId, filePath, result.content)

          const successResult = {
            success: true as const,
            path: filePath,
            content: result.content,
            length: result.content.length,
            lines: result.content.split("\n").length,
          }

          recordToolExecution(
            projectId,
            "readFile",
            { path: filePath },
            { success: true, length: result.content.length },
            true,
            undefined,
            startTime
          )

          return successResult
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Read failed"
          recordToolExecution(projectId, "readFile", { path: filePath }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { path: filePath })
        }
      },
    }),

    /**
     * Edits specific content in a file using search and replace.
     * More precise than rewriting entire files.
     */
    editFile: tool({
      description:
        "Edit specific content in a file using search and replace. Use for targeted " +
        "modifications when you only need to change part of a file. The search text " +
        "must appear exactly once in the file.",
      inputSchema: z.object({
        path: filePathSchema,
        search: z
          .string()
          .min(1)
          .describe("Exact text to find in the file - must be unique within the file"),
        replace: z.string().describe("New text to replace the search text with"),
      }),
      execute: async ({ path: filePath, search, replace }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${context.projectName || "project"}`
        const fullPath = `${projectDir}/${filePath}`

        try {
          const sandbox = await createSandbox(projectId)

          // Read current content
          const { content } = await readFileFromSandbox(sandbox, fullPath)

          // Validate search text exists and is unique
          const occurrences = content.split(search).length - 1

          if (occurrences === 0) {
            const error = `Search text not found in ${filePath}`
            recordToolExecution(projectId, "editFile", { path: filePath, search }, undefined, false, error, startTime)
            return { success: false, error, path: filePath }
          }

          if (occurrences > 1) {
            const error = `Search text appears ${occurrences} times in ${filePath}. It must be unique. Add more context to your search string.`
            recordToolExecution(projectId, "editFile", { path: filePath, search }, undefined, false, error, startTime)
            return { success: false, error, path: filePath }
          }

          // Perform replacement
          const newContent = content.replace(search, replace)
          await writeFileToSandbox(sandbox, fullPath, newContent)

          // Update context
          updateFileInContext(projectId, filePath, newContent, "updated")

          const result = {
            success: true as const,
            path: filePath,
            linesChanged: Math.abs(search.split("\n").length - replace.split("\n").length) || 1,
            message: `Successfully edited ${filePath}`,
          }

          recordToolExecution(projectId, "editFile", { path: filePath, search }, result, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Edit failed"
          recordToolExecution(projectId, "editFile", { path: filePath, search }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { path: filePath })
        }
      },
    }),

    // =========================================================================
    // PROJECT MANAGEMENT
    // =========================================================================

    /**
     * Gets the file tree and optionally key file contents.
     * Use to understand existing project structure.
     */
    getProjectStructure: tool({
      description:
        "Get the file tree and optionally key file contents of the current project. " +
        "Use to understand existing project structure before making changes.",
      inputSchema: z.object({
        includeContents: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include file contents for key files (up to 10 files)"),
      }),
      execute: async ({ includeContents }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectName = context.projectName || "project"
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${projectName}`

        try {
          const sandbox = await createSandbox(projectId)

          // Get file tree - exclude node_modules and .next
          const treeResult = await executeCommand(
            sandbox,
            `cd "${projectDir}" && find . -type f \\( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" -o -name "*.css" -o -name "*.json" \\) ! -path "*/node_modules/*" ! -path "*/.next/*" 2>/dev/null | sort | head -${MAX_PROJECT_FILES}`
          )

          const files = treeResult.stdout
            .split("\n")
            .filter(Boolean)
            .map((f) => f.replace("./", ""))

          // Update context with project info
          setProjectInfo(projectId, { projectName, projectDir })

          let contents: Record<string, string> | undefined

          if (includeContents && files.length > 0) {
            contents = {}

            // Read contents in parallel for better performance
            const filesToRead = files.slice(0, MAX_FILE_CONTENTS)
            const readPromises = filesToRead.map(async (file) => {
              try {
                const { content } = await readFileFromSandbox(sandbox, `${projectDir}/${file}`)
                updateFileInContext(projectId, file, content)
                return { file, content }
              } catch {
                return { file, content: null }
              }
            })

            const results = await Promise.all(readPromises)
            for (const { file, content } of results) {
              if (content) {
                contents[file] = content
              }
            }
          }

          const result = {
            success: true as const,
            projectName,
            projectDir,
            files,
            fileCount: files.length,
            contents,
            filesByType: categorizeFiles(files),
          }

          recordToolExecution(
            projectId,
            "getProjectStructure",
            { projectName },
            { fileCount: files.length },
            true,
            undefined,
            startTime
          )

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to scan project"
          recordToolExecution(projectId, "getProjectStructure", { projectName }, undefined, false, errorMsg, startTime)
          return createErrorResult(error)
        }
      },
    }),

    // =========================================================================
    // BUILD & SERVER
    // =========================================================================

    /**
     * Runs a shell command in the sandbox.
     * Automatically tracks npm installs for dependency awareness.
     */
    runCommand: tool({
      description:
        "Run a shell command in the sandbox (e.g., npm install, npm run build). " +
        "Use for any command-line operations. npm installs are automatically tracked.",
      inputSchema: z.object({
        command: z
          .string()
          .min(1)
          .max(1000)
          .describe("Shell command to execute"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to /home/user/ (defaults to project directory)"),
        timeout: z
          .number()
          .optional()
          .default(60000)
          .describe("Command timeout in milliseconds (default: 60000)"),
      }),
      execute: async ({ command, cwd, timeout }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const defaultDir = hasTemplate ? "/home/user/project" : (context.projectDir || "/home/user")
        const workDir = cwd ? `/home/user/${cwd}` : defaultDir
        const fullCommand = `cd "${workDir}" && ${command}`

        try {
          const sandbox = await createSandbox(projectId)
          const result = await executeCommand(sandbox, fullCommand, { timeoutMs: timeout })

          // Track npm install for dependency awareness
          if (command.includes("npm install") && result.exitCode === 0) {
            const packageMatch = command.match(/npm install\s+(?:--save-dev\s+)?(.+)$/)
            if (packageMatch) {
              const packages = packageMatch[1].split(/\s+/).filter((pkg) => pkg && !pkg.startsWith("-"))
              packages.forEach((pkg) => addDependency(projectId, pkg, "latest"))
            }
          }

          const success = result.exitCode === 0

          recordToolExecution(
            projectId,
            "runCommand",
            { command, cwd },
            { exitCode: result.exitCode },
            success,
            success ? undefined : result.stderr,
            startTime
          )

          return {
            success,
            command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            duration: formatDuration(startTime),
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Command failed"
          recordToolExecution(projectId, "runCommand", { command }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { command })
        }
      },
    }),

    /**
     * Installs npm packages in the current project.
     * Tracks installed packages in context.
     */
    installPackage: tool({
      description:
        "Install npm packages in the current project. Automatically tracks " +
        "installed packages for context awareness.",
      inputSchema: z.object({
        packages: z
          .array(z.string().min(1))
          .min(1)
          .describe("Package names to install (e.g., ['lodash', 'axios'])"),
        dev: z
          .boolean()
          .optional()
          .default(false)
          .describe("Install as dev dependency (--save-dev)"),
      }),
      execute: async ({ packages, dev }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${context.projectName || "project"}`
        const flag = dev ? "--save-dev" : "--save"

        try {
          const sandbox = await createSandbox(projectId)
          const packageList = packages.join(" ")
          const result = await executeCommand(sandbox, `cd "${projectDir}" && npm install ${flag} ${packageList}`)

          const success = result.exitCode === 0

          if (success) {
            packages.forEach((pkg) => addDependency(projectId, pkg, "latest"))
          }

          recordToolExecution(
            projectId,
            "installPackage",
            { packages, dev },
            { success },
            success,
            success ? undefined : result.stderr,
            startTime
          )

          return {
            success,
            packages,
            dev,
            message: success ? `Installed: ${packages.join(", ")}` : `Failed: ${result.stderr}`,
            duration: formatDuration(startTime),
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Installation failed"
          recordToolExecution(projectId, "installPackage", { packages }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { packages })
        }
      },
    }),

    /**
     * Checks build/compile status and retrieves errors from dev server logs.
     * Use to diagnose build issues.
     */
    getBuildStatus: tool({
      description:
        "Check build/compile status and get errors from dev server logs. " +
        "Use this to diagnose issues after making changes or when the preview shows errors.",
      inputSchema: z.object({
        logLines: z
          .number()
          .optional()
          .default(100)
          .describe("Number of log lines to retrieve (default: 100)"),
      }),
      execute: async ({ logLines }) => {
        const startTime = new Date()

        try {
          const sandbox = await createSandbox(projectId)
          const logsResult = await executeCommand(
            sandbox,
            `tail -n ${logLines} /tmp/server.log 2>/dev/null || echo "No server logs found"`
          )
          const logs = logsResult.stdout

          // Parse for errors and warnings with better regex
          const errorPatterns = [/Error:/i, /\berror\b/i, /ERROR/, /Failed to compile/i, /Module not found/i]
          const warningPatterns = [/\bwarn(ing)?\b/i, /Warning:/i]

          const lines = logs.split("\n")

          const errorLines = lines.filter((line) => errorPatterns.some((pattern) => pattern.test(line)))
          const warningLines = lines.filter(
            (line) => warningPatterns.some((pattern) => pattern.test(line)) && !errorPatterns.some((p) => p.test(line))
          )

          const hasErrors = errorLines.length > 0
          const hasWarnings = warningLines.length > 0

          // Update context
          updateBuildStatus(projectId, {
            hasErrors,
            hasWarnings,
            errors: errorLines.slice(0, 5),
            warnings: warningLines.slice(0, 3),
          })

          const result = {
            success: true,
            hasErrors,
            hasWarnings,
            errorCount: errorLines.length,
            warningCount: warningLines.length,
            errors: errorLines.slice(0, 5),
            warnings: warningLines.slice(0, 3),
            recentLogs: logs.slice(-2000),
            recommendation: hasErrors
              ? "PRIORITY: Fix build errors before proceeding. Check the error messages above."
              : hasWarnings
                ? "Consider addressing warnings, but they won't block the build."
                : "Build looks healthy. Ready to proceed.",
          }

          recordToolExecution(projectId, "getBuildStatus", {}, { hasErrors, hasWarnings }, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Status check failed"
          recordToolExecution(projectId, "getBuildStatus", {}, undefined, false, errorMsg, startTime)
          return createErrorResult(error)
        }
      },
    }),

    /**
     * @deprecated Dev server is now managed automatically by the frontend.
     * Kept for backward compatibility but should not be called.
     */
    startDevServer: tool({
      description:
        "DEPRECATED: Do not use this tool. The dev server is started automatically " +
        "by the application. Use createWebsite to write files instead.",
      inputSchema: z.object({
        port: z.number().optional().describe("Port number (ignored - server managed automatically)"),
      }),
      execute: async () => {
        const context = ctx()
        const projectName = context.projectName || "project"

        // Just update context - the frontend handles server management
        setProjectInfo(projectId, { projectName, projectDir: `/home/user/${projectName}` })

        return {
          success: true,
          message:
            "Dev server is managed automatically by the application. " +
            "Files are ready - the preview will appear shortly.",
          deprecated: true,
          note: "This tool is deprecated. Use createWebsite to write files instead.",
        }
      },
    }),

    // =========================================================================
    // WEBSITE CREATION
    // =========================================================================

    /**
     * Creates or updates a complete website with live preview.
     * Uses AI SDK v6 async generator for streaming progress updates.
     */
    createWebsite: tool({
      description:
        "Create or update a complete website with live preview. Use this for building " +
        "full web applications. Optimized for E2B custom templates with hot-reload support.",
      inputSchema: z.object({
        name: projectNameSchema,
        description: z
          .string()
          .min(1)
          .max(500)
          .describe("Description of the website - used for metadata and context"),
        pages: z
          .array(pageSchema)
          .min(1)
          .describe("Pages to create/update in the app directory"),
        components: z
          .array(componentSchema)
          .optional()
          .describe("Optional reusable components to create in the components directory"),
      }),

      // AI SDK v6: Tool input lifecycle hooks for streaming progress
      onInputStart: () => {
        console.log("[createWebsite] Tool input generation started")
      },

      onInputDelta: ({ inputTextDelta }) => {
        // Log progress for large inputs
        if (inputTextDelta.length > 100) {
          console.log(`[createWebsite] Receiving input: ${inputTextDelta.slice(0, 50)}...`)
        }
      },

      onInputAvailable: ({ input }) => {
        const projectName = isRecord(input) && typeof input.name === "string" ? input.name : "unknown"
        console.log(`[createWebsite] Input complete: ${projectName}`)
      },

      // AI SDK v6: Use async generator for preliminary results (streaming progress)
      async *execute({ name, description, pages, components }) {
        const startTime = new Date()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID

        // When using template, write directly to the template's project directory
        // This enables hot-reload without needing to restart the server
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${name}`

        console.log(
          `[createWebsite] Starting for project: ${name}, projectId: ${projectId}, projectDir: ${projectDir}`
        )

        // Yield initial progress
        yield {
          status: "loading" as const,
          phase: PHASES.INIT,
          message: `Creating website: ${name}`,
          detail: description,
        }

        try {
          // Create sandbox with auto-pause for cost savings
          console.log(`[createWebsite] Creating/getting sandbox for projectId: ${projectId}`)
          const sandbox = await createSandboxWithAutoPause(projectId)
          console.log(`[createWebsite] Got sandbox: ${sandbox.sandboxId}`)

          yield {
            status: "progress" as const,
            phase: PHASES.SANDBOX,
            message: "Sandbox ready",
            progress: 10,
          }

          // Helper to resolve app directory (supports both /app and /src/app)
          const resolveAppDir = async (): Promise<string> => {
            const hasSrcApp = await directoryExists(sandbox, `${projectDir}/src/app`)
            return hasSrcApp ? "src/app" : "app"
          }

          // Check if project exists
          const projectExists = await directoryExists(sandbox, projectDir)

          // Scaffold new project (only needed if not using template)
          if (!projectExists && !hasTemplate) {
            yield {
              status: "progress" as const,
              phase: PHASES.SCAFFOLD,
              message: "Creating project structure",
              progress: 20,
            }

            await scaffoldNextProject(sandbox, projectDir, name, description)
          }

          const appDir = await resolveAppDir()

          yield {
            status: "progress" as const,
            phase: PHASES.FILES,
            message: `Writing ${pages.length} pages${components?.length ? ` and ${components.length} components` : ""}`,
            progress: 40,
          }

          // Write pages
          await writePages(sandbox, projectDir, appDir, pages, projectId)

          // Write components
          if (components && components.length > 0) {
            await writeComponents(sandbox, projectDir, components, projectId)
          }

          // Install deps for new projects (only if not using template)
          if (!projectExists && !hasTemplate) {
            yield {
              status: "progress" as const,
              phase: PHASES.INSTALL,
              message: "Installing dependencies (this may take a few minutes)",
              progress: 50,
            }

            const installResult = await executeCommand(sandbox, `cd "${projectDir}" && npm install`, {
              timeoutMs: 300000, // 5 minutes for npm install
            })

            if (installResult.exitCode !== 0) {
              throw new SandboxError(`npm install failed: ${installResult.stderr}`)
            }

            yield {
              status: "progress" as const,
              phase: PHASES.INSTALL,
              message: "Dependencies installed",
              progress: 70,
            }
          }

          yield {
            status: "progress" as const,
            phase: PHASES.FILES,
            message: "Files written successfully",
            progress: 90,
          }

          // Update context with project info
          setProjectInfo(projectId, { projectName: name, projectDir, sandboxId: sandbox.sandboxId })

          // Save files snapshot for restoration after sandbox expiration
          // Use quickSyncToDatabase to read files directly from sandbox (more reliable than in-memory context)
          console.log(`[createWebsite] Starting file sync for project ${projectId}, dir: ${projectDir}`)
          try {
            const syncResult = await quickSyncToDatabase(sandbox, projectId, projectDir)
            console.log(`[createWebsite] Sync completed: ${syncResult.filesWritten} files synced, success: ${syncResult.success}`)
            if (syncResult.errors && syncResult.errors.length > 0) {
              console.warn("[createWebsite] Sync errors:", syncResult.errors)
            }
          } catch (err) {
            console.warn("[createWebsite] Failed to sync files to database:", err)
          }

          recordToolExecution(
            projectId,
            "createWebsite",
            { name, description },
            { projectName: name, projectDir },
            true,
            undefined,
            startTime
          )

          const totalTime = Date.now() - startTime.getTime()
          const performanceNote =
            hasTemplate && !projectExists
              ? ` (⚡ Template-optimized: ${(totalTime / 1000).toFixed(1)}s vs ~180s without template)`
              : ""

          // AI SDK v6: Final yield is the actual tool result
          yield {
            status: "success" as const,
            phase: PHASES.COMPLETE,
            message: `Website ${projectExists ? "updated" : "created"}! Starting preview...`,
            progress: 100,
            // Full result data
            success: true,
            projectName: name,
            projectDir,
            sandboxId: sandbox.sandboxId,
            pagesCreated: pages.map((p) => p.path),
            componentsCreated: components?.map((c) => c.name) ?? [],
            isNewProject: !projectExists,
            usedTemplate: hasTemplate && !projectExists,
            totalTimeMs: totalTime,
            detail: `Files written successfully${performanceNote}. Dev server starting automatically...`,
            filesReady: true,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to create website"
          recordToolExecution(projectId, "createWebsite", { name, description }, undefined, false, errorMsg, startTime)

          // AI SDK v6: Yield error as final result
          yield {
            status: "error" as const,
            phase: PHASES.ERROR,
            message: "Failed to create website",
            detail: errorMsg,
            success: false,
            error: errorMsg,
          }
        }
      },
    }),

    // =========================================================================
    // CODE EXECUTION
    // =========================================================================

    /**
     * Executes Python, JavaScript, or TypeScript code in a secure sandbox.
     * Python code uses optimized Code Interpreter for better output handling.
     */
    executeCode: tool({
      description:
        "Execute Python, JavaScript, or TypeScript code in a secure sandbox. " +
        "Python code uses optimized Code Interpreter for better output handling.",
      inputSchema: z.object({
        code: z.string().min(1).describe("Code to execute"),
        language: z
          .enum(SUPPORTED_LANGUAGES)
          .optional()
          .default("python")
          .describe("Programming language (default: python)"),
        useCodeInterpreter: z
          .boolean()
          .optional()
          .default(true)
          .describe("Use Code Interpreter for Python (better output handling)"),
      }),
      execute: async ({ code, language = "python", useCodeInterpreter = true }) => {
        const startTime = new Date()

        try {
          // Use Code Interpreter for Python if available and enabled
          const sandbox =
            useCodeInterpreter && language === "python"
              ? await getCodeInterpreterSandbox(projectId)
              : await createSandbox(projectId)

          const result = await executeCode(sandbox, code, language as CodeLanguage)

          const output = [...result.logs.stdout, ...result.logs.stderr].join("\n")
          const success = !result.error
          const usedCodeInterpreter = useCodeInterpreter && language === "python" && "runCode" in sandbox

          recordToolExecution(
            projectId,
            "executeCode",
            { language, useCodeInterpreter },
            { output, success, usedCodeInterpreter },
            success,
            result.error?.message,
            startTime
          )

          return {
            success,
            output,
            error: result.error?.message,
            language,
            usedCodeInterpreter,
            results: result.results ?? [],
            duration: formatDuration(startTime),
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Execution failed"
          recordToolExecution(projectId, "executeCode", { language }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { language })
        }
      },
    }),
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Categorizes files by extension for better project understanding.
 */
function categorizeFiles(files: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    pages: [],
    components: [],
    styles: [],
    config: [],
    other: [],
  }

  for (const file of files) {
    if (file.includes("/page.") || file === "page.tsx" || file === "page.jsx") {
      categories.pages.push(file)
    } else if (file.includes("components/") || file.includes("/components/")) {
      categories.components.push(file)
    } else if (file.endsWith(".css") || file.includes("styles")) {
      categories.styles.push(file)
    } else if (file.endsWith(".json") || file.endsWith(".config.ts") || file.endsWith(".config.js")) {
      categories.config.push(file)
    } else {
      categories.other.push(file)
    }
  }

  return categories
}

/**
 * Scaffolds a new Next.js project with all necessary configuration files.
 */
async function scaffoldNextProject(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  projectDir: string,
  name: string,
  description: string
): Promise<void> {
  // Create directory structure
  await executeCommand(sandbox, `mkdir -p "${projectDir}/app" "${projectDir}/components" "${projectDir}/public"`)

  // Package.json
  const packageJson = {
    name,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev -p 3000",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "15.0.0",
      react: "18.3.1",
      "react-dom": "18.3.1",
    },
    devDependencies: {
      autoprefixer: "^10.4.19",
      postcss: "^8.4.38",
      tailwindcss: "^3.4.3",
      typescript: "^5.4.5",
      "@types/node": "^20.12.7",
      "@types/react": "^18.2.79",
      "@types/react-dom": "^18.2.25",
    },
  }

  // Write config files in parallel for better performance
  await Promise.all([
    writeFileToSandbox(sandbox, `${projectDir}/package.json`, JSON.stringify(packageJson, null, 2)),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/tsconfig.json`,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2
      )
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/next.config.mjs`,
      `/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/tailwind.config.ts`,
      `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/postcss.config.js`,
      `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/app/globals.css`,
      `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
}
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/app/layout.tsx`,
      `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${name}",
  description: "${description}",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`
    ),
  ])
}

/**
 * Writes pages to the app directory.
 */
async function writePages(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  projectDir: string,
  appDir: string,
  pages: readonly PageDefinition[],
  projectId: string
): Promise<void> {
  for (const page of pages) {
    const action = page.action || "create"
    const normalizedPagePath = normalizeSandboxRelativePath(page.path, "app/")
    const pagePath = `${projectDir}/${appDir}/${normalizedPagePath}`

    if (action === "delete") {
      await executeCommand(sandbox, `rm -f "${pagePath}"`)
      updateFileInContext(projectId, `${appDir}/${normalizedPagePath}`, undefined, "deleted")
    } else {
      const pageDir = pagePath.substring(0, pagePath.lastIndexOf("/"))
      if (pageDir !== `${projectDir}/${appDir}`) {
        await executeCommand(sandbox, `mkdir -p "${pageDir}"`)
      }
      await writeFileToSandbox(sandbox, pagePath, page.content)
      updateFileInContext(projectId, `${appDir}/${normalizedPagePath}`, page.content, action === "create" ? "created" : "updated")
    }
  }
}

/**
 * Writes components to the components directory.
 */
async function writeComponents(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  projectDir: string,
  components: readonly ComponentDefinition[],
  projectId: string
): Promise<void> {
  for (const component of components) {
    const action = component.action || "create"
    const normalizedComponentName = normalizeSandboxRelativePath(component.name, "components/")
    const componentPath = `${projectDir}/components/${normalizedComponentName}`

    if (action === "delete") {
      await executeCommand(sandbox, `rm -f "${componentPath}"`)
      updateFileInContext(projectId, `components/${normalizedComponentName}`, undefined, "deleted")
    } else {
      const componentDir = componentPath.substring(0, componentPath.lastIndexOf("/"))
      if (componentDir !== `${projectDir}/components`) {
        await executeCommand(sandbox, `mkdir -p "${componentDir}"`)
      }
      await writeFileToSandbox(sandbox, componentPath, component.content)
      updateFileInContext(projectId, `components/${normalizedComponentName}`, component.content, action === "create" ? "created" : "updated")
    }
  }
}

// ============================================================================
// SYSTEM PROMPT GENERATION
// ============================================================================

/**
 * Generate enhanced system prompt with context awareness.
 * Adds project state information and recommendations to the base prompt.
 */
export function generateAgenticSystemPrompt(projectId: string, basePrompt: string): string {
  const summary = generateContextSummary(projectId)
  const recommendations = getContextRecommendations(projectId)

  const contextSection = summary !== "No context available yet."
    ? `\n\n## Current Project State\n${summary}`
    : ""

  const recommendationSection = recommendations.length > 0
    ? `\n\n## Recommendations\n${recommendations.map(r => `- ${r}`).join("\n")}`
    : ""

  const agenticAddendum = `

## Agentic Workflow Guidelines

You are an autonomous agent with deep awareness of project state. Follow these principles:

1. **Plan First**: For complex tasks, use \`planChanges\` to break work into steps
2. **Check State**: Use \`analyzeProjectState\` to understand current situation before acting
3. **Track Progress**: Use \`markStepComplete\` after finishing each planned step
4. **Fix Errors**: Always check \`getBuildStatus\` after changes and fix any errors
5. **Iterate**: Don't stop at first attempt - verify, fix, and improve

## Project Naming Guidelines

When creating new projects with \`createWebsite\`:
- ALWAYS use descriptive names based on the user's request
- Good examples: "coffee-shop-landing", "portfolio-site", "fitness-tracker", "restaurant-menu"
- BAD examples: "project", "my-app", "test", "website" (too generic!)
- Names should be lowercase with hyphens, no spaces or special characters
`

  return basePrompt + contextSection + recommendationSection + agenticAddendum
}
