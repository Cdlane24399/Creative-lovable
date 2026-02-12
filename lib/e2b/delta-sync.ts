/**
 * Delta Sync for Efficient File Synchronization
 *
 * Provides efficient delta-based synchronization between
 * E2B sandboxes and the database using content hashing.
 */

import { createHash } from "crypto";
import type { FileChange } from "./file-watcher";

// =============================================================================
// Types
// =============================================================================

/**
 * File entry with content and metadata
 */
export interface FileEntry {
  path: string;
  content: string;
  hash: string;
  size: number;
  lastModified?: number;
}

/**
 * Delta between two file states
 */
export interface SyncDelta {
  /** Files to add/update in destination */
  toWrite: FileEntry[];
  /** Files to delete from destination */
  toDelete: string[];
  /** Files unchanged */
  unchanged: string[];
  /** Total bytes to transfer */
  bytesToTransfer: number;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  filesWritten: number;
  filesDeleted: number;
  bytesTransferred: number;
  duration: number;
  errors: Array<{ path: string; error: string }>;
}

/**
 * Sync options
 */
export interface SyncOptions {
  /** Paths to ignore during sync */
  ignorePaths?: string[];
  /** Maximum file size to sync */
  maxFileSize?: number;
  /** Whether to delete files not in source */
  deleteOrphans?: boolean;
  /** Concurrency for file operations */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (progress: SyncProgress) => void;
}

/**
 * Sync progress
 */
