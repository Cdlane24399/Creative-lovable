import { Sandbox } from "e2b";
import { getProjectDir } from "./project-dir";
import { buildSandboxMetadata } from "./sandbox-metadata";
import { getConfiguredTemplate } from "./template-config";
import { writeFiles } from "./sandbox-files";
import { executeCommand } from "./sandbox-commands";
import { killBackgroundProcess } from "./sandbox-devserver";
import { projectCache } from "@/lib/cache";
import {
  closeCodeInterpreterSandbox,
  codeInterpreterSandboxes,
} from "./sandbox-code";

import type { ProgressCallback } from "./sandbox-files";

// Sandbox manager to track active sandboxes
export const activeSandboxes = new Map<string, Sandbox>();
const pausedSandboxes = new Map<
  string,
  { sandboxId: string; pausedAt: Date }
>(); // projectId -> paused sandbox info

// Track connection attempts to prevent reconnection storms
const connectionAttempts = new Map<
  string,
  { count: number; lastAttempt: number }
>();
export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_COOLDOWN_MS = 5000; // 5 seconds between attempts

// Default timeout for sandboxes (10 minutes for website generation)
// Note: E2B default is 5 minutes, extended to 10 for:
// - npm install without templates (3-5 minutes)
// - Complex build processes
// - Multiple iterative operations
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

// TTL for idle sandboxes (30 minutes of inactivity)
export const SANDBOX_TTL_MS = 30 * 60 * 1000;

// Cleanup interval (check every 5 minutes)
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Track last activity for each sandbox
const sandboxLastActivity = new Map<string, number>();

/**
 * Update last activity timestamp for a sandbox
 */
export function updateSandboxActivity(projectId: string): void {
  sandboxLastActivity.set(projectId, Date.now());
}

/**
 * Clean up artifacts from create-next-app that break fresh package installations.
 * Called after sandbox creation when using a template to ensure clean state.
 */
export async function cleanupTemplateArtifacts(
  sandbox: Sandbox,
): Promise<void> {
  const projectDir = getProjectDir();
  try {
    // Remove pnpm-workspace.yaml which conflicts with non-monorepo setups
    await sandbox.commands.run(`rm -f "${projectDir}/pnpm-workspace.yaml"`, {
      timeoutMs: 5000,
    });

    // IMPORTANT: Write a valid JavaScript config instead of renaming TypeScript file
    // create-next-app generates next.config.ts with TypeScript syntax (import type { NextConfig })
    // which is NOT valid in .mjs files and causes "Unexpected token '{'" errors
    await sandbox.commands.run(`rm -f "${projectDir}/next.config.ts"`, {
      timeoutMs: 5000,
    });
    await sandbox.files.write(
      `${projectDir}/next.config.mjs`,
      `/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
`,
    );
    console.log("[Sandbox] Cleaned up template artifacts");
  } catch (error) {
    console.warn("[Sandbox] Failed to cleanup template artifacts:", error);
  }
}

/**
 * Check if a sandbox has exceeded its TTL
 */
export function isSandboxExpired(projectId: string): boolean {
  const lastActivity = sandboxLastActivity.get(projectId);
  if (!lastActivity) return false;
  return Date.now() - lastActivity > SANDBOX_TTL_MS;
}

/**
 * Clean up expired sandboxes
 */
export async function cleanupExpiredSandboxes(): Promise<void> {
  const expiredProjects: string[] = [];

  // Find expired sandboxes
  for (const [projectId] of activeSandboxes) {
    if (isSandboxExpired(projectId)) {
      expiredProjects.push(projectId);
    }
  }

  // Clean up expired sandboxes - sync files first
  for (const projectId of expiredProjects) {
    console.log(
      `[Sandbox TTL] Cleaning up expired sandbox for project ${projectId}`,
    );
    try {
      // Sync files to database before closing (best effort)
      const sandbox = activeSandboxes.get(projectId);
      if (sandbox) {
        try {
          const { quickSyncToDatabase } = await import("./sync-manager");
          console.log(
            `[Sandbox TTL] Syncing files before expiration for ${projectId}`,
          );
          await quickSyncToDatabase(sandbox, projectId);
        } catch (syncError) {
          console.warn(
            `[Sandbox TTL] Failed to sync before expiration for ${projectId}:`,
            syncError,
          );
        }
      }

      await closeSandbox(projectId);
      sandboxLastActivity.delete(projectId);
    } catch (error) {
      console.error(
        `[Sandbox TTL] Failed to cleanup sandbox for ${projectId}:`,
        error,
      );
    }
  }

  if (expiredProjects.length > 0) {
    console.log(
      `[Sandbox TTL] Cleaned up ${expiredProjects.length} expired sandboxes`,
    );
  }
}

