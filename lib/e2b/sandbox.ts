import { Sandbox } from "e2b"
import { getSandboxStateMachine } from "./sandbox-state-machine"

// Type alias for CodeInterpreter sandbox
type CodeInterpreterSandbox = import("@e2b/code-interpreter").Sandbox

// Conditionally import CodeInterpreter to avoid Jest issues
let CodeInterpreter: typeof import("@e2b/code-interpreter").Sandbox | undefined
try {
  const codeInterpreterModule = require("@e2b/code-interpreter")
  CodeInterpreter = codeInterpreterModule.Sandbox
} catch {
  // CodeInterpreter not available
}

// Sandbox manager to track active sandboxes
const activeSandboxes = new Map<string, Sandbox>()
const codeInterpreterSandboxes = new Map<string, CodeInterpreterSandbox>()
const backgroundProcesses = new Map<string, any>() // projectId -> process handle
const pausedSandboxes = new Map<string, { sandboxId: string; pausedAt: Date }>() // projectId -> paused sandbox info

// Track connection attempts to prevent reconnection storms
const connectionAttempts = new Map<string, { count: number; lastAttempt: number }>()
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_COOLDOWN_MS = 5000 // 5 seconds between attempts

// Default timeout for sandboxes (10 minutes for website generation)
// Note: E2B default is 5 minutes, extended to 10 for:
// - npm install without templates (3-5 minutes)
// - Complex build processes
// - Multiple iterative operations
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

// TTL for idle sandboxes (30 minutes of inactivity)
const SANDBOX_TTL_MS = 30 * 60 * 1000

// Cleanup interval (check every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

// Track last activity for each sandbox
const sandboxLastActivity = new Map<string, number>()

// Get custom template ID from environment (optional)
const CUSTOM_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID

// Get state machine instance
const stateMachine = getSandboxStateMachine()

/**
 * Update last activity timestamp for a sandbox
 */
function updateSandboxActivity(projectId: string): void {
  sandboxLastActivity.set(projectId, Date.now())
}

/**
 * Clean up artifacts from create-next-app that break fresh package installations.
 * Called after sandbox creation when using a template to ensure clean state.
 */
async function cleanupTemplateArtifacts(sandbox: Sandbox): Promise<void> {
  try {
    // Remove pnpm-workspace.yaml which conflicts with non-monorepo setups
    await sandbox.commands.run('rm -f /home/user/project/pnpm-workspace.yaml', { timeoutMs: 5000 })

    // IMPORTANT: Write a valid JavaScript config instead of renaming TypeScript file
    // create-next-app generates next.config.ts with TypeScript syntax (import type { NextConfig })
    // which is NOT valid in .mjs files and causes "Unexpected token '{'" errors
    await sandbox.commands.run('rm -f /home/user/project/next.config.ts', { timeoutMs: 5000 })
    await sandbox.files.write(
      '/home/user/project/next.config.mjs',
      `/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
`
    )
    console.log('[Sandbox] Cleaned up template artifacts')
  } catch (error) {
    console.warn('[Sandbox] Failed to cleanup template artifacts:', error)
  }
}

/**
 * Check if a sandbox has exceeded its TTL
 */
function isSandboxExpired(projectId: string): boolean {
  const lastActivity = sandboxLastActivity.get(projectId)
  if (!lastActivity) return false
  return Date.now() - lastActivity > SANDBOX_TTL_MS
}

/**
 * Clean up expired sandboxes
 */
async function cleanupExpiredSandboxes(): Promise<void> {
  const expiredProjects: string[] = []

  // Find expired sandboxes
  for (const [projectId] of activeSandboxes) {
    if (isSandboxExpired(projectId)) {
      expiredProjects.push(projectId)
    }
  }

  // Clean up expired sandboxes - sync files first
  for (const projectId of expiredProjects) {
    console.log(`[Sandbox TTL] Cleaning up expired sandbox for project ${projectId}`)
    try {
      // Sync files to database before closing (best effort)
      const sandbox = activeSandboxes.get(projectId)
      if (sandbox) {
        try {
          const { quickSyncToDatabase } = await import("./sync-manager")
          console.log(`[Sandbox TTL] Syncing files before expiration for ${projectId}`)
          await quickSyncToDatabase(sandbox, projectId)
        } catch (syncError) {
          console.warn(`[Sandbox TTL] Failed to sync before expiration for ${projectId}:`, syncError)
        }
      }

      // Mark as expired in state machine
      stateMachine.markExpired(projectId)
      await closeSandbox(projectId)
      sandboxLastActivity.delete(projectId)
    } catch (error) {
      console.error(`[Sandbox TTL] Failed to cleanup sandbox for ${projectId}:`, error)
    }
  }

  if (expiredProjects.length > 0) {
    console.log(`[Sandbox TTL] Cleaned up ${expiredProjects.length} expired sandboxes`)
  }
}

/**
 * Start the cleanup interval with singleton pattern to work with Next.js HMR
 */
const CLEANUP_INTERVAL_KEY = "e2b_sandbox_cleanup_interval"

function startCleanupInterval(): void {
  const globalAny = globalThis as any

  if (globalAny[CLEANUP_INTERVAL_KEY]) {
    // Interval already running, don't start another one
    return
  }

  // Start new interval (silently - logging on every HMR reload is too noisy)
  globalAny[CLEANUP_INTERVAL_KEY] = setInterval(cleanupExpiredSandboxes, CLEANUP_INTERVAL_MS)
}

// Start cleanup on module load
if (typeof globalThis !== 'undefined') {
  startCleanupInterval()
}

// ============================================================
// DATABASE HELPERS FOR SANDBOX PERSISTENCE
// ============================================================

/**
 * Get sandbox ID from database for a project.
 * This enables sandbox reconnection across API route invocations.
 */
async function getSandboxIdFromDatabase(projectId: string): Promise<string | null> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories")
    const projectRepo = getProjectRepository()
    return await projectRepo.getSandboxId(projectId)
  } catch (error) {
    console.warn(`Failed to get sandbox ID from database for ${projectId}:`, error)
    return null
  }
}

/**
 * Save sandbox ID to database for a project.
 * This enables sandbox reconnection across API route invocations.
 * Uses UPSERT to handle the case where the project doesn't exist yet.
 */
async function saveSandboxIdToDatabase(projectId: string, sandboxId: string): Promise<void> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories")
    const projectRepo = getProjectRepository()
    await projectRepo.ensureExists(projectId)
    await projectRepo.updateSandbox(projectId, sandboxId)
    console.log(`[Sandbox] Saved sandbox ID ${sandboxId} to database for project ${projectId}`)
  } catch (error) {
    console.warn(`[Sandbox] Failed to save sandbox ID to database for ${projectId}:`, error)
  }
}

/**
 * Clear sandbox ID from database when sandbox is closed.
 */
