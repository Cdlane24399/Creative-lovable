/**
 * Sandbox File Watcher
 *
 * Watches for file changes in E2B sandboxes via polling.
 * E2B doesn't support native inotify over the API, so we use
 * periodic state comparison with content hashing.
 */

import type { Sandbox } from "e2b";
import { createHash } from "crypto";
import { getProjectDir } from "./project-dir";

// =============================================================================
// Types
// =============================================================================

/**
 * File change detected by the watcher
 */
export interface FileChange {
  path: string;
  type: "created" | "modified" | "deleted";
  timestamp: number;
  size?: number;
  hash?: string;
  previousHash?: string;
}

/**
 * File state for comparison
 */
export interface FileState {
  path: string;
  size: number;
  modifiedTime: number;
  hash?: string;
}

/**
 * Watcher configuration
 */
export interface FileWatcherConfig {
  /** Polling interval in milliseconds */
  pollInterval?: number;
  /** Paths to watch (glob patterns) */
  watchPaths?: string[];
  /** Paths to ignore */
  ignorePaths?: string[];
  /** Whether to compute content hashes */
  computeHashes?: boolean;
  /** Maximum file size to hash (bytes) */
  maxHashSize?: number;
}

/**
 * Callback for file changes
 */
export type FileChangeCallback = (
  changes: FileChange[],
) => void | Promise<void>;

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<FileWatcherConfig> = {
  pollInterval: 5000, // 5 seconds
  watchPaths: [getProjectDir()],
  ignorePaths: [
    "**/node_modules/**",
    "**/.next/**",
    "**/.git/**",
    "**/.bun/**",
    "**/.cache/**",
    "**/.npm/**",
    "**/.local/**",
    "**/.pnpm-store/**",
    "**/.yarn/**",
    "**/.vercel/**",
    "**/dist/**",
    "**/build/**",
    "**/*.log",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/bun.lockb",
    "**/bun.lock",
    "**/yarn.lock",
  ],
  computeHashes: true,
  maxHashSize: 1024 * 1024, // 1MB
};

// =============================================================================
// File Watcher Class
// =============================================================================

/**
 * File watcher for E2B sandboxes
 */
export class SandboxFileWatcher {
  private sandbox: Sandbox;
  private config: Required<FileWatcherConfig>;
  private lastState: Map<string, FileState> = new Map();
  private callbacks: Set<FileChangeCallback> = new Set();
  private intervalId: NodeJS.Timeout | null = null;
  private isWatching: boolean = false;
  private projectDir: string;

  constructor(
    sandbox: Sandbox,
    projectDir: string = getProjectDir(),
    config: FileWatcherConfig = {},
  ) {
    this.sandbox = sandbox;
    this.projectDir = projectDir;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start watching for file changes
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;

    // Get initial state
    await this.refreshState();

    // Start polling
    this.intervalId = setInterval(async () => {
      try {
        await this.checkForChanges();
      } catch (error) {
        console.error("[FileWatcher] Error checking for changes:", error);
      }
    }, this.config.pollInterval);

    console.log(`[FileWatcher] Started watching ${this.projectDir}`);
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isWatching = false;
    console.log("[FileWatcher] Stopped watching");
  }