/**
 * Start the cleanup interval with singleton pattern to work with Next.js HMR
 */
const CLEANUP_INTERVAL_KEY = "e2b_sandbox_cleanup_interval";

export function startCleanupInterval(): void {
  const globalAny = globalThis as any;

  if (globalAny[CLEANUP_INTERVAL_KEY]) {
    // Interval already running, don't start another one
    return;
  }

  // Start new interval (silently - logging on every HMR reload is too noisy)
  globalAny[CLEANUP_INTERVAL_KEY] = setInterval(
    cleanupExpiredSandboxes,
    CLEANUP_INTERVAL_MS,
  );
}

// ============================================================
// DATABASE HELPERS FOR SANDBOX PERSISTENCE
// ============================================================

/**
 * Get sandbox ID from database for a project.
 * This enables sandbox reconnection across API route invocations.
 */
export async function getSandboxIdFromDatabase(
  projectId: string,
): Promise<string | null> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories");
    const projectRepo = getProjectRepository();
    return await projectRepo.getSandboxId(projectId);
  } catch (error) {
    console.warn(
      `Failed to get sandbox ID from database for ${projectId}:`,
      error,
    );
    return null;
  }
}

/**
 * Save sandbox ID to database for a project.
 * This enables sandbox reconnection across API route invocations.
 * Uses UPSERT to handle the case where the project doesn't exist yet.
 */
export async function saveSandboxIdToDatabase(
  projectId: string,
  sandboxId: string,
): Promise<void> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories");
    const projectRepo = getProjectRepository();
    await projectRepo.ensureExists(projectId);
    await projectRepo.updateSandbox(projectId, sandboxId);
    console.log(
      `[Sandbox] Saved sandbox ID ${sandboxId} to database for project ${projectId}`,
    );
  } catch (error) {
    console.warn(
      `[Sandbox] Failed to save sandbox ID to database for ${projectId}:`,
      error,
    );
  }
}

/**
 * Clear sandbox ID from database when sandbox is closed.
 */
export async function clearSandboxIdFromDatabase(
  projectId: string,
): Promise<void> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories");
    const projectRepo = getProjectRepository();
    await projectRepo.updateSandbox(projectId, null);
  } catch (error) {
    console.warn(
      `Failed to clear sandbox ID from database for ${projectId}:`,
      error,
    );
  }
}

/**
 * Interface for project snapshot data used for sandbox restoration.
 */
export interface ProjectSnapshot {
  files_snapshot: Record<string, string>;
  dependencies: Record<string, string>;
}

/**
 * Get project snapshot from database for sandbox restoration.
 * Returns files and dependencies that can be restored to a new sandbox.
 */
export async function getProjectSnapshot(
  projectId: string,
): Promise<ProjectSnapshot | null> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories");
    const projectRepo = getProjectRepository();
    return await projectRepo.getFilesSnapshot(projectId);
  } catch (error) {
    console.warn(`Failed to get project snapshot for ${projectId}:`, error);
    return null;
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
  dependencies?: Record<string, string>,
): Promise<void> {
  try {
    const { getProjectRepository } = await import("@/lib/db/repositories");
    const projectRepo = getProjectRepository();
    await projectRepo.saveFilesSnapshot(projectId, files, dependencies);
    await projectCache.invalidate(projectId);
    console.log(
      `[Sandbox] Saved files snapshot for project ${projectId}: ${Object.keys(files).length} files`,
    );
  } catch (error) {
    console.warn(
      `[Sandbox] Failed to save files snapshot for ${projectId}:`,
      error,
    );
  }
}

