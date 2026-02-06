/**
 * Sync Manager for Bidirectional File Synchronization
 *
 * Coordinates bidirectional sync between E2B sandboxes and the database,
 * handling file watching, delta computation, and conflict resolution.
 */

import type { Sandbox } from "e2b"
import type { FileChange, FileState } from "./file-watcher"
import { SandboxFileWatcher, createFileWatcher } from "./file-watcher"
import {
  type FileEntry,
  type SyncDelta,
  type SyncResult,
  type SyncOptions,
  type SyncProgress,
  type SyncConflict,
  computeDelta,
  snapshotToEntries,
  entriesToSnapshot,
  createFileEntry,
  chunkArray,
  normalizePath,
  getRelativePath,
  getRequiredDirectories,
} from "./delta-sync"
import {
  emitCacheEventAsync,
  createFilesChangedEvent,
} from "@/lib/events/cache-events"
import { getProjectDir } from "./project-dir"

// =============================================================================
// Types
// =============================================================================

/**
 * Sync direction
 */
export type SyncDirection = "sandbox-to-db" | "db-to-sandbox" | "bidirectional"

/**
 * Sync manager configuration
 */
export interface SyncManagerConfig {
  /** Project ID for database operations */
  projectId: string
  /** Project directory in sandbox */
  projectDir?: string
  /** Enable automatic sync */
  autoSync?: boolean
  /** Sync interval for auto-sync (ms) */
  syncInterval?: number
  /** Default sync direction */
  direction?: SyncDirection
  /** Conflict resolution strategy */
  conflictStrategy?: "source_wins" | "dest_wins" | "newer_wins" | "manual"
  /** Paths to ignore */
  ignorePaths?: string[]
  /** Maximum file size to sync */
  maxFileSize?: number
  /** Concurrency for file operations */
  concurrency?: number
}

/**
 * Sync state
 */
export interface SyncState {
  lastSyncTime: number | null
  lastSyncDirection: SyncDirection | null
  pendingChanges: FileChange[]
  conflicts: SyncConflict[]
  isSyncing: boolean
}

/**
 * Callback for sync events
 */
export type SyncEventCallback = (event: SyncEvent) => void | Promise<void>

/**
 * Sync events
 */
export type SyncEvent =
  | { type: "sync_started"; direction: SyncDirection }
  | { type: "sync_progress"; progress: SyncProgress }
  | { type: "sync_completed"; result: SyncResult }
  | { type: "sync_error"; error: Error }
  | { type: "changes_detected"; changes: FileChange[] }
  | { type: "conflicts_detected"; conflicts: SyncConflict[] }

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<SyncManagerConfig> = {
  projectId: "",
  projectDir: getProjectDir(),
  autoSync: false,
  syncInterval: 30000, // 30 seconds
  direction: "bidirectional",
  conflictStrategy: "source_wins",
  ignorePaths: [
    "node_modules/**",
    ".next/**",
    ".git/**",
    ".bun/**",
    ".cache/**",
    ".npm/**",
    ".local/**",
    ".pnpm-store/**",
    ".yarn/**",
    ".vercel/**",
    "dist/**",
    "build/**",
    "*.log",
    "package-lock.json",
    "pnpm-lock.yaml",
    "bun.lockb",
    "bun.lock",
    "yarn.lock",
  ],
  maxFileSize: 5 * 1024 * 1024, // 5MB
  concurrency: 5,
}

// =============================================================================
// Sync Manager Class
// =============================================================================

/**
 * Manager for bidirectional file synchronization
 */
export class SyncManager {
  private sandbox: Sandbox
  private config: Required<SyncManagerConfig>
  private watcher: SandboxFileWatcher | null = null
  private state: SyncState
  private callbacks: Set<SyncEventCallback> = new Set()
  private autoSyncInterval: NodeJS.Timeout | null = null
  private baselineSnapshot: Map<string, FileEntry> = new Map()

  constructor(sandbox: Sandbox, config: SyncManagerConfig) {
    this.sandbox = sandbox
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.state = {
      lastSyncTime: null,
      lastSyncDirection: null,
      pendingChanges: [],
      conflicts: [],
      isSyncing: false,
    }
  }

  /**
   * Initialize the sync manager
   */
  async initialize(): Promise<void> {
    // Create file watcher
    this.watcher = createFileWatcher(this.sandbox, this.config.projectDir, {
      pollInterval: 5000,
      ignorePaths: this.config.ignorePaths,
      computeHashes: true,
    })

    // Listen for file changes
    this.watcher.onChange((changes) => {
      this.handleFileChanges(changes)
    })

    // Start watching
    await this.watcher.start()

    // Start auto-sync if enabled
    if (this.config.autoSync) {
      this.startAutoSync()
    }

    console.log(`[SyncManager] Initialized for project ${this.config.projectId}`)
  }