async function clearSandboxIdFromDatabase(projectId: string): Promise<void> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories")
    const projectRepo = getProjectRepository()
    await projectRepo.updateSandbox(projectId, null)
  } catch (error) {
    console.warn(`Failed to clear sandbox ID from database for ${projectId}:`, error)
  }
}

/**
 * Interface for project snapshot data used for sandbox restoration.
 */
export interface ProjectSnapshot {
  files_snapshot: Record<string, string>
  dependencies: Record<string, string>
}

/**
 * Get project snapshot from database for sandbox restoration.
 * Returns files and dependencies that can be restored to a new sandbox.
 */
export async function getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories")
    const projectRepo = getProjectRepository()
    return await projectRepo.getFilesSnapshot(projectId)
  } catch (error) {
    console.warn(`Failed to get project snapshot for ${projectId}:`, error)
    return null
  }
}

/**
 * Save files snapshot to database for persistence across sandbox expirations.
 * This allows restoring project files when a new sandbox is created.
 *
 * @param projectId - Project ID to save snapshot for
 * @param files - Map of file paths to file contents
 * @param dependencies - Optional map of npm dependencies (package name -> version)
 */
export async function saveFilesSnapshot(
  projectId: string,
  files: Record<string, string>,
  dependencies?: Record<string, string>
): Promise<void> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories")
    const projectRepo = getProjectRepository()
    await projectRepo.saveFilesSnapshot(projectId, files, dependencies)
    console.log(`[Sandbox] Saved files snapshot for project ${projectId}: ${Object.keys(files).length} files`)
  } catch (error) {
    console.warn(`[Sandbox] Failed to save files snapshot for ${projectId}:`, error)
  }
}

/**
 * Restore files from a project snapshot to a sandbox.
 * Used when creating a new sandbox after the previous one expired.
 *
 * @param sandbox - The new sandbox to restore files to
 * @param snapshot - Project snapshot containing files and dependencies
 * @param projectDir - Project directory path (default: /home/user/project)
 * @returns Object with success status and counts
 */
async function restoreFilesFromSnapshot(
  sandbox: Sandbox,
  snapshot: ProjectSnapshot,
  projectDir: string = "/home/user/project"
): Promise<{ success: boolean; filesRestored: number; dependenciesInstalled: boolean }> {
  const result = { success: false, filesRestored: 0, dependenciesInstalled: false }

  try {
    const fileEntries = Object.entries(snapshot.files_snapshot)
    if (fileEntries.length === 0) {
      console.log("[Sandbox] No files to restore from snapshot")
      return { success: true, filesRestored: 0, dependenciesInstalled: false }
    }

    console.log(`[Sandbox] Restoring ${fileEntries.length} files from snapshot...`)

    // Create project directory if needed
    await sandbox.commands.run(`mkdir -p ${projectDir}`)

    // CRITICAL: Clear .next cache to ensure restored files are used
    // The E2B template may have pre-built files that would override restored content
    console.log("[Sandbox] Clearing .next cache to ensure fresh build...")
    await sandbox.commands.run(`rm -rf ${projectDir}/.next 2>/dev/null || true`)

    // Prepare files for batch write
    const filesToWrite = fileEntries.map(([path, content]) => ({
      path: path.startsWith("/") ? path : `${projectDir}/${path}`,
      content,
    }))

    // Write all files
    const writeResult = await writeFiles(sandbox, filesToWrite, { useNativeApi: true })
    result.filesRestored = writeResult.succeeded

    // Install dependencies if package.json exists and we have dependencies
    const hasDependencies = Object.keys(snapshot.dependencies || {}).length > 0
    const hasPackageJson = fileEntries.some(([path]) => path.endsWith("package.json"))

    if (hasDependencies && hasPackageJson) {
      console.log("[Sandbox] Installing dependencies...")
      const installResult = await executeCommand(sandbox, "pnpm install", {
        cwd: projectDir,
        timeoutMs: 600_000, // 10 minutes for pnpm install
      })
      result.dependenciesInstalled = installResult.exitCode === 0
      if (!result.dependenciesInstalled) {
        console.warn("[Sandbox] pnpm install failed:", installResult.stderr)
      }
    }

    result.success = true
    console.log(`[Sandbox] Restored ${result.filesRestored} files, dependencies installed: ${result.dependenciesInstalled}`)
    return result
  } catch (error) {
    console.error("[Sandbox] Failed to restore files from snapshot:", error)
    return result
  }
}

/**
 * Try to reconnect to an existing sandbox by ID with retry logic.
 * Returns the sandbox if successful, undefined otherwise.
 */
async function tryReconnectSandbox(sandboxId: string, projectId: string): Promise<Sandbox | undefined> {
  // Check if we've exceeded retry attempts
  const attempts = connectionAttempts.get(sandboxId)
  if (attempts) {
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt

    if (attempts.count >= MAX_RECONNECT_ATTEMPTS) {
      if (timeSinceLastAttempt < RECONNECT_COOLDOWN_MS) {
        console.warn(`[Sandbox] Reconnection rate-limited for ${sandboxId}, ${attempts.count} attempts`)
        return undefined
      }
      // Reset after cooldown
      connectionAttempts.set(sandboxId, { count: 1, lastAttempt: Date.now() })
    } else {
      connectionAttempts.set(sandboxId, {
        count: attempts.count + 1,
        lastAttempt: Date.now(),
      })
    }
  } else {
    connectionAttempts.set(sandboxId, { count: 1, lastAttempt: Date.now() })
  }

  try {
    console.log(`[Sandbox] Attempting to reconnect to sandbox ${sandboxId} for project ${projectId}`)

    const sandbox = await Sandbox.connect(sandboxId, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })

    // Test connection by extending timeout
    await sandbox.setTimeout(DEFAULT_TIMEOUT_MS)

    activeSandboxes.set(projectId, sandbox)

    // Reset connection attempts on success
    connectionAttempts.delete(sandboxId)

    // Update activity timestamp
    updateSandboxActivity(projectId)

    console.log(`[Sandbox] Successfully reconnected to sandbox ${sandboxId} for project ${projectId}`)
    return sandbox
  } catch (error) {
    console.warn(`[Sandbox] Failed to reconnect to sandbox ${sandboxId}:`, error)

    // Clear from database if reconnection fails
    await clearSandboxIdFromDatabase(projectId)

    return undefined
  }
}

// Supported languages for code execution
export type CodeLanguage = "python" | "javascript" | "typescript" | "js" | "ts"

// Sandbox metadata for tracking and debugging
export interface SandboxMetadata {
  projectId: string
  createdAt: Date
  template?: string
  purpose: "website" | "code-execution" | "general"
}

// Progress callback for streaming operations
export type ProgressCallback = (phase: string, message: string, detail?: string) => void

// Sandbox state for persistence (E2B Beta feature)
export interface SandboxState {
  sandboxId: string
  projectId: string
  isPaused: boolean
  pausedAt?: Date
}