/**
 * Restore files from a project snapshot to a sandbox.
 * Used when creating a new sandbox after the previous one expired.
 *
 * @param sandbox - The new sandbox to restore files to
 * @param snapshot - Project snapshot containing files and dependencies
 * @param projectDir - Project directory path (default: resolved by getProjectDir())
 * @returns Object with success status and counts
 */
export async function restoreFilesFromSnapshot(
  sandbox: Sandbox,
  snapshot: ProjectSnapshot,
  projectDir: string = getProjectDir(),
): Promise<{
  success: boolean;
  filesRestored: number;
  dependenciesInstalled: boolean;
}> {
  const result = {
    success: false,
    filesRestored: 0,
    dependenciesInstalled: false,
  };

  try {
    const fileEntries = Object.entries(snapshot.files_snapshot);
    if (fileEntries.length === 0) {
      console.log("[Sandbox] No files to restore from snapshot");
      return { success: true, filesRestored: 0, dependenciesInstalled: false };
    }

    console.log(
      `[Sandbox] Restoring ${fileEntries.length} files from snapshot...`,
    );

    // Create project directory if needed
    await sandbox.commands.run(`mkdir -p "${projectDir}"`);

    // CRITICAL: Clear .next cache to ensure restored files are used
    // The E2B template may have pre-built files that would override restored content
    console.log("[Sandbox] Clearing .next cache to ensure fresh build...");
    await sandbox.commands.run(
      `rm -rf "${projectDir}/.next" 2>/dev/null || true`,
    );

    // Prepare files for batch write
    const filesToWrite = fileEntries.map(([path, content]) => ({
      path: path.startsWith("/") ? path : `${projectDir}/${path}`,
      content,
    }));

    // Write all files
    const writeResult = await writeFiles(sandbox, filesToWrite, {
      useNativeApi: true,
    });
    result.filesRestored = writeResult.succeeded;

    // Install dependencies if package.json exists and we have dependencies
    const hasDependencies = Object.keys(snapshot.dependencies || {}).length > 0;
    const hasPackageJson = fileEntries.some(([path]) =>
      path.endsWith("package.json"),
    );

    if (hasDependencies && hasPackageJson) {
      const installCommandCheck = await sandbox.commands.run(
        `if [ -f "${projectDir}/bun.lockb" ] || [ -f "${projectDir}/bun.lock" ]; then
  if command -v bun >/dev/null 2>&1; then
    echo "bun install"
    exit 0
  fi
fi
if command -v npm >/dev/null 2>&1; then
  echo "npm install --no-fund --no-audit"
elif command -v bun >/dev/null 2>&1; then
  echo "bun install"
else
  echo "npm install"
fi`,
        { timeoutMs: 5000 },
      );
      const installCommand =
        installCommandCheck.stdout.trim() || "npm install --no-fund --no-audit";
      console.log(`[Sandbox] Installing dependencies with: ${installCommand}`);
      const installResult = await executeCommand(sandbox, installCommand, {
        cwd: projectDir,
        timeoutMs: 600_000, // 10 minutes for dependency install
      });
      result.dependenciesInstalled = installResult.exitCode === 0;
      if (!result.dependenciesInstalled) {
        console.warn(
          `[Sandbox] ${installCommand} failed:`,
          installResult.stderr,
        );
      }
    }

    result.success = true;
    console.log(
      `[Sandbox] Restored ${result.filesRestored} files, dependencies installed: ${result.dependenciesInstalled}`,
    );
    return result;
  } catch (error) {
    console.error("[Sandbox] Failed to restore files from snapshot:", error);
    return result;
  }
}

export interface ConnectSandboxByIdOptions {
  timeoutMs?: number;
  clearDatabaseOnFailure?: boolean;
  persistDatabaseMappingOnSuccess?: boolean;
}

/**
 * Connect to an existing sandbox with retry/throttle guards and tracking updates.
 * Returns undefined on failure unless callers choose to throw.
 */