  /**
   * Stop the sync manager
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.stop()
      this.watcher = null
    }

    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval)
      this.autoSyncInterval = null
    }

    console.log(`[SyncManager] Stopped for project ${this.config.projectId}`)
  }

  /**
   * Register a callback for sync events
   */
  onEvent(callback: SyncEventCallback): () => void {
    this.callbacks.add(callback)
    return () => this.callbacks.delete(callback)
  }

  /**
   * Get current sync state
   */
  getState(): SyncState {
    return { ...this.state }
  }

  /**
   * Sync from sandbox to database
   */
  async syncToDatabase(): Promise<SyncResult> {
    return this.performSync("sandbox-to-db")
  }

  /**
   * Sync from database to sandbox
   */
  async syncFromDatabase(snapshot: Record<string, string>): Promise<SyncResult> {
    // Store the snapshot for comparison
    this.baselineSnapshot = snapshotToEntries(snapshot)
    return this.performSync("db-to-sandbox")
  }

  /**
   * Perform bidirectional sync
   */
  async syncBidirectional(dbSnapshot: Record<string, string>): Promise<SyncResult> {
    this.baselineSnapshot = snapshotToEntries(dbSnapshot)
    return this.performSync("bidirectional")
  }

  /**
   * Perform sync in specified direction
   */
  private async performSync(direction: SyncDirection): Promise<SyncResult> {
    if (this.state.isSyncing) {
      return {
        success: false,
        filesWritten: 0,
        filesDeleted: 0,
        bytesTransferred: 0,
        duration: 0,
        errors: [{ path: "", error: "Sync already in progress" }],
      }
    }

    this.state.isSyncing = true
    const startTime = Date.now()

    this.emitEvent({ type: "sync_started", direction })

    try {
      let result: SyncResult

      switch (direction) {
        case "sandbox-to-db":
          result = await this.syncSandboxToDb()
          break
        case "db-to-sandbox":
          result = await this.syncDbToSandbox()
          break
        case "bidirectional":
          result = await this.syncBidirectionalImpl()
          break
      }

      this.state.lastSyncTime = Date.now()
      this.state.lastSyncDirection = direction
      this.state.pendingChanges = []

      this.emitEvent({ type: "sync_completed", result })

      // Emit cache event
      emitCacheEventAsync(
        createFilesChangedEvent(
          this.config.projectId,
          [],
          "synced",
          this.sandbox.sandboxId
        )
      )

      return result
    } catch (error) {
      const syncError = error instanceof Error ? error : new Error(String(error))
      this.emitEvent({ type: "sync_error", error: syncError })

      return {
        success: false,
        filesWritten: 0,
        filesDeleted: 0,
        bytesTransferred: 0,
        duration: Date.now() - startTime,
        errors: [{ path: "", error: syncError.message }],
      }
    } finally {
      this.state.isSyncing = false
    }
  }

  /**
   * Sync sandbox files to database
   */
  private async syncSandboxToDb(): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: Array<{ path: string; error: string }> = []

    // Get current sandbox state
    const sandboxFiles = await this.readSandboxFiles()

    // Compute delta
    const delta = computeDelta(sandboxFiles, this.baselineSnapshot, {
      ignorePaths: this.config.ignorePaths,
      deleteOrphans: true,
    })

    // Save to database
    const snapshot = entriesToSnapshot(sandboxFiles)
    const saved = await this.saveSnapshotToDb(snapshot)

    if (!saved) {
      errors.push({ path: "", error: "Failed to save snapshot to database" })
    }

    // Update baseline
    this.baselineSnapshot = sandboxFiles