/**
 * Creates or retrieves an existing sandbox for a project.
 * Sandboxes are isolated cloud environments for code execution.
 *
 * Priority order:
 * 1. Check in-memory cache
 * 2. Try to reconnect using sandbox ID from database
 * 3. Create a new sandbox, restore files from snapshot, and persist to database
 *
 * @param projectId - Unique identifier for the project
 * @param templateId - Optional custom template ID (overrides E2B_TEMPLATE_ID env var)
 * @param options - Optional configuration for sandbox creation
 * @param options.restoreFromSnapshot - Whether to restore files from snapshot (default: true)
 */
export async function createSandbox(
  projectId: string,
  templateId?: string,
  options?: { restoreFromSnapshot?: boolean }
): Promise<Sandbox> {
  const { restoreFromSnapshot = true } = options || {}
  console.log(`[Sandbox] createSandbox called for projectId: ${projectId}`)

  // 1. Check if sandbox already exists in memory for this project
  const existing = activeSandboxes.get(projectId)
  if (existing) {
    try {
      // Verify sandbox is still alive by extending timeout
      await existing.setTimeout(DEFAULT_TIMEOUT_MS)
      console.log(`[Sandbox] Reusing existing sandbox: ${existing.sandboxId}`)
      return existing
    } catch (error) {
      // Sandbox expired or errored, remove from cache
      console.log(`[Sandbox] Existing sandbox expired or unreachable, removing from cache:`, error)
      activeSandboxes.delete(projectId)
    }
  }

  // 2. Try to reconnect using sandbox ID from database
  // This handles the case where the sandbox was created in a different API route invocation
  const dbSandboxId = await getSandboxIdFromDatabase(projectId)
  console.log(`[Sandbox] Database sandbox ID for ${projectId}: ${dbSandboxId || 'none'}`)

  // Track if we need to restore (reconnection failed but we had a previous sandbox)
  let needsRestore = false

  if (dbSandboxId) {
    const reconnected = await tryReconnectSandbox(dbSandboxId, projectId)
    if (reconnected) {
      console.log(`[Sandbox] Successfully reconnected to sandbox: ${dbSandboxId}`)
      // Even if reconnection succeeds, we should restore files if requested
      // This handles the case where the sandbox exists but files were lost (e.g., template reset)
      if (restoreFromSnapshot) {
        const snapshot = await getProjectSnapshot(projectId)
        if (snapshot && Object.keys(snapshot.files_snapshot).length > 0) {
          console.log(`[Sandbox] Restoring files to reconnected sandbox to ensure content is current...`)
          const restoreResult = await restoreFilesFromSnapshot(reconnected, snapshot)
          console.log(`[Sandbox] Restore to reconnected sandbox complete: ${restoreResult.filesRestored} files`)
        }
      }
      return reconnected
    }
    console.log(`[Sandbox] Failed to reconnect, will create new sandbox and restore files`)
    needsRestore = restoreFromSnapshot // Only restore if reconnection failed (sandbox expired)
  }

  // 3. Create a new sandbox
  // Use provided template ID, or fall back to env var, or use default
  const template = templateId || CUSTOM_TEMPLATE_ID

  try {
    // Create new sandbox with configured timeout, optional template, and metadata
    // E2B SDK v2 best practice: Use Sandbox.create() with metadata for tracking
    const metadata: SandboxMetadata = {
      projectId,
      createdAt: new Date(),
      template,
      purpose: "website",
    }

    console.log(`[Sandbox] Creating new sandbox for project ${projectId}${template ? ` with template: ${template}` : ''}`)

    const sandbox = template
      ? await Sandbox.create(template, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        metadata: metadata as any, // E2B accepts Record<string, string>
      })
      : await Sandbox.create({
        timeoutMs: DEFAULT_TIMEOUT_MS,
        metadata: metadata as any,
      })

    activeSandboxes.set(projectId, sandbox)

    // Persist sandbox ID to database for cross-route reconnection
    await saveSandboxIdToDatabase(projectId, sandbox.sandboxId)

    // Reset connection attempts for this sandbox
    connectionAttempts.delete(sandbox.sandboxId)

    // Update activity timestamp
    updateSandboxActivity(projectId)

    // Log template usage for debugging
    console.log(`[Sandbox] Created NEW sandbox ${sandbox.sandboxId} for project ${projectId}${template ? ` using template: ${template}` : ''}`)

    // Clean up template artifacts that might interfere with package installation
    if (template) {
      await cleanupTemplateArtifacts(sandbox)
    }

    // 4. Restore files from snapshot if this is a replacement for an expired sandbox
    if (needsRestore) {
      const snapshot = await getProjectSnapshot(projectId)
      if (snapshot && Object.keys(snapshot.files_snapshot).length > 0) {
        console.log(`[Sandbox] Restoring project files from snapshot...`)
        const restoreResult = await restoreFilesFromSnapshot(sandbox, snapshot)
        console.log(`[Sandbox] Restore complete: ${restoreResult.filesRestored} files, deps installed: ${restoreResult.dependenciesInstalled}`)
      }
    }

    return sandbox
  } catch (error) {
    console.error(`[Sandbox] Failed to create E2B sandbox for project ${projectId}:`, error)
    throw new Error(`Sandbox creation failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Retrieves an existing sandbox for a project without creating a new one.
 * Checks both in-memory cache and database for existing sandbox.
 */
export async function getSandbox(projectId: string): Promise<Sandbox | undefined> {
  // 1. Check in-memory cache
  const sandbox = activeSandboxes.get(projectId)
  if (sandbox) {
    try {
      // Verify sandbox is still alive
      await sandbox.setTimeout(DEFAULT_TIMEOUT_MS)
      // Update activity timestamp
      updateSandboxActivity(projectId)
      return sandbox
    } catch (error) {
      // Sandbox expired, remove from cache
      console.log(`[Sandbox] Cached sandbox expired for ${projectId}:`, error)
      activeSandboxes.delete(projectId)
    }
  }

  // 2. Try to reconnect using sandbox ID from database
  const dbSandboxId = await getSandboxIdFromDatabase(projectId)
  if (dbSandboxId) {
    const reconnected = await tryReconnectSandbox(dbSandboxId, projectId)
    if (reconnected) {
      // Update activity timestamp
      updateSandboxActivity(projectId)
      return reconnected
    }
    // Clear stale sandbox ID from database if reconnection failed
    await clearSandboxIdFromDatabase(projectId)
  }

  return undefined
}

/**
 * Closes and cleans up a sandbox for a project.
 * Also kills any associated background processes and clears database entry.
 */
export async function closeSandbox(projectId: string): Promise<void> {
  // Kill background processes first
  await killBackgroundProcess(projectId)

  const sandbox = activeSandboxes.get(projectId)
  if (sandbox) {
    try {
      console.log(`[Sandbox] Closing sandbox for project ${projectId}`)
      await sandbox.kill()
    } catch (error) {
      console.error(`[Sandbox] Failed to kill sandbox for project ${projectId}:`, error)
    } finally {
      activeSandboxes.delete(projectId)
      pausedSandboxes.delete(projectId)
      connectionAttempts.delete(sandbox.sandboxId)
      // Clear sandbox ID from database
      await clearSandboxIdFromDatabase(projectId)
      // Clean up activity tracking
      sandboxLastActivity.delete(projectId)
    }
  }
}

/**
 * Pause a sandbox to preserve state (E2B Beta feature).
 * The sandbox's filesystem and memory state will be saved.
 * Can be resumed later with resumeSandbox().
 *
 * @param projectId - Project ID associated with the sandbox
 * @returns True if paused successfully, false otherwise
 */
export async function pauseSandbox(projectId: string): Promise<boolean> {
  const sandbox = activeSandboxes.get(projectId)
  if (!sandbox) {
    console.warn(`No active sandbox found for project ${projectId}`)
    return false
  }

  try {
    // Kill background processes before pausing
    await killBackgroundProcess(projectId)

    // Use beta pause API (E2B SDK v2 feature)
    if (typeof sandbox.betaPause === "function") {
      await sandbox.betaPause()

      // Track paused state
      pausedSandboxes.set(projectId, {
        sandboxId: sandbox.sandboxId,
        pausedAt: new Date(),
      })

      // Remove from active sandboxes (it's now paused)
      activeSandboxes.delete(projectId)

      console.log(`Sandbox paused for project ${projectId}: ${sandbox.sandboxId}`)
      return true
    } else {
      console.warn("Sandbox pause not available (requires E2B SDK with beta features)")
      return false
    }
  } catch (error) {
    console.error(`Failed to pause sandbox for project ${projectId}:`, error)
    return false
  }
}

/**
 * Resume a paused sandbox (E2B Beta feature).
 * The sandbox will be restored to its previous state.
 *
 * @param projectId - Project ID associated with the paused sandbox
 * @returns The resumed sandbox, or undefined if resume failed
 */
export async function resumeSandbox(projectId: string): Promise<Sandbox | undefined> {
  const pausedInfo = pausedSandboxes.get(projectId)
  if (!pausedInfo) {
    // No paused sandbox, try to create a new one
    return createSandbox(projectId)
  }

  try {
    // Connect to the paused sandbox (auto-resumes)
    const sandbox = await Sandbox.connect(pausedInfo.sandboxId, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })

    // Update tracking
    activeSandboxes.set(projectId, sandbox)
    pausedSandboxes.delete(projectId)

    console.log(`Sandbox resumed for project ${projectId}: ${sandbox.sandboxId}`)
    return sandbox
  } catch (error) {
    console.error(`Failed to resume sandbox for project ${projectId}:`, error)
    // Paused sandbox may have expired, remove from tracking
    pausedSandboxes.delete(projectId)
    return undefined
  }
}

/**
 * Get or create sandbox with auto-pause support (E2B Beta feature).
 * If the sandbox times out, it will automatically pause instead of being killed.
 *
 * @param projectId - Project ID
 * @param autoPause - Enable auto-pause on timeout (default: false)
 */
export async function createSandboxWithAutoPause(
  projectId: string,
  autoPause: boolean = true
): Promise<Sandbox> {
  // Check if we have a paused sandbox to resume
  if (pausedSandboxes.has(projectId)) {
    const resumed = await resumeSandbox(projectId)
    if (resumed) return resumed
  }

  // Check for existing active sandbox
  const existing = activeSandboxes.get(projectId)
  if (existing) {
    try {
      await existing.setTimeout(DEFAULT_TIMEOUT_MS)
      return existing
    } catch {
      activeSandboxes.delete(projectId)
    }
  }

  const template = CUSTOM_TEMPLATE_ID
  const metadata: SandboxMetadata = {
    projectId,
    createdAt: new Date(),
    template,
    purpose: "website",
  }

  try {
    // Try to use beta create with auto-pause
    if (autoPause && typeof Sandbox.betaCreate === "function") {
      const sandbox = template
        ? await Sandbox.betaCreate(template, {
          timeoutMs: DEFAULT_TIMEOUT_MS,
          autoPause: true,
          metadata: metadata as any,
        })
        : await Sandbox.betaCreate({
          timeoutMs: DEFAULT_TIMEOUT_MS,
          autoPause: true,
          metadata: metadata as any,
        })

      activeSandboxes.set(projectId, sandbox)
      // Persist sandbox ID to database for cross-route reconnection
      await saveSandboxIdToDatabase(projectId, sandbox.sandboxId)
      console.log(`Created sandbox with auto-pause for project ${projectId}`)
      return sandbox
    }

    // Fall back to regular create
    return createSandbox(projectId)
  } catch (error) {
    console.warn("Failed to create sandbox with auto-pause, falling back:", error)
    return createSandbox(projectId)
  }
}

/**
 * Get info about paused sandboxes for a project.
 */
export function getPausedSandboxInfo(projectId: string): SandboxState | undefined {
  const info = pausedSandboxes.get(projectId)
  if (!info) return undefined

  return {
    sandboxId: info.sandboxId,
    projectId,
    isPaused: true,
    pausedAt: info.pausedAt,
  }
}

/**
 * Get or create a code interpreter sandbox for code execution.
 * Uses @e2b/code-interpreter for better code execution capabilities.
 *
 * @param projectId - Unique identifier for the project
 */
export async function getCodeInterpreterSandbox(projectId: string): Promise<CodeInterpreterSandbox> {
  // Check if code interpreter sandbox already exists
  const existing = codeInterpreterSandboxes.get(projectId)
  if (existing) {
    try {
      await existing.setTimeout(DEFAULT_TIMEOUT_MS)
      return existing
    } catch {
      codeInterpreterSandboxes.delete(projectId)
    }
  }

  // Check if CodeInterpreter is available
  if (!CodeInterpreter) {
    throw new Error("@e2b/code-interpreter package is not available")
  }

  // Create new code interpreter sandbox
  const metadata: SandboxMetadata = {
    projectId,
    createdAt: new Date(),
    purpose: "code-execution",
  }

  const sandbox = await CodeInterpreter.create({
    timeoutMs: DEFAULT_TIMEOUT_MS,
    metadata: metadata as any,
  }) as CodeInterpreterSandbox

  codeInterpreterSandboxes.set(projectId, sandbox)
  return sandbox
}

/**
 * Executes code using the E2B Code Interpreter.
 * This is the recommended way to run code as it provides better isolation and output handling.
 *
 * @param sandbox - Can be either a regular Sandbox or CodeInterpreter instance
 * @param code - The code to execute
 * @param language - The programming language (default: "python")
 */
export async function executeCode(
  sandbox: Sandbox | CodeInterpreterSandbox,
  code: string,
  language: CodeLanguage = "python"
) {
  // If it's a CodeInterpreter instance and language is Python, use runCode for better output
  if ("runCode" in sandbox && language === "python") {
    try {
      const execution = await (sandbox as any).runCode(code)
      return {
        logs: {
          stdout: execution.logs.stdout,
          stderr: execution.logs.stderr,
        },
        results: execution.results,
        error: execution.error
          ? {
            message:
              execution.error instanceof Error
                ? execution.error.message
                : typeof execution.error === "string"
                  ? execution.error
                  : "Code execution failed",
          }
          : null,
      }
    } catch (error) {
      return {
        logs: { stdout: [], stderr: [] },
        results: [],
        error: { message: error instanceof Error ? error.message : "Code execution failed" },
      }
    }
  }

  // Fallback to file-based execution for other languages or regular Sandbox
  const langConfig: Record<CodeLanguage, { ext: string; runner: string }> = {
    python: { ext: "py", runner: "python3" },
    javascript: { ext: "js", runner: "node" },
    typescript: { ext: "ts", runner: "npx tsx" },
    js: { ext: "js", runner: "node" },
    ts: { ext: "ts", runner: "npx tsx" },
  }

  const config = langConfig[language]
  const filename = `/tmp/code_${Date.now()}.${config.ext}`

  try {
    // Write code to file
    await sandbox.files.write(filename, code)

    // Execute the code with timeout
    const result = await sandbox.commands.run(`${config.runner} ${filename}`, {
      timeoutMs: 60_000,
    })

    // Clean up temporary file
    await sandbox.commands.run(`rm -f ${filename}`).catch(() => { })

    return {
      logs: {
        stdout: result.stdout ? [result.stdout] : [],
        stderr: result.stderr ? [result.stderr] : [],
      },
      results: [],
      error: result.exitCode !== 0 ? { message: result.stderr || "Execution failed" } : null,
    }
  } catch (error) {
    return {
      logs: { stdout: [], stderr: [] },
      results: [],
      error: { message: error instanceof Error ? error.message : "Code execution failed" },
    }
  }
}

/**
 * Options for executeCommand function.
 */
export interface ExecuteCommandOptions {
  /** Timeout in milliseconds (default: 5 minutes, 10 minutes for npm install) */
  timeoutMs?: number
  /** Working directory for the command */
  cwd?: string
  /** Callback for real-time stdout streaming */
  onStdout?: (data: string) => void
  /** Callback for real-time stderr streaming */
  onStderr?: (data: string) => void
  /** Progress callback for status updates */
  onProgress?: ProgressCallback
}

/**
 * Execute shell commands in sandbox with improved error handling and optional streaming.
 * Supports backward compatibility with number-based timeout parameter.
 *
 * @param sandbox - The E2B sandbox instance
 * @param command - The shell command to execute
 * @param optionsOrTimeout - Either a number (timeoutMs) for backward compatibility, or ExecuteCommandOptions object
 * @returns Command execution result with stdout, stderr, and exitCode
 *
 * @example
 * // Backward compatible usage
 * await executeCommand(sandbox, "ls -la", 60000)
 *
 * @example
 * // New usage with options
 * await executeCommand(sandbox, "npm install", {
 *   timeoutMs: 600000,
 *   cwd: "/home/user/project",
 *   onStdout: (data) => console.log(data),
 *   onStderr: (data) => console.error(data),
 * })
 */
export async function executeCommand(
  sandbox: Sandbox | CodeInterpreterSandbox,
  command: string,
  optionsOrTimeout?: number | ExecuteCommandOptions
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const startTime = Date.now()

  // Handle backward compatibility: if second param is a number, treat it as timeoutMs
  const options: ExecuteCommandOptions =
    typeof optionsOrTimeout === "number" ? { timeoutMs: optionsOrTimeout } : optionsOrTimeout || {}

  const { onProgress } = options

  try {
    // Dynamic timeout based on command type
    // npm install commands get longer timeout
    const isNpmInstall = command.includes("npm install")
    const isBuild = command.includes("npm run build") || command.includes("next build")
    const effectiveTimeout = isNpmInstall
      ? 600_000 // 10 minutes for npm install
      : isBuild
        ? 300_000 // 5 minutes for builds
        : options.timeoutMs || 300_000

    // Extract command name for progress reporting
    const cmdName = command.split(" ")[0].split("/").pop() || "command"
    onProgress?.("start", `Running: ${cmdName}`, command.slice(0, 100))

    // Wrap stdout/stderr to include progress updates
    const stdoutLines: string[] = []
    const stderrLines: string[] = []

    const result = await sandbox.commands.run(command, {
      timeoutMs: effectiveTimeout,
      cwd: options.cwd,
      onStdout: (data: string) => {
        stdoutLines.push(data)
        options.onStdout?.(data)
        // Report progress for long-running commands
        if (isNpmInstall || isBuild) {
          onProgress?.("output", data.trim().slice(0, 80))
        }
      },
      onStderr: (data: string) => {
        stderrLines.push(data)
        options.onStderr?.(data)
      },
    })

    const durationMs = Date.now() - startTime
    const success = result.exitCode === 0

    onProgress?.(
      success ? "complete" : "error",
      success ? `Completed in ${(durationMs / 1000).toFixed(1)}s` : `Failed with exit code ${result.exitCode}`,
      result.stderr?.slice(0, 200)
    )

    return {
      stdout: result.stdout || stdoutLines.join(""),
      stderr: result.stderr || stderrLines.join(""),
      exitCode: result.exitCode,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime

    // E2B SDK may attach stdout/stderr directly to the error object
    const e2bError = error as { stderr?: string; stdout?: string; exitCode?: number }
    const actualStderr = e2bError.stderr || ""
    const actualStdout = e2bError.stdout || ""
    const errorMessage = error instanceof Error ? error.message : "Command execution failed"

    // E2B SDK throws on non-zero exit codes - this is often expected behavior
    // (e.g., `test -d` returns 1 when directory doesn't exist)
    // Use debug level unless it's a "real" command failure
    const isTestCommand = command.startsWith("test ") || command.includes("&& test ")
    const isExpectedFailure = errorMessage.includes("exit status 1") && isTestCommand

    if (isExpectedFailure) {
      console.debug(`[E2B] Expected non-zero exit: "${command.slice(0, 60)}..."`, { durationMs })
    } else {
      // For package manager commands, log more details including actual stderr
      const isPkgManager = command.includes("pnpm") || command.includes("npm")
      console.error(`[E2B] Command failed: "${command.slice(0, 100)}..."`, {
        error: errorMessage,
        stderr: actualStderr.slice(0, 500) || undefined,
        commandLength: command.length,
        durationMs,
        ...(isPkgManager && !actualStderr && { hint: "Check if lock files are conflicting (pnpm-lock.yaml vs package-lock.json)" }),
      })
    }

    onProgress?.("error", "Command failed", actualStderr || errorMessage)

    return {
      stdout: actualStdout,
      stderr: actualStderr || errorMessage,
      exitCode: e2bError.exitCode ?? 1,
      durationMs,
    }
  }
}

/**
 * Check if a directory exists in the sandbox.
 * Uses a pattern that always returns exit code 0 to avoid E2B SDK exceptions.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to check
 * @returns true if directory exists, false otherwise
 */
export async function directoryExists(
  sandbox: Sandbox | CodeInterpreterSandbox,
  path: string
): Promise<boolean> {
  const result = await executeCommand(sandbox, `test -d ${path} && echo "exists" || echo "not_exists"`)
  return result.stdout.trim() === "exists"
}

/**
 * Check if a file exists in the sandbox.
 * Uses a pattern that always returns exit code 0 to avoid E2B SDK exceptions.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to check
 * @returns true if file exists, false otherwise
 */
export async function fileExists(
  sandbox: Sandbox | CodeInterpreterSandbox,
  path: string
): Promise<boolean> {
  const result = await executeCommand(sandbox, `test -f ${path} && echo "exists" || echo "not_exists"`)
  return result.stdout.trim() === "exists"
}

/**
 * Convert Buffer to ArrayBuffer for E2B SDK compatibility.
 * Helper function to ensure proper type conversion.
 */
function convertToE2BData(content: string | Buffer): string | ArrayBuffer {
  if (content instanceof Buffer) {
    const arrayBuffer = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength
    )
    return arrayBuffer as ArrayBuffer
  }
  return content as string | ArrayBuffer
}

/**
 * Write file to sandbox filesystem with improved error handling.
 * E2B SDK v2 best practice: Use sandbox.files.write() for file operations.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to write to
 * @param content - File content (string or Buffer)
 */
export async function writeFile(
  sandbox: Sandbox | CodeInterpreterSandbox,
  path: string,
  content: string | Buffer
) {
  try {
    await sandbox.files.write(path, convertToE2BData(content))
    return { success: true, path }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error(`E2B write file failed: "${path}"`, { error: errorMessage })
    throw new Error(`Failed to write ${path}: ${errorMessage}`)
  }
}

/**
 * Options for batch file write operations.
 */
export interface WriteFilesOptions {
  /** Use E2B's native batch write API (may be faster but less error detail) */
  useNativeApi?: boolean
  /** Progress callback for streaming status updates */
  onProgress?: ProgressCallback
  /** Number of concurrent writes (default: 5) */
  concurrency?: number
}

/**
 * Write multiple files to sandbox filesystem efficiently.
 * E2B SDK v2 best practice: Batch file writes when possible.
 *
 * @param sandbox - The E2B sandbox instance
 * @param files - Array of {path, content} objects
 * @param options - Optional configuration
 * @returns Result object with success status and counts
 *
 * @example
 * // Use native API for better performance
 * await writeFiles(sandbox, files, { useNativeApi: true })
 *
 * @example
 * // With progress tracking
 * await writeFiles(sandbox, files, {
 *   onProgress: (phase, msg, detail) => console.log(`${phase}: ${msg}`)
 * })
 */
export async function writeFiles(
  sandbox: Sandbox | CodeInterpreterSandbox,
  files: Array<{ path: string; content: string | Buffer }>,
  options?: WriteFilesOptions
) {
  const { useNativeApi, onProgress, concurrency = 5 } = options || {}

  onProgress?.("init", `Writing ${files.length} files`, `concurrency: ${concurrency}`)

  // Try native API if requested (fastest)
  if (useNativeApi) {
    try {
      onProgress?.("batch", "Using native batch write API")
      await sandbox.files.write(
        files.map(({ path, content }) => ({
          path,
          data: convertToE2BData(content),
        }))
      )
      onProgress?.("complete", `Successfully wrote ${files.length} files`)
      return {
        success: true,
        succeeded: files.length,
        failed: 0,
        paths: files.map((f) => f.path),
      }
    } catch (error) {
      onProgress?.("fallback", "Native batch write failed, using individual writes")
      console.warn("Native batch write failed, falling back to individual writes:", error)
      // Fall through to detailed error tracking implementation
    }
  }

  // Chunked writes with concurrency control for better performance
  try {
    const results: Array<{ path: string; success: boolean; error?: string }> = []
    const chunks = chunkArray(files, concurrency)
    let processed = 0

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(async ({ path, content }) => {
          await sandbox.files.write(path, convertToE2BData(content))
          return path
        })
      )

      for (let i = 0; i < chunkResults.length; i++) {
        const result = chunkResults[i]
        const file = chunk[i]
        processed++

        if (result.status === "fulfilled") {
          results.push({ path: file.path, success: true })
          onProgress?.("write", `Written: ${file.path}`, `${processed}/${files.length}`)
        } else {
          const errorMsg = result.reason instanceof Error ? result.reason.message : "Unknown error"
          results.push({ path: file.path, success: false, error: errorMsg })
          onProgress?.("error", `Failed: ${file.path}`, errorMsg)
        }
      }
    }

    const succeeded = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success)

    if (failed.length > 0) {
      console.warn(`E2B batch write: ${succeeded} succeeded, ${failed.length} failed`)
    }

    onProgress?.("complete", `Completed: ${succeeded} succeeded, ${failed.length} failed`)

    return {
      success: failed.length === 0,
      succeeded,
      failed: failed.length,
      paths: files.map((f) => f.path),
      errors: failed.map((f) => ({ path: f.path, error: f.error })),
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    onProgress?.("error", "Batch write failed", errorMsg)
    throw new Error(`Batch file write failed: ${errorMsg}`)
  }
}

/**
 * Helper function to chunk an array into smaller arrays.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/**
 * Read file from sandbox filesystem with improved error handling.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to read from
 */
export async function readFile(sandbox: Sandbox | CodeInterpreterSandbox, path: string) {
  try {
    const content = await sandbox.files.read(path)
    return { content, path, success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error(`E2B read file failed: "${path}"`, { error: errorMessage })
    throw new Error(`Failed to read ${path}: ${errorMessage}`)
  }
}

/**
 * List files in a directory within the sandbox.
 */
export async function listFiles(sandbox: Sandbox, path: string = "/home/user") {
  const result = await sandbox.commands.run(`ls -la ${path}`)
  return {
    files: result.stdout,
    error: result.stderr || undefined,
  }
}

/**
 * Get the public URL for a port in the sandbox.
 * This is used to expose a running web server to the internet.
 */
export function getHostUrl(sandbox: Sandbox, port: number = 3000): string {
  const host = sandbox.getHost(port)
  // E2B returns just the hostname, we need to add the protocol
  return `https://${host}`
}

/**
 * Wait for a dev server to be ready by polling HTTP status.
 * Uses curl to verify the server is actually responding to HTTP requests.
 * This is more reliable than just checking if the port is open.
 *
 * @param sandbox - The E2B sandbox instance
 * @param port - Port to check (default: 3000)
 * @param maxWaitMs - Maximum time to wait in ms (default: 30000)
 * @param pollInterval - Time between polls in ms (default: 1000)
 * @returns Object with success status and optional error
 */
export async function waitForDevServer(
  sandbox: Sandbox | CodeInterpreterSandbox,
  port: number = 3000,
  maxWaitMs: number = 30000,
  pollInterval: number = 1000
): Promise<{ success: boolean; port: number; error?: string }> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Use curl to check HTTP response - more reliable than nc -z
      const result = await sandbox.commands.run(
        `curl -s -o /dev/null -w '%{http_code}' http://localhost:${port} 2>/dev/null || echo "000"`,
        { timeoutMs: 5000 }
      )
      const httpCode = result.stdout.trim()

      // 200, 304, or any 2xx/3xx response means server is ready
      if (httpCode.startsWith('2') || httpCode.startsWith('3')) {
        console.log(`[waitForDevServer] Server ready on port ${port} (HTTP ${httpCode})`)
        return { success: true, port }
      }
    } catch {
      // Ignore errors during polling, keep trying
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  return {
    success: false,
    port,
    error: `Dev server did not respond on port ${port} within ${maxWaitMs / 1000}s`,
  }
}