export interface SyncProgress {
  phase: "analyzing" | "writing" | "deleting" | "complete";
  current: number;
  total: number;
  currentFile?: string;
  bytesTransferred: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_IGNORE_PATHS = [
  "node_modules/**",
  ".next/**",
  ".git/**",
  "dist/**",
  "build/**",
  "*.log",
  ".DS_Store",
  "Thumbs.db",
];

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// =============================================================================
// Content Hashing
// =============================================================================

/**
 * Compute hash for content
 */
export function computeHash(content: string): string {
  return createHash("md5").update(content, "utf8").digest("hex");
}

/**
 * Create a file entry with computed hash
 */
export function createFileEntry(path: string, content: string): FileEntry {
  return {
    path,
    content,
    hash: computeHash(content),
    size: Buffer.byteLength(content, "utf8"),
    lastModified: Date.now(),
  };
}

// =============================================================================
// Delta Computation
// =============================================================================

/**
 * Compute delta between source and destination file maps
 */
export function computeDelta(
  source: Map<string, FileEntry>,
  destination: Map<string, FileEntry>,
  options: SyncOptions = {},
): SyncDelta {
  const { ignorePaths = DEFAULT_IGNORE_PATHS, deleteOrphans = true } = options;

  const toWrite: FileEntry[] = [];
  const toDelete: string[] = [];
  const unchanged: string[] = [];

  // Check source files
  for (const [path, sourceEntry] of source) {
    // Skip ignored paths
    if (shouldIgnore(path, ignorePaths)) {
      continue;
    }

    const destEntry = destination.get(path);

    if (!destEntry) {
      // New file
      toWrite.push(sourceEntry);
    } else if (sourceEntry.hash !== destEntry.hash) {
      // Modified file
      toWrite.push(sourceEntry);
    } else {
      // Unchanged
      unchanged.push(path);
    }
  }

  // Check for deleted files
  if (deleteOrphans) {
    for (const path of destination.keys()) {
      if (!source.has(path) && !shouldIgnore(path, ignorePaths)) {
        toDelete.push(path);
      }
    }
  }

  // Calculate bytes to transfer
  const bytesToTransfer = toWrite.reduce((sum, entry) => sum + entry.size, 0);

  return {
    toWrite,
    toDelete,
    unchanged,
    bytesToTransfer,
  };
}

/**
 * Check if a path should be ignored
 */
function shouldIgnore(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchPattern(path, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple pattern matching (supports * and **)
 * Caches compiled RegExp per pattern to avoid re-creation in loops.
 */
const patternRegexCache = new Map<string, RegExp>();
function matchPattern(path: string, pattern: string): boolean {
  let regex = patternRegexCache.get(pattern);
  if (!regex) {
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "{{DOUBLE_STAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/{{DOUBLE_STAR}}/g, ".*");
    regex = new RegExp(`(^|/)${regexPattern}($|/)`);
    patternRegexCache.set(pattern, regex);
  }
  return regex.test(path);
}

// =============================================================================
// File Map Operations
// =============================================================================

/**
 * Convert a file snapshot (Record<string, string>) to a FileEntry map
 */
export function snapshotToEntries(
  snapshot: Record<string, string>,
): Map<string, FileEntry> {
  const entries = new Map<string, FileEntry>();

  for (const [path, content] of Object.entries(snapshot)) {
    entries.set(path, createFileEntry(path, content));
  }

  return entries;
}

/**
 * Convert a FileEntry map to a file snapshot
 */
export function entriesToSnapshot(
  entries: Map<string, FileEntry>,
): Record<string, string> {
  const snapshot: Record<string, string> = {};

  for (const [path, entry] of entries) {
    snapshot[path] = entry.content;
  }

  return snapshot;
}

/**
 * Apply file changes to an entry map
 */
export function applyChanges(
  entries: Map<string, FileEntry>,
  changes: FileChange[],
  getContent: (path: string) => string | undefined,
): Map<string, FileEntry> {
  const result = new Map(entries);

  for (const change of changes) {
    switch (change.type) {
      case "created":
      case "modified": {
        const content = getContent(change.path);
        if (content !== undefined) {
          result.set(change.path, createFileEntry(change.path, content));
        }
        break;
      }
      case "deleted":
        result.delete(change.path);
        break;
    }
  }

  return result;
}

// =============================================================================
// Delta Sync Statistics
// =============================================================================

/**
 * Statistics about a sync delta
 */
export interface DeltaStats {
  totalFiles: number;
  filesToWrite: number;
  filesToDelete: number;
  unchangedFiles: number;
  bytesToTransfer: number;
  estimatedTime: number; // ms based on average transfer rate
}

/**
 * Compute statistics for a sync delta
 */
export function computeDeltaStats(
  delta: SyncDelta,
  avgBytesPerSecond: number = 1024 * 1024, // 1MB/s default
): DeltaStats {
  return {
    totalFiles:
      delta.toWrite.length + delta.toDelete.length + delta.unchanged.length,
    filesToWrite: delta.toWrite.length,
    filesToDelete: delta.toDelete.length,
    unchangedFiles: delta.unchanged.length,
    bytesToTransfer: delta.bytesToTransfer,
    estimatedTime: Math.ceil(
      (delta.bytesToTransfer / avgBytesPerSecond) * 1000,
    ),
  };
}

// =============================================================================
// Conflict Resolution
// =============================================================================

/**
 * Conflict when both source and destination have changed
 */
export interface SyncConflict {
  path: string;
  sourceEntry: FileEntry;
  destEntry: FileEntry;
  resolution?: "use_source" | "use_dest" | "merge" | "skip";
}

/**
 * Detect conflicts between two file maps
 */
export function detectConflicts(
  source: Map<string, FileEntry>,
  destination: Map<string, FileEntry>,
  baseline: Map<string, FileEntry>,
): SyncConflict[] {
  const conflicts: SyncConflict[] = [];

  for (const [path, sourceEntry] of source) {
    const destEntry = destination.get(path);
    const baseEntry = baseline.get(path);

    if (!destEntry || !baseEntry) {
      continue; // Not a conflict if one side is missing
    }

    // Check if both sides changed from baseline
    const sourceChanged = sourceEntry.hash !== baseEntry.hash;
    const destChanged = destEntry.hash !== baseEntry.hash;

    if (sourceChanged && destChanged && sourceEntry.hash !== destEntry.hash) {
      conflicts.push({
        path,
        sourceEntry,
        destEntry,
      });
    }
  }

  return conflicts;
}

/**
 * Resolve conflicts automatically using a strategy
 */
export function resolveConflicts(
  conflicts: SyncConflict[],
  strategy: "source_wins" | "dest_wins" | "newer_wins",
): SyncConflict[] {
  return conflicts.map((conflict) => {
    let resolution: SyncConflict["resolution"];

    switch (strategy) {
      case "source_wins":
        resolution = "use_source";
        break;
      case "dest_wins":
        resolution = "use_dest";
        break;
      case "newer_wins":
        const sourceTime = conflict.sourceEntry.lastModified || 0;
        const destTime = conflict.destEntry.lastModified || 0;
        resolution = sourceTime >= destTime ? "use_source" : "use_dest";
        break;
    }

    return { ...conflict, resolution };
  });
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Chunk an array into batches
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Process items with concurrency limit
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  const chunks = chunkArray(items, concurrency);

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(processor));
    results.push(...chunkResults);
  }

  return results;
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Normalize a file path
 */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "");
}

/**
 * Get the relative path from a base directory
 */
export function getRelativePath(fullPath: string, basePath: string): string {
  const normalizedFull = normalizePath(fullPath);
  const normalizedBase = normalizePath(basePath);

  if (normalizedFull.startsWith(normalizedBase + "/")) {
    return normalizedFull.slice(normalizedBase.length + 1);
  }

  return normalizedFull;
}

/**
 * Get the directory part of a path
 */
export function getDirectory(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

/**
 * Get all directories that need to be created for a set of files
 */
export function getRequiredDirectories(paths: string[]): string[] {
  const dirs = new Set<string>();

  for (const path of paths) {
    let dir = getDirectory(path);
    while (dir) {
      dirs.add(dir);
      dir = getDirectory(dir);
    }
  }

  return Array.from(dirs).sort((a, b) => a.length - b.length);
}