  /**
   * Register a callback for file changes
   */
  onChange(callback: FileChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Get current file state
   */
  getCurrentState(): Map<string, FileState> {
    return new Map(this.lastState);
  }

  /**
   * Force a state refresh
   */
  async refreshState(): Promise<Map<string, FileState>> {
    this.lastState = await this.scanFiles();
    return new Map(this.lastState);
  }

  /**
   * Check for changes since last scan
   */
  private async checkForChanges(): Promise<void> {
    const currentState = await this.scanFiles();
    const changes = this.detectChanges(this.lastState, currentState);

    if (changes.length > 0) {
      this.lastState = currentState;
      await this.notifyChanges(changes);
    }
  }

  /**
   * Scan files in the project directory
   */
  private async scanFiles(): Promise<Map<string, FileState>> {
    const state = new Map<string, FileState>();

    try {
      // Use find to get all files (more reliable than ls -R)
      const result = await this.sandbox.commands.run(
        `find "${this.projectDir}" -type f -printf '%p\\t%s\\t%T@\\n' 2>/dev/null || true`,
        { timeoutMs: 30000 },
      );

      if (result.exitCode !== 0 || !result.stdout) {
        return state;
      }

      const lines = result.stdout.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        const [path, sizeStr, modTimeStr] = line.split("\t");
        if (!path || !sizeStr || !modTimeStr) continue;

        // Check if path should be ignored
        if (this.shouldIgnore(path)) continue;

        const size = parseInt(sizeStr, 10);
        const modifiedTime = parseFloat(modTimeStr) * 1000; // Convert to ms

        const fileState: FileState = {
          path,
          size,
          modifiedTime,
        };

        // Compute hash if enabled and file is small enough
        if (this.config.computeHashes && size <= this.config.maxHashSize) {
          fileState.hash = await this.computeFileHash(path);
        }

        state.set(path, fileState);
      }
    } catch (error) {
      console.error("[FileWatcher] Error scanning files:", error);
    }

    return state;
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnore(path: string): boolean {
    for (const pattern of this.config.ignorePaths) {
      if (this.matchGlob(path, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob pattern matching.
   * Caches compiled RegExp per pattern to avoid re-creation in loops.
   */
  private static globRegexCache = new Map<string, RegExp>();
  private matchGlob(path: string, pattern: string): boolean {
    let regex = SandboxFileWatcher.globRegexCache.get(pattern);
    if (!regex) {
      const regexPattern = pattern
        .replace(/\*\*/g, "{{DOUBLE_STAR}}")
        .replace(/\*/g, "[^/]*")
        .replace(/{{DOUBLE_STAR}}/g, ".*")
        .replace(/\?/g, ".");
      regex = new RegExp(`^${regexPattern}$|${regexPattern}`);
      SandboxFileWatcher.globRegexCache.set(pattern, regex);
    }
    return regex.test(path);
  }

  /**
   * Compute MD5 hash of file content
   */
  private async computeFileHash(path: string): Promise<string | undefined> {
    try {
      const result = await this.sandbox.commands.run(
        `md5sum "${path}" 2>/dev/null | cut -d' ' -f1`,
        { timeoutMs: 5000 },
      );

      if (result.exitCode === 0 && result.stdout) {
        return result.stdout.trim();
      }
    } catch {
      // Ignore hash computation errors
    }
    return undefined;
  }

  /**
   * Detect changes between two states
   */
  private detectChanges(
    previous: Map<string, FileState>,
    current: Map<string, FileState>,
  ): FileChange[] {
    const changes: FileChange[] = [];
    const now = Date.now();

    // Check for created and modified files
    for (const [path, currentState] of current) {
      const previousState = previous.get(path);

      if (!previousState) {
        // New file
        changes.push({
          path,
          type: "created",
          timestamp: now,
          size: currentState.size,
          hash: currentState.hash,
        });
      } else if (this.hasChanged(previousState, currentState)) {
        // Modified file
        changes.push({
          path,
          type: "modified",
          timestamp: now,
          size: currentState.size,
          hash: currentState.hash,
          previousHash: previousState.hash,
        });
      }
    }

    // Check for deleted files
    for (const [path] of previous) {
      if (!current.has(path)) {
        changes.push({
          path,
          type: "deleted",
          timestamp: now,
        });
      }
    }

    return changes;
  }

  /**
   * Check if a file has changed
   */
  private hasChanged(previous: FileState, current: FileState): boolean {
    // If hashes are available, use them
    if (previous.hash && current.hash) {
      return previous.hash !== current.hash;
    }

    // Otherwise use size and modification time
    return (
      previous.size !== current.size ||
      previous.modifiedTime !== current.modifiedTime
    );
  }

  /**
   * Notify all callbacks of changes
   */
  private async notifyChanges(changes: FileChange[]): Promise<void> {
    const promises = Array.from(this.callbacks).map((callback) =>
      Promise.resolve()
        .then(() => callback(changes))
        .catch((error) => {
          console.error("[FileWatcher] Callback error:", error);
        }),
    );

    await Promise.allSettled(promises);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a content hash from a string
 */
export function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

/**
 * Compare two file states to find differences
 */
export function compareStates(
  previous: Map<string, FileState>,
  current: Map<string, FileState>,
): {
  created: string[];
  modified: string[];
  deleted: string[];
} {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [path, state] of current) {
    const prev = previous.get(path);
    if (!prev) {
      created.push(path);
    } else if (prev.hash !== state.hash || prev.size !== state.size) {
      modified.push(path);
    }
  }

  for (const path of previous.keys()) {
    if (!current.has(path)) {
      deleted.push(path);
    }
  }

  return { created, modified, deleted };
}

/**
 * Create a file watcher for a sandbox
 */
export function createFileWatcher(
  sandbox: Sandbox,
  projectDir?: string,
  config?: FileWatcherConfig,
): SandboxFileWatcher {
  return new SandboxFileWatcher(sandbox, projectDir, config);
}