export async function tryReconnectSandbox(
  sandboxId: string,
  projectId: string,
  options: ConnectSandboxByIdOptions = {},
): Promise<Sandbox | undefined> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    clearDatabaseOnFailure = true,
    persistDatabaseMappingOnSuccess = false,
  } = options;

  // Check if we've exceeded retry attempts
  const attempts = connectionAttempts.get(sandboxId);
  if (attempts) {
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;

    if (attempts.count >= MAX_RECONNECT_ATTEMPTS) {
      if (timeSinceLastAttempt < RECONNECT_COOLDOWN_MS) {
        console.warn(
          `[Sandbox] Reconnection rate-limited for ${sandboxId}, ${attempts.count} attempts`,
        );
        return undefined;
      }
      // Reset after cooldown
      connectionAttempts.set(sandboxId, { count: 1, lastAttempt: Date.now() });
    } else {
      connectionAttempts.set(sandboxId, {
        count: attempts.count + 1,
        lastAttempt: Date.now(),
      });
    }
  } else {
    connectionAttempts.set(sandboxId, { count: 1, lastAttempt: Date.now() });
  }

  try {
    console.log(
      `[Sandbox] Attempting to reconnect to sandbox ${sandboxId} for project ${projectId}`,
    );

    const sandbox = await Sandbox.connect(sandboxId, {
      timeoutMs,
    });

    // Test connection by extending timeout
    await sandbox.setTimeout(timeoutMs);

    activeSandboxes.set(projectId, sandbox);

    // Reset connection attempts on success
    connectionAttempts.delete(sandboxId);

    // Update activity timestamp
    updateSandboxActivity(projectId);

    if (persistDatabaseMappingOnSuccess) {
      await saveSandboxIdToDatabase(projectId, sandbox.sandboxId);
    }

    console.log(
      `[Sandbox] Successfully reconnected to sandbox ${sandboxId} for project ${projectId}`,
    );
    return sandbox;
  } catch (error) {
    console.warn(
      `[Sandbox] Failed to reconnect to sandbox ${sandboxId}:`,
      error,
    );

    if (clearDatabaseOnFailure) {
      // Clear stale mapping when reconnecting via persisted ID
      await clearSandboxIdFromDatabase(projectId);
    }

    return undefined;
  }
}

export interface ResolveSandboxOptions {
  templateId?: string;
  restoreFromSnapshot?: boolean;
  preferAutoPause?: boolean;
}

/**
 * Connect to a sandbox by ID and register the connection in project tracking.
 * Used by routes that receive explicit sandbox IDs from clients.
 */
export async function connectSandboxById(
  projectId: string,
  sandboxId: string,
  options: Omit<
    ConnectSandboxByIdOptions,
    "persistDatabaseMappingOnSuccess"
  > = {},
): Promise<Sandbox> {
  const connected = await tryReconnectSandbox(sandboxId, projectId, {
    ...options,
    clearDatabaseOnFailure: options.clearDatabaseOnFailure ?? false,
    persistDatabaseMappingOnSuccess: true,
  });

  if (!connected) {
    throw new Error(
      `Failed to connect to sandbox ${sandboxId} for project ${projectId}`,
    );
  }

  return connected;
}

async function createNewSandbox(
  projectId: string,
  template: string | undefined,
  preferAutoPause: boolean,
): Promise<Sandbox> {
  const metadata = buildSandboxMetadata({
    projectId,
    template,
    purpose: "website",
  });

  if (preferAutoPause && typeof Sandbox.betaCreate === "function") {
    try {
      return template
        ? Sandbox.betaCreate(template, {
            timeoutMs: DEFAULT_TIMEOUT_MS,
            autoPause: true,
            metadata,
          })
        : Sandbox.betaCreate({
            timeoutMs: DEFAULT_TIMEOUT_MS,
            autoPause: true,
            metadata,
          });
    } catch (error) {
      console.warn(
        "[Sandbox] betaCreate failed, falling back to Sandbox.create:",
        error,
      );
    }
  }

  return template
    ? Sandbox.create(template, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
        metadata,
      })
    : Sandbox.create({
        timeoutMs: DEFAULT_TIMEOUT_MS,
        metadata,
      });
}

async function restoreSnapshotIfPresent(
  projectId: string,
  sandbox: Sandbox,
): Promise<void> {
  const snapshot = await getProjectSnapshot(projectId);
  if (!snapshot || Object.keys(snapshot.files_snapshot).length === 0) {
    return;
  }

  console.log(
    `[Sandbox] Restoring project files from snapshot for ${projectId}...`,
  );
  const restoreResult = await restoreFilesFromSnapshot(sandbox, snapshot);
  console.log(
    `[Sandbox] Restore complete: ${restoreResult.filesRestored} files, deps installed: ${restoreResult.dependenciesInstalled}`,
  );
}

