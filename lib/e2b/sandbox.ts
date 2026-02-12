/**
 * Sandbox management module — backward-compatible re-export hub.
 *
 * The implementation has been split into focused modules:
 *   - sandbox-lifecycle.ts   — Sandbox CRUD, Maps, constants, cleanup, snapshots
 *   - sandbox-files.ts       — File I/O (writeFile, readFile, listFiles, writeFiles)
 *   - sandbox-commands.ts    — Command execution, directoryExists, fileExists
 *   - sandbox-devserver.ts   — Dev server management, background processes
 *   - sandbox-screenshot.ts  — Screenshot capture via Playwright, getHostUrl
 *   - sandbox-code.ts        — Code execution, CodeInterpreter sandboxes
 *
 * This file re-exports everything so that existing imports continue to work:
 *   import { createSandbox, writeFile, executeCommand } from "./sandbox"
 */

// ── sandbox-files ──────────────────────────────────────────────
export {
  writeFile,
  writeFiles,
  readFile,
  listFiles,
  convertToE2BData,
} from "./sandbox-files";
export type { WriteFilesOptions } from "./sandbox-files";

// ── sandbox-commands ───────────────────────────────────────────
export {
  executeCommand,
  directoryExists,
  fileExists,
} from "./sandbox-commands";
export type { ExecuteCommandOptions } from "./sandbox-commands";

// ── sandbox-devserver ──────────────────────────────────────────
export {
  waitForDevServer,
  checkDevServerHttp,
  checkDevServerStatus,
  startBackgroundProcess,
  killBackgroundProcess,
  backgroundProcesses,
} from "./sandbox-devserver";

// ── sandbox-screenshot ─────────────────────────────────────────
export {
  getHostUrl,
  resolveInternalSandboxUrl,
  looksLikeMissingChromium,
  looksLikeMissingSystemLibs,
} from "./sandbox-screenshot";

// Re-export captureSandboxScreenshot with the original signature
// (the screenshot module accepts injected sandbox functions to avoid circular deps)
import { captureSandboxScreenshot as _captureSandboxScreenshotImpl } from "./sandbox-screenshot";
import {
  getSandbox as _getSandbox,
} from "./sandbox-lifecycle";

export async function captureSandboxScreenshot(
  projectId: string,
  options: {
    sandboxUrl?: string;
    width?: number;
    height?: number;
    waitForLoad?: number;
  } = {},
): Promise<string | null> {
  return _captureSandboxScreenshotImpl(projectId, options, {
    getSandbox: _getSandbox,
  });
}

// ── sandbox-code ───────────────────────────────────────────────
export {
  executeCode,
  getCodeInterpreterSandbox,
  closeCodeInterpreterSandbox,
} from "./sandbox-code";
export type { CodeLanguage } from "./sandbox-code";

// ── sandbox-lifecycle ──────────────────────────────────────────
export {
  activeSandboxes,
  DEFAULT_TIMEOUT_MS,
  SANDBOX_TTL_MS,
  CLEANUP_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_COOLDOWN_MS,
  updateSandboxActivity,
  isSandboxExpired,
  cleanupExpiredSandboxes,
  startCleanupInterval,
  getSandboxIdFromDatabase,
  saveSandboxIdToDatabase,
  clearSandboxIdFromDatabase,
  getProjectSnapshot,
  saveFilesSnapshot,
  restoreFilesFromSnapshot,
  tryReconnectSandbox,
  connectSandboxById,
  createSandbox,
  getSandbox,
  closeSandbox,
  pauseSandbox,
  resumeSandbox,
  createSandboxWithAutoPause,
  getPausedSandboxInfo,
  cleanupAllSandboxes,
  getSandboxStats,
  listAllSandboxes,
  cleanupTemplateArtifacts,
} from "./sandbox-lifecycle";
export type {
  ProjectSnapshot,
  ConnectSandboxByIdOptions,
  ResolveSandboxOptions,
  SandboxState,
} from "./sandbox-lifecycle";

// Re-export ProgressCallback from its canonical source (sandbox-files)
export type { ProgressCallback } from "./sandbox-files";

// ── Startup ────────────────────────────────────────────────────
// Start cleanup interval on module load (preserves original behavior)
import { startCleanupInterval as _startCleanup } from "./sandbox-lifecycle";

if (typeof globalThis !== "undefined") {
  _startCleanup();
}