/**
 * Check if a dev server is running and responding on any of the common ports.
 * Uses curl for HTTP-level verification.
 *
 * @param sandbox - The E2B sandbox instance
 * @param ports - Ports to check (default: [3000, 3001, 3002, 3003, 3004, 3005])
 * @returns Object with running status and active port
 */
export async function checkDevServerStatus(
  sandbox: Sandbox | CodeInterpreterSandbox,
  ports: number[] = [3000, 3001, 3002, 3003, 3004, 3005]
): Promise<{ isRunning: boolean; port: number | null; httpCode?: string }> {
  // Check all ports in parallel
  const checks = await Promise.all(
    ports.map(async port => {
      try {
        const result = await sandbox.commands.run(
          `curl -s -o /dev/null -w '%{http_code}' http://localhost:${port} 2>/dev/null || echo "000"`,
          { timeoutMs: 3000 }
        )
        const httpCode = result.stdout.trim()
        const isUp = httpCode.startsWith('2') || httpCode.startsWith('3')
        return { port, isUp, httpCode }
      } catch {
        return { port, isUp: false, httpCode: "000" }
      }
    })
  )

  const activePort = checks.find(c => c.isUp)
  return {
    isRunning: !!activePort,
    port: activePort?.port || null,
    httpCode: activePort?.httpCode,
  }
}