async function resolveSandbox(
  projectId: string,
  options: ResolveSandboxOptions = {},
): Promise<Sandbox> {
  const {
    templateId,
    restoreFromSnapshot = true,
    preferAutoPause = false,
  } = options;

  const template = templateId || getConfiguredTemplate();

  // 1. Check if sandbox already exists in memory for this project
  const existing = activeSandboxes.get(projectId);
  if (existing) {
    try {
      await existing.setTimeout(DEFAULT_TIMEOUT_MS);
      console.log(`[Sandbox] Reusing existing sandbox: ${existing.sandboxId}`);
      return existing;
    } catch (error) {
      console.log(
        `[Sandbox] Existing sandbox expired or unreachable, removing from cache:`,
        error,
      );
      activeSandboxes.delete(projectId);
    }
  }

  // 2. Try to reconnect using sandbox ID from database
  const dbSandboxId = await getSandboxIdFromDatabase(projectId);
  let needsRestore = false;

  if (dbSandboxId) {
    const reconnected = await tryReconnectSandbox(dbSandboxId, projectId, {
      clearDatabaseOnFailure: true,
      persistDatabaseMappingOnSuccess: false,
    });

    if (reconnected) {
      console.log(
        `[Sandbox] Successfully reconnected to sandbox: ${dbSandboxId}`,
      );
      if (restoreFromSnapshot) {
        await restoreSnapshotIfPresent(projectId, reconnected);
      }
      return reconnected;
    }

    console.log(
      `[Sandbox] Failed to reconnect, will create new sandbox and restore files`,
    );
    needsRestore = restoreFromSnapshot;
  }

  // 2.5. Query E2B API for existing sandboxes matching this project
  // This recovers sandboxes that survived a process restart but whose IDs
  // were lost from both in-memory cache and the database.
  try {
    const paginator = Sandbox.list({
      query: {
        state: ["running", "paused"],
        metadata: { projectId },
      },
    });
    const candidates = await paginator.nextItems();

    if (candidates.length > 0) {
      const candidate = candidates[0];
      console.log(
        `[Sandbox] Found existing sandbox via API query: ${candidate.sandboxId}`,
      );

      const recovered = await tryReconnectSandbox(
        candidate.sandboxId,
        projectId,
        {
          clearDatabaseOnFailure: false,
          persistDatabaseMappingOnSuccess: true,
        },
      );

      if (recovered) {
        console.log(
          `[Sandbox] Successfully recovered sandbox from API: ${candidate.sandboxId}`,
        );
        if (restoreFromSnapshot) {
          await restoreSnapshotIfPresent(projectId, recovered);
        }
        return recovered;
      }
    }
  } catch (apiListError) {
    // Non-fatal: API list is a best-effort recovery path
    console.debug(
      `[Sandbox] API sandbox list query failed (non-fatal):`,
      apiListError,
    );
  }

  // 3. Create new sandbox if reconnect path did not succeed
  try {
    console.log(
      `[Sandbox] Creating new sandbox for project ${projectId}${template ? ` with template: ${template}` : ""}${preferAutoPause ? " (auto-pause preferred)" : ""}`,
    );

    const sandbox = await createNewSandbox(
      projectId,
      template,
      preferAutoPause,
    );

    activeSandboxes.set(projectId, sandbox);
    await saveSandboxIdToDatabase(projectId, sandbox.sandboxId);
    connectionAttempts.delete(sandbox.sandboxId);
    updateSandboxActivity(projectId);

    if (template) {
      await cleanupTemplateArtifacts(sandbox);
    }

    if (needsRestore) {
      await restoreSnapshotIfPresent(projectId, sandbox);
    }

    return sandbox;
  } catch (error) {
    console.error(
      `[Sandbox] Failed to create E2B sandbox for project ${projectId}:`,
      error,
    );
    throw new Error(
      `Sandbox creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Progress callback for streaming operations
export type { ProgressCallback };

// Sandbox state for persistence (E2B Beta feature)
export interface SandboxState {
  sandboxId: string;
  projectId: string;
  isPaused: boolean;
  pausedAt?: Date;
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
 * @param templateId - Optional custom template ID/name (overrides E2B_TEMPLATE/E2B_TEMPLATE_ID env vars)
 * @param options - Optional configuration for sandbox creation
 * @param options.restoreFromSnapshot - Whether to restore files from snapshot (default: true)
 */
export async function createSandbox(
  projectId: string,
  templateId?: string,
  options?: { restoreFromSnapshot?: boolean },
): Promise<Sandbox> {
  const { restoreFromSnapshot = true } = options || {};
  console.log(`[Sandbox] createSandbox called for projectId: ${projectId}`);
  return resolveSandbox(projectId, {
    templateId,
    restoreFromSnapshot,
    preferAutoPause: false,
  });
}

/**
 * Retrieves an existing sandbox for a project without creating a new one.
 * Checks both in-memory cache and database for existing sandbox.
 */
export async function getSandbox(
  projectId: string,
): Promise<Sandbox | undefined> {
  // 1. Check in-memory cache
  const sandbox = activeSandboxes.get(projectId);
  if (sandbox) {
    try {
      // Verify sandbox is still alive
      await sandbox.setTimeout(DEFAULT_TIMEOUT_MS);
      // Update activity timestamp
      updateSandboxActivity(projectId);
      return sandbox;
    } catch (error) {
      // Sandbox expired, remove from cache
      console.log(`[Sandbox] Cached sandbox expired for ${projectId}:`, error);
      activeSandboxes.delete(projectId);
    }
  }

  // 2. Try to reconnect using sandbox ID from database
  const dbSandboxId = await getSandboxIdFromDatabase(projectId);
  if (dbSandboxId) {
    const reconnected = await tryReconnectSandbox(dbSandboxId, projectId, {
      clearDatabaseOnFailure: false,
    });
    if (reconnected) {
      // Update activity timestamp
      updateSandboxActivity(projectId);
      return reconnected;
    }
    // Clear stale sandbox ID from database if reconnection failed
    await clearSandboxIdFromDatabase(projectId);
  }

  return undefined;
}

/**
 * Closes and cleans up a sandbox for a project.
 * Also kills any associated background processes and clears database entry.
 */
export async function closeSandbox(projectId: string): Promise<void> {
  // Kill background processes first
  await killBackgroundProcess(projectId);

  const sandbox = activeSandboxes.get(projectId);
  if (sandbox) {
    try {
      console.log(`[Sandbox] Closing sandbox for project ${projectId}`);
      await sandbox.kill();
    } catch (error) {
      console.error(
        `[Sandbox] Failed to kill sandbox for project ${projectId}:`,
        error,
      );
    } finally {
      activeSandboxes.delete(projectId);
      pausedSandboxes.delete(projectId);
      connectionAttempts.delete(sandbox.sandboxId);
      // Clear sandbox ID from database
      await clearSandboxIdFromDatabase(projectId);
      // Clean up activity tracking
      sandboxLastActivity.delete(projectId);
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
  const sandbox = activeSandboxes.get(projectId);
  if (!sandbox) {
    console.warn(`No active sandbox found for project ${projectId}`);
    return false;
  }

  try {
    // Kill background processes before pausing
    await killBackgroundProcess(projectId);

    // Use beta pause API (E2B SDK v2 feature)
    if (typeof sandbox.betaPause === "function") {
      await sandbox.betaPause();

      // Track paused state
      pausedSandboxes.set(projectId, {
        sandboxId: sandbox.sandboxId,
        pausedAt: new Date(),
      });

      // Remove from active sandboxes (it's now paused)
      activeSandboxes.delete(projectId);

      console.log(
        `Sandbox paused for project ${projectId}: ${sandbox.sandboxId}`,
      );
      return true;
    } else {
      console.warn(
        "Sandbox pause not available (requires E2B SDK with beta features)",
      );
      return false;
    }
  } catch (error) {
    console.error(`Failed to pause sandbox for project ${projectId}:`, error);
    return false;
  }
}

/**
 * Resume a paused sandbox (E2B Beta feature).
 * The sandbox will be restored to its previous state.
 *
 * @param projectId - Project ID associated with the paused sandbox
 * @returns The resumed sandbox, or undefined if resume failed
 */
export async function resumeSandbox(
  projectId: string,
): Promise<Sandbox | undefined> {
  const pausedInfo = pausedSandboxes.get(projectId);
  if (!pausedInfo) {
    // No paused sandbox, try to create a new one
    return createSandbox(projectId);
  }

  try {
    const sandbox = await connectSandboxById(projectId, pausedInfo.sandboxId, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      clearDatabaseOnFailure: true,
    });

    pausedSandboxes.delete(projectId);

    console.log(
      `Sandbox resumed for project ${projectId}: ${sandbox.sandboxId}`,
    );
    return sandbox;
  } catch (error) {
    console.error(`Failed to resume sandbox for project ${projectId}:`, error);
    // Paused sandbox may have expired, remove from tracking
    pausedSandboxes.delete(projectId);
    return undefined;
  }
}

/**
 * Get or create sandbox with auto-pause support (E2B Beta feature).
 * If the sandbox times out, it will automatically pause instead of being killed.
 *
 * @param projectId - Project ID
 * @param autoPause - Enable auto-pause on timeout (default: true)
 */
export async function createSandboxWithAutoPause(
  projectId: string,
  autoPause: boolean = true,
): Promise<Sandbox> {
  // Resume explicitly tracked paused sandbox first
  if (pausedSandboxes.has(projectId)) {
    const resumed = await resumeSandbox(projectId);
    if (resumed) return resumed;
  }

  return resolveSandbox(projectId, {
    restoreFromSnapshot: true,
    preferAutoPause: autoPause,
  });
}

/**
 * Get info about paused sandboxes for a project.
 */
export function getPausedSandboxInfo(
  projectId: string,
): SandboxState | undefined {
  const info = pausedSandboxes.get(projectId);
  if (!info) return undefined;

  return {
    sandboxId: info.sandboxId,
    projectId,
    isPaused: true,
    pausedAt: info.pausedAt,
  };
}

/**
 * Cleanup all active sandboxes (call on server shutdown).
 * Best practice: Properly cleanup resources to avoid orphaned sandboxes.
 */
export async function cleanupAllSandboxes(): Promise<void> {
  const regularSandboxes = Array.from(activeSandboxes.keys()).map(closeSandbox);
  const codeSandboxes = Array.from(codeInterpreterSandboxes.keys()).map(
    closeCodeInterpreterSandbox,
  );

  const allPromises = [...regularSandboxes, ...codeSandboxes];
  const results = await Promise.allSettled(allPromises);

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(
      `Sandbox cleanup: ${failed}/${results.length} failed to close properly`,
    );
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
    total:
      activeSandboxes.size +
      codeInterpreterSandboxes.size +
      pausedSandboxes.size,
    regularSandboxIds: Array.from(activeSandboxes.keys()),
    codeSandboxIds: Array.from(codeInterpreterSandboxes.keys()),
    pausedSandboxIds: Array.from(pausedSandboxes.keys()),
  };
}

/**
 * List all sandboxes (active and paused).
 * Useful for cleanup and debugging.
 */
export function listAllSandboxes(): Array<{
  projectId: string;
  type: "regular" | "code-interpreter" | "paused";
  sandboxId?: string;
  status: "active" | "paused";
}> {
  const result: Array<{
    projectId: string;
    type: "regular" | "code-interpreter" | "paused";
    sandboxId?: string;
    status: "active" | "paused";
  }> = [];

  for (const [projectId, sandbox] of activeSandboxes) {
    result.push({
      projectId,
      type: "regular",
      sandboxId: sandbox.sandboxId,
      status: "active",
    });
  }

  for (const [projectId, sandbox] of codeInterpreterSandboxes) {
    result.push({
      projectId,
      type: "code-interpreter",
      sandboxId: sandbox.sandboxId,
      status: "active",
    });
  }

  for (const [projectId, info] of pausedSandboxes) {
    result.push({
      projectId,
      type: "paused",
      sandboxId: info.sandboxId,
      status: "paused",
    });
  }

  return result;
}