    return {
      success: errors.length === 0,
      filesWritten: delta.toWrite.length,
      filesDeleted: delta.toDelete.length,
      bytesTransferred: delta.bytesToTransfer,
      duration: Date.now() - startTime,
      errors,
    }
  }

  /**
   * Sync database files to sandbox
   */
  private async syncDbToSandbox(): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: Array<{ path: string; error: string }> = []
    let filesWritten = 0
    let bytesTransferred = 0

    const snapshot = entriesToSnapshot(this.baselineSnapshot)
    const files = Object.entries(snapshot)

    // Create required directories
    const dirs = getRequiredDirectories(Object.keys(snapshot).map(p =>
      `${this.config.projectDir}/${p}`
    ))

    for (const dir of dirs) {
      try {
        await this.sandbox.commands.run(`mkdir -p "${dir}"`, { timeoutMs: 5000 })
      } catch (error) {
        // Ignore directory creation errors
      }
    }

    // Write files in batches
    const batches = chunkArray(files, this.config.concurrency)

    for (const batch of batches) {
      const promises = batch.map(async ([path, content]) => {
        const fullPath = `${this.config.projectDir}/${path}`
        try {
          await this.sandbox.files.write(fullPath, content)
          filesWritten++
          bytesTransferred += Buffer.byteLength(content, "utf8")
        } catch (error) {
          errors.push({
            path,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })

      await Promise.all(promises)

      this.emitEvent({
        type: "sync_progress",
        progress: {
          phase: "writing",
          current: filesWritten,
          total: files.length,
          bytesTransferred,
        },
      })
    }

    return {
      success: errors.length === 0,
      filesWritten,
      filesDeleted: 0,
      bytesTransferred,
      duration: Date.now() - startTime,
      errors,
    }
  }

  /**
   * Bidirectional sync implementation
   */
  private async syncBidirectionalImpl(): Promise<SyncResult> {
    // First sync sandbox to DB (to capture any changes)
    const toDbResult = await this.syncSandboxToDb()

    // The sandbox state is now the source of truth
    return toDbResult
  }

  /**
   * Read all files from sandbox
   */
  private async readSandboxFiles(): Promise<Map<string, FileEntry>> {
    const entries = new Map<string, FileEntry>()

    try {
      // Get list of files, excluding large directories and binary files at the find level
      // This prevents scanning 41k+ files when only ~100 source files are needed
      const result = await this.sandbox.commands.run(
        `find "${this.config.projectDir}" -type f -size -${this.config.maxFileSize}c ` +
        `-not -path '*/node_modules/*' ` +
        `-not -path '*/.next/*' ` +
        `-not -path '*/.git/*' ` +
        `-not -path '*/.bun/*' ` +
        `-not -path '*/.cache/*' ` +
        `-not -path '*/.npm/*' ` +
        `-not -path '*/.local/*' ` +
        `-not -path '*/.pnpm-store/*' ` +
        `-not -path '*/.yarn/*' ` +
        `-not -path '*/.vercel/*' ` +
        `-not -path '*/dist/*' ` +
        `-not -path '*/build/*' ` +
        `-not -name '*.ico' ` +
        `-not -name '*.png' ` +
        `-not -name '*.jpg' ` +
        `-not -name '*.jpeg' ` +
        `-not -name '*.gif' ` +
        `-not -name '*.webp' ` +
        `-not -name '*.woff' ` +
        `-not -name '*.woff2' ` +
        `-not -name '*.ttf' ` +
        `-not -name '*.eot' ` +
        `-not -name '*.svg' ` +
        `-not -name 'package-lock.json' ` +
        `-not -name 'pnpm-lock.yaml' ` +
        `-not -name 'bun.lockb' ` +
        `-not -name 'bun.lock' ` +
        `-not -name 'yarn.lock' ` +
        `2>/dev/null || true`,
        { timeoutMs: 30000 }
      )

      if (result.exitCode !== 0 || !result.stdout) {
        return entries
      }

      const paths = result.stdout.trim().split("\n").filter(Boolean)

      // Only log in development and reduce verbosity
      if (process.env.NODE_ENV === 'development' && paths.length > 0) {
        console.log(`[SyncManager] Found ${paths.length} source files to sync`)
      }

      // Read files in batches
      const batches = chunkArray(paths, this.config.concurrency)

      for (const batch of batches) {
        const promises = batch.map(async (fullPath) => {
          const relativePath = getRelativePath(fullPath, this.config.projectDir)
          // Double-check ignore patterns (for any patterns not covered by find exclusions)
          if (this.shouldIgnore(relativePath)) {
            return
          }

          try {
            const content = await this.sandbox.files.read(fullPath)
            if (typeof content === "string") {
              // Skip files with null bytes (binary files that slipped through)
              if (content.includes('\u0000')) {
                return
              }
              entries.set(relativePath, createFileEntry(relativePath, content))
            }
          } catch {
            // Ignore read errors
          }
        })

        await Promise.all(promises)
      }
    } catch (error) {
      console.error("[SyncManager] Error reading sandbox files:", error)
    }

    return entries
  }

  /**
   * Save snapshot to database
   * Uses upsert to handle case where project row doesn't exist yet
   */
  private async saveSnapshotToDb(snapshot: Record<string, string>): Promise<boolean> {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const client = createAdminClient()

      // Use UPDATE only - project must already exist (created by chat route)
      // Using upsert without name field would violate NOT NULL constraint on INSERT
      const { error } = await client
        .from('projects')
        .update({
          files_snapshot: snapshot,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.config.projectId)

      if (error) throw error
      console.log(`[SyncManager] Saved ${Object.keys(snapshot).length} files to database for project ${this.config.projectId}`)
      return true
    } catch (error) {
      console.error("[SyncManager] Error saving snapshot:", error)
      return false
    }
  }

  /**
   * Handle file changes from watcher
   */
  private handleFileChanges(changes: FileChange[]): void {
    // Filter out ignored changes
    const relevantChanges = changes.filter(
      (c) => !this.shouldIgnore(getRelativePath(c.path, this.config.projectDir))
    )

    if (relevantChanges.length === 0) {
      return
    }

    this.state.pendingChanges.push(...relevantChanges)

    this.emitEvent({ type: "changes_detected", changes: relevantChanges })

    // Emit cache event
    emitCacheEventAsync(
      createFilesChangedEvent(
        this.config.projectId,
        relevantChanges.map((c) => c.path),
        "updated",
        this.sandbox.sandboxId
      )
    )
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnore(path: string): boolean {
    for (const pattern of this.config.ignorePaths) {
      if (this.matchPattern(path, pattern)) {
        return true
      }
    }
    return false
  }

  /**
   * Match a path against a glob pattern
   */
  private matchPattern(path: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "{{DOUBLE_STAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/{{DOUBLE_STAR}}/g, ".*")

    const regex = new RegExp(`(^|/)${regexPattern}($|/)`)
    return regex.test(path)
  }

  /**
   * Start auto-sync
   */
  private startAutoSync(): void {
    if (this.autoSyncInterval) {
      return
    }

    this.autoSyncInterval = setInterval(async () => {
      if (this.state.pendingChanges.length > 0) {
        await this.syncToDatabase()
      }
    }, this.config.syncInterval)

    console.log(
      `[SyncManager] Auto-sync started (interval: ${this.config.syncInterval}ms)`
    )
  }

  /**
   * Emit an event to all callbacks
   */
  private emitEvent(event: SyncEvent): void {
    for (const callback of this.callbacks) {
      Promise.resolve()
        .then(() => callback(event))
        .catch((error) => {
          console.error("[SyncManager] Callback error:", error)
        })
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a sync manager for a sandbox
 */
export function createSyncManager(
  sandbox: Sandbox,
  config: SyncManagerConfig
): SyncManager {
  return new SyncManager(sandbox, config)
}

/**
 * Quick sync from sandbox to database
 */
export async function quickSyncToDatabase(
  sandbox: Sandbox,
  projectId: string,
  projectDir: string = getProjectDir()
): Promise<SyncResult> {
  const manager = new SyncManager(sandbox, {
    projectId,
    projectDir,
    autoSync: false,
  })

  try {
    await manager.initialize()
    return await manager.syncToDatabase()
  } finally {
    manager.stop()
  }
}

/**
 * Quick sync from sandbox to database with retry logic.
 * Retries up to 3 times with exponential backoff on failure.
 *
 * @param sandbox - The E2B sandbox instance
 * @param projectId - Project ID to sync
 * @param projectDir - Project directory in sandbox
 * @returns SyncResult with additional retry count info
 */
export async function quickSyncToDatabaseWithRetry(
  sandbox: Sandbox,
  projectId: string,
  projectDir: string = getProjectDir(),
  maxRetries: number = 3
): Promise<SyncResult & { retryCount: number }> {
  let lastError: Error | null = null
  let retryCount = 0

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await quickSyncToDatabase(sandbox, projectId, projectDir)

      // Validate that files were actually written
      if (result.success && result.filesWritten > 0) {
        console.log(`[SyncManager] Sync succeeded on attempt ${attempt + 1}: ${result.filesWritten} files`)
        return { ...result, retryCount: attempt }
      }

      // If no files written, treat as failure and retry
      if (result.filesWritten === 0 && attempt < maxRetries - 1) {
        console.warn(`[SyncManager] Sync returned 0 files on attempt ${attempt + 1}, retrying...`)
        retryCount = attempt + 1
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)))
        continue
      }

      return { ...result, retryCount: attempt }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      retryCount = attempt + 1
      console.warn(`[SyncManager] Sync attempt ${attempt + 1} failed:`, lastError.message)

      if (attempt < maxRetries - 1) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)))
      }
    }
  }

  // All retries exhausted
  console.error(`[SyncManager] All ${maxRetries} sync attempts failed`)
  return {
    success: false,
    filesWritten: 0,
    filesDeleted: 0,
    bytesTransferred: 0,
    duration: 0,
    errors: [{ path: "", error: lastError?.message || "Sync failed after retries" }],
    retryCount,
  }
}