/**
 * Start a background process (like a dev server) in the sandbox.
 * Uses E2B SDK v2 native `background: true` API for better process control.
 * Returns immediately without waiting for the process to complete.
 *
 * @param sandbox - The E2B sandbox instance
 * @param command - The command to run in the background
 * @param options - Optional configuration
 * @param options.workingDir - Working directory for the command (E2B handles this natively)
 * @param options.projectId - Project ID for process tracking and cleanup
 * @param options.onStdout - Optional callback for stdout streaming
 * @param options.onStderr - Optional callback for stderr streaming
 * @returns Object with `started` boolean and `process` handle for cleanup
 */
export async function startBackgroundProcess(
  sandbox: Sandbox,
  command: string,
  options?: {
    workingDir?: string
    projectId?: string
    onStdout?: (data: string) => void
    onStderr?: (data: string) => void
  }
) {
  console.log(`[startBackgroundProcess] Starting command: ${command} in ${options?.workingDir || 'default cwd'}`)
  try {
    // Use native E2B SDK v2 background API
    const process = await sandbox.commands.run(command, {
      background: true,
      cwd: options?.workingDir,
      onStdout: options?.onStdout,
      onStderr: options?.onStderr,
    })
    console.log(`[startBackgroundProcess] Native command started successfully`)

    // Track process for cleanup
    if (options?.projectId) {
      backgroundProcesses.set(options.projectId, process)
    }

    return { started: true, process }
  } catch (error) {
    console.warn(`[startBackgroundProcess] Native API failed: ${error instanceof Error ? error.message : String(error)}`)
    // Fallback to shell-based approach if native API fails
    const fullCommand = options?.workingDir ? `cd ${options.workingDir} && ${command}` : command

    try {
      await sandbox.commands.run(`nohup sh -c "${fullCommand}" > /tmp/server.log 2>&1 &`, {
        timeoutMs: 5_000,
      })
      return { started: true, process: null }
    } catch (fallbackError) {
      // Even if the command times out, the background process may have started
      console.warn(
        `Background process command timed out, but process may still be running: ${command}`,
        fallbackError
      )
      return { started: true, process: null }
    }
  }
}

