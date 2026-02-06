/**
 * Website Tools - AI SDK v6 tools for website scaffolding and creation
 *
 * This module provides the createWebsite tool which uses AI SDK v6 async generators
 * for streaming progress updates during website creation. The tool handles:
 * - Creating or updating complete Next.js websites
 * - Sandbox management with auto-pause for cost savings
 * - Hot-reload support when using E2B templates
 * - File syncing to database for persistence
 *
 * AI SDK v6 Features Used:
 * - Preliminary Tool Results: AsyncIterable for streaming progress
 * - Tool Input Lifecycle Hooks: onInputStart, onInputDelta, onInputAvailable
 */

import { tool } from "ai"
import { z } from "zod"
import { projectNameSchema, pageSchema, componentSchema, PHASES } from "../schemas/tool-schemas"
import { getAgentContext, setProjectInfo, recordToolExecution } from "../agent-context"
import { directoryExists, executeCommand } from "@/lib/e2b/sandbox"
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider"
import { quickSyncToDatabaseWithRetry } from "@/lib/e2b/sync-manager"
import { isRecord } from "../utils"
import { scaffoldNextProject, writePages, writeComponents } from "../helpers"
import { SandboxError } from "../errors/web-builder-errors"

// ============================================================================
// TYPES
// ============================================================================

/**
 * Progress status for streaming updates
 */
type ProgressStatus = "loading" | "progress" | "success" | "error"

/**
 * Base progress result shape
 */
interface ProgressResult {
  status: ProgressStatus
  phase: string
  message: string
  detail?: string
  progress?: number
}

/**
 * Success result with full project details
 */
interface SuccessResult extends ProgressResult {
  status: "success"
  success: true
  projectName: string
  projectDir: string
  sandboxId: string
  pagesCreated: string[]
  componentsCreated: string[]
  isNewProject: boolean
  usedTemplate: boolean
  totalTimeMs: number
  syncStatus: {
    success: boolean
    filesWritten: number
    retryCount: number
  }
  filesReady: boolean
}

/**
 * Error result
 */
interface ErrorResult extends ProgressResult {
  status: "error"
  success: false
  error: string
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

/**
 * Creates website-related tools for the web builder agent.
 *
 * @deprecated Use createProjectInitTools + createBatchFileTools instead
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing the createWebsite tool
 */
export function createWebsiteTools(projectId: string) {
  return {
    /**
     * Creates or updates a complete website with live preview.
     * Uses AI SDK v6 async generator for streaming progress updates.
     * @deprecated Use initializeProject + batchWriteFiles + syncProject instead
     */
    createWebsite: tool({
      description:
        "DEPRECATED: Use initializeProject + batchWriteFiles + syncProject instead. " +
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
        console.warn("[DEPRECATED] createWebsite is deprecated. Use initializeProject + batchWriteFiles + syncProject instead.")
        const startTime = new Date()
        // Check if using E2B template (pre-built sandbox with dependencies)
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        // Always use consistent project directory for hot-reload and sync
        const projectDir = "/home/user/project"

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
          // Get sandbox from infrastructure context (created by withSandbox)
          console.log(`[createWebsite] Using sandbox from context for projectId: ${projectId}`)
          const sandbox = getCurrentSandbox()
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

            const installResult = await executeCommand(sandbox, `cd "${projectDir}" && pnpm install`, {
              timeoutMs: 300000, // 5 minutes for pnpm install
            })

            if (installResult.exitCode !== 0) {
              throw new SandboxError(`pnpm install failed: ${installResult.stderr}`)
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
          // Use quickSyncToDatabaseWithRetry for resilient syncing with automatic retries
          console.log(`[createWebsite] Starting file sync for project ${projectId}, dir: ${projectDir}`)
          let syncStatus = { success: false, filesWritten: 0, retryCount: 0 }
          try {
            const syncResult = await quickSyncToDatabaseWithRetry(sandbox, projectId, projectDir)
            syncStatus = {
              success: syncResult.success,
              filesWritten: syncResult.filesWritten,
              retryCount: syncResult.retryCount
            }
            console.log(`[createWebsite] Sync completed: ${syncResult.filesWritten} files synced, success: ${syncResult.success}, retries: ${syncResult.retryCount}`)
            if (syncResult.errors && syncResult.errors.length > 0) {
              console.warn("[createWebsite] Sync errors:", syncResult.errors)
            }
          } catch (err) {
            console.warn("[createWebsite] Failed to sync files to database after retries:", err)
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
            syncStatus,
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
  }
}