/**
 * Kill a background process for a project.
 * Useful for stopping dev servers before restarting or cleanup.
 *
 * @param projectId - Project ID associated with the background process
 * @returns True if process was found and killed, false otherwise
 */
export async function killBackgroundProcess(projectId: string): Promise<boolean> {
  const process = backgroundProcesses.get(projectId)
  if (process) {
    try {
      await process.kill()
      backgroundProcesses.delete(projectId)
      return true
    } catch (error) {
      console.warn(`Failed to kill background process for ${projectId}:`, error)
      backgroundProcesses.delete(projectId)
      return false
    }
  }
  return false
}

/**
 * Close code interpreter sandbox.
 */
export async function closeCodeInterpreterSandbox(projectId: string): Promise<void> {
  const sandbox = codeInterpreterSandboxes.get(projectId)
  if (sandbox) {
    try {
      await sandbox.kill()
    } catch (error) {
      console.error(`Failed to kill code interpreter sandbox for project ${projectId}:`, error)
    } finally {
      codeInterpreterSandboxes.delete(projectId)
    }
  }
}

/**
 * Cleanup all active sandboxes (call on server shutdown).
 * Best practice: Properly cleanup resources to avoid orphaned sandboxes.
 */
export async function cleanupAllSandboxes(): Promise<void> {
  const regularSandboxes = Array.from(activeSandboxes.keys()).map(closeSandbox)
  const codeSandboxes = Array.from(codeInterpreterSandboxes.keys()).map(
    closeCodeInterpreterSandbox
  )

  const allPromises = [...regularSandboxes, ...codeSandboxes]
  const results = await Promise.allSettled(allPromises)

  const failed = results.filter((r) => r.status === "rejected").length
  if (failed > 0) {
    console.warn(`Sandbox cleanup: ${failed}/${results.length} failed to close properly`)
  }
}

/**
 * Get statistics about active sandboxes for monitoring.
 */
export function getSandboxStats() {
  return {
    regularSandboxes: activeSandboxes.size,
    codeInterpreterSandboxes: codeInterpreterSandboxes.size,
    pausedSandboxes: pausedSandboxes.size,
    total: activeSandboxes.size + codeInterpreterSandboxes.size + pausedSandboxes.size,
    regularSandboxIds: Array.from(activeSandboxes.keys()),
    codeSandboxIds: Array.from(codeInterpreterSandboxes.keys()),
    pausedSandboxIds: Array.from(pausedSandboxes.keys()),
  }
}

/**
 * List all sandboxes (active and paused).
 * Useful for cleanup and debugging.
 */
export function listAllSandboxes(): Array<{
  projectId: string
  type: "regular" | "code-interpreter" | "paused"
  sandboxId?: string
  status: "active" | "paused"
}> {
  const result: Array<{
    projectId: string
    type: "regular" | "code-interpreter" | "paused"
    sandboxId?: string
    status: "active" | "paused"
  }> = []

  for (const [projectId, sandbox] of activeSandboxes) {
    result.push({
      projectId,
      type: "regular",
      sandboxId: sandbox.sandboxId,
      status: "active",
    })
  }

  for (const [projectId, sandbox] of codeInterpreterSandboxes) {
    result.push({
      projectId,
      type: "code-interpreter",
      sandboxId: sandbox.sandboxId,
      status: "active",
    })
  }

  for (const [projectId, info] of pausedSandboxes) {
    result.push({
      projectId,
      type: "paused",
      sandboxId: info.sandboxId,
      status: "paused",
    })
  }

  return result
}

// ============================================================
// SCREENSHOT CAPTURE VIA HEADLESS BROWSER
// ============================================================

/**
 * Capture a screenshot of a running web server using Playwright.
 * Playwright and Chromium are pre-installed in the E2B template.
 * 
 * Falls back to ImageMagick or Python PIL if Playwright fails.
 *
 * @param projectId - Project ID
 * @param options - Screenshot options
 * @returns Base64 encoded screenshot or null if failed
 */
export async function captureSandboxScreenshot(
  projectId: string,
  options: {
    sandboxUrl?: string
    width?: number
    height?: number
    waitForLoad?: number
  } = {}
): Promise<string | null> {
  const { sandboxUrl, width = 1280, height = 800, waitForLoad = 2000 } = options

  if (!sandboxUrl) {
    console.warn("[Screenshot] No sandbox URL provided")
    return null
  }

  let sandbox: any
  try {
    // Get the regular sandbox (not Desktop) - this is where the dev server runs
    sandbox = await getSandbox(projectId) || await createSandbox(projectId)

    console.log(`[Screenshot] Capturing ${sandboxUrl} in sandbox ${sandbox.sandboxId}`)

    const screenshotPath = "/tmp/screenshot.png"

    // First, check if playwright is already installed globally in the template
    const globalCheck = await executeCommand(sandbox, "which playwright || echo 'not found'", { timeoutMs: 5000 })

    // If not found globally, install locally in /tmp
    if (globalCheck.stdout?.includes('not found')) {
      console.log("[Screenshot] Playwright not found globally, installing in /tmp...")

      // Check if already installed in /tmp
      const localCheck = await executeCommand(sandbox, "test -d /tmp/node_modules/playwright && echo 'installed' || echo 'not installed'", { timeoutMs: 5000 })

      if (!localCheck.stdout?.includes('installed')) {
        // Create package.json if it doesn't exist
        await executeCommand(sandbox, "cd /tmp && [ ! -f package.json ] && echo '{}' > package.json || true", { timeoutMs: 5000 })

        // Install playwright - try with npm as it's more reliable in E2B
        const installResult = await executeCommand(sandbox, "cd /tmp && npm install playwright 2>&1 || bun add playwright 2>&1", { timeoutMs: 120000 })
        if (installResult.exitCode !== 0) {
          console.warn("[Screenshot] Failed to install playwright:", installResult.stderr)
          throw new Error("Failed to install playwright")
        }
        console.log("[Screenshot] Playwright installed successfully")
      }
    }

    // Create a Playwright screenshot script that's more robust
    const screenshotScript = `
const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    console.log('Creating page...');
    const page = await browser.newPage({
      viewport: { width: ${width}, height: ${height} }
    });

    console.log('Navigating to ${sandboxUrl}...');
    await page.goto('${sandboxUrl}', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('Waiting for page to settle...');
    await page.waitForTimeout(${waitForLoad});

    console.log('Taking screenshot...');
    await page.screenshot({
      path: '${screenshotPath}',
      fullPage: false,
      type: 'png'
    });

    await browser.close();
    console.log('Screenshot captured successfully');
    process.exit(0);
  } catch (err) {
    console.error('Screenshot failed:', err.message);
    if (browser) {
      await browser.close().catch(() => {});
    }
    process.exit(1);
  }
})();
`
    await writeFile(sandbox, "/tmp/screenshot.js", screenshotScript)

    // Run the screenshot script - try with node first, then bun
    console.log("[Screenshot] Running screenshot script...")
    let result = await executeCommand(sandbox, "cd /tmp && node screenshot.js 2>&1", { timeoutMs: 60000 })

    if (result.exitCode !== 0) {
      console.log("[Screenshot] Node failed, trying with bun...")
      result = await executeCommand(sandbox, "cd /tmp && bun screenshot.js 2>&1", { timeoutMs: 60000 })

      if (result.exitCode !== 0) {
        console.warn("[Screenshot] Playwright failed:", result.stderr || result.stdout)
        throw new Error("Playwright screenshot failed, trying fallback")
      }
    }

    // Read and validate the screenshot file
    console.log("[Screenshot] Reading screenshot file...")
    const screenshotData = await sandbox.files.read(screenshotPath)

    if (!screenshotData || screenshotData.length === 0) {
      throw new Error("Screenshot file is empty")
    }

    if (screenshotData.length < 100) {
      throw new Error("Screenshot file too small, likely corrupted")
    }

    // Convert to base64
    const base64 = Buffer.from(screenshotData).toString('base64')
    console.log(`[Screenshot] Captured successfully, size: ${screenshotData.length} bytes`)

    return `data:image/png;base64,${base64}`

  } catch (error) {
    console.warn("[Screenshot] Primary method failed:", error instanceof Error ? error.message : error)

    // Fallback: Try simple curl check to verify URL is accessible
    if (sandbox) {
      try {
        console.log("[Screenshot] Verifying URL is accessible...")
        const curlCheck = await executeCommand(sandbox, `curl -s -o /dev/null -w "%{http_code}" "${sandboxUrl}" 2>&1 || echo "failed"`, { timeoutMs: 10000 })
        console.log(`[Screenshot] URL check result: ${curlCheck.stdout}`)

        if (!curlCheck.stdout?.includes('200')) {
          console.warn("[Screenshot] URL not accessible, got status:", curlCheck.stdout)
        }
      } catch (checkError) {
        console.warn("[Screenshot] URL check failed:", checkError)
      }
    }

    // Return null to let the API route generate a placeholder
    console.log("[Screenshot] Returning null to trigger placeholder generation")
    return null
  }
}
