/**
 * Sandbox Provider - Infrastructure-level sandbox management
 *
 * This module provides infrastructure-level sandbox lifecycle management,
 * separating sandbox concerns from AI tool logic. Tools should receive
 * a sandbox instance rather than creating their own.
 */

import { Sandbox } from "e2b";
import {
  createSandbox,
  createSandboxWithAutoPause,
  directoryExists,
  fileExists,
} from "./sandbox";
import { getProjectDir } from "./project-dir";
import { hasConfiguredTemplate } from "./template-config";
import { setProjectInfo } from "../ai/agent-context";
import { scaffoldNextProject } from "../ai/helpers";

// Per-request sandbox storage (using AsyncLocalStorage for request isolation)
import { AsyncLocalStorage } from "async_hooks";

interface SandboxContext {
  sandbox: Sandbox;
  projectId: string;
  projectDir: string;
}

const sandboxStorage = new AsyncLocalStorage<SandboxContext>();

// Module-level fallback for streaming contexts where AsyncLocalStorage
// context may be lost (e.g., ReadableStream producers in streamText).
// Keyed by projectId so concurrent requests don't collide.
const activeSandboxContexts = new Map<string, SandboxContext>();

function getActiveProjectIds(): string[] {
  return Array.from(activeSandboxContexts.keys());
}

/**
 * Get the current sandbox from the request context.
 * First checks AsyncLocalStorage; falls back to the module-level map
 * (populated by withSandbox) for streaming scenarios.
 */
export function getCurrentSandbox(): Sandbox {
  const context = sandboxStorage.getStore();
  if (context) {
    return context.sandbox;
  }

  // Fallback: check module-level active contexts.
  // When streamText runs tool calls inside a ReadableStream, the
  // AsyncLocalStorage context from withSandbox may have exited, but the
  // sandbox is still alive and tracked here.
  if (activeSandboxContexts.size === 1) {
    // Single active context — safe to use directly
    return activeSandboxContexts.values().next().value!.sandbox;
  }

  if (activeSandboxContexts.size > 1) {
    throw new Error(
      `[SandboxProvider] Ambiguous sandbox context: AsyncLocalStorage context is unavailable and multiple project sandboxes are active (${getActiveProjectIds().join(", ")}). Use getCurrentSandboxForProject(projectId).`,
    );
  }

  throw new Error("No sandbox context available. Call withSandbox() first.");
}

/**
 * Get the current sandbox for a specific project.
 * Useful when the AsyncLocalStorage context is unavailable (streaming).
 */
export function getCurrentSandboxForProject(projectId: string): Sandbox {
  const context = sandboxStorage.getStore();
  if (context && context.projectId === projectId) {
    return context.sandbox;
  }

  const fallback = activeSandboxContexts.get(projectId);
  if (fallback) {
    return fallback.sandbox;
  }

  throw new Error(
    `No sandbox context available for project ${projectId}. Call withSandbox() first.`,
  );
}

/**
 * Get the current project ID from the request context.
 */
export function getCurrentProjectId(): string {
  const context = sandboxStorage.getStore();
  if (context) {
    return context.projectId;
  }

  if (activeSandboxContexts.size === 1) {
    return activeSandboxContexts.values().next().value!.projectId;
  }

  if (activeSandboxContexts.size > 1) {
    throw new Error(
      `[SandboxProvider] Ambiguous project context: AsyncLocalStorage context is unavailable and multiple project sandboxes are active (${getActiveProjectIds().join(", ")}).`,
    );
  }

  throw new Error("No sandbox context available. Call withSandbox() first.");
}

/**
 * Get the current project directory from the request context.
 */
export function getCurrentProjectDir(): string {
  const context = sandboxStorage.getStore();
  if (context) {
    return context.projectDir;
  }

  if (activeSandboxContexts.size === 1) {
    return activeSandboxContexts.values().next().value!.projectDir;
  }

  if (activeSandboxContexts.size > 1) {
    throw new Error(
      `[SandboxProvider] Ambiguous project context: AsyncLocalStorage context is unavailable and multiple project sandboxes are active (${getActiveProjectIds().join(", ")}).`,
    );
  }

  throw new Error("No sandbox context available. Call withSandbox() first.");
}

/**
 * Ensures the project directory is initialized before the agent starts.
 * If a template is in use, the project is already scaffolded.
 * If no template, scaffolds a fresh Next.js project.
 */
async function ensureProjectInitialized(
  sandbox: Sandbox,
  projectId: string,
  projectDir: string,
): Promise<void> {
  const hasTemplate = hasConfiguredTemplate();

  // Check if project directory exists and has a valid Next.js project shape
  const projectExists = await directoryExists(sandbox, projectDir);
  const hasPackageJson = projectExists
    ? await fileExists(sandbox, `${projectDir}/package.json`)
    : false;
  const hasAppDir = projectExists
    ? (await directoryExists(sandbox, `${projectDir}/app`)) ||
      (await directoryExists(sandbox, `${projectDir}/src/app`))
    : false;
  const hasPagesDir = projectExists
    ? (await directoryExists(sandbox, `${projectDir}/pages`)) ||
      (await directoryExists(sandbox, `${projectDir}/src/pages`))
    : false;
  const projectReady =
    projectExists && hasPackageJson && (hasAppDir || hasPagesDir);

  if (projectReady) {
    // Project already exists (restored from snapshot or template), just set context
    setProjectInfo(projectId, { projectName: projectId, projectDir });
    return;
  }

  // Missing/incomplete project — scaffold or at least create the directory
  if (!hasTemplate) {
    console.log(`[SandboxProvider] Scaffolding fresh project for ${projectId}`);
    await scaffoldNextProject(sandbox, projectDir, projectId, "");
  } else {
    // Template is set but project is missing/incomplete.
    // Attempt a lightweight scaffold fallback to keep the agent unblocked.
    console.warn(
      `[SandboxProvider] Template active but project is incomplete at ${projectDir} (exists=${projectExists}, package.json=${hasPackageJson}, appDir=${hasAppDir}, pagesDir=${hasPagesDir}) — scaffolding fallback project`,
    );
    await scaffoldNextProject(sandbox, projectDir, projectId, "");
  }

  setProjectInfo(projectId, { projectName: projectId, projectDir });
}

/**
 * Execute a function within a sandbox context.
 * The sandbox is created once and reused for all operations within the callback.
 *
 * @param projectId - The project ID for sandbox identification
 * @param fn - Function to execute with sandbox context
 * @param options.projectDir - Project directory path (default: resolved by getProjectDir())
 * @param options.autoPause - Enable auto-pause for idle sandboxes (default: true)
 * @param options.initProject - Automatically initialize project structure before fn() runs
 * @returns Result of the function
 */
export async function withSandbox<T>(
  projectId: string,
  fn: () => Promise<T>,
  options: {
    projectDir?: string;
    autoPause?: boolean;
    initProject?: boolean;
  } = {},
): Promise<T> {
  const projectDir = options.projectDir || getProjectDir();
  const autoPause = options.autoPause ?? true;

  // Create or get existing sandbox
  const sandbox = autoPause
    ? await createSandboxWithAutoPause(projectId)
    : await createSandbox(projectId);

  const context: SandboxContext = {
    sandbox,
    projectId,
    projectDir,
  };

  // Register in module-level map so streaming tool calls can find the sandbox
  // even after AsyncLocalStorage context exits
  activeSandboxContexts.set(projectId, context);

  // Run function within sandbox context
  try {
    return await sandboxStorage.run(context, async () => {
      // Auto-initialize project structure before the agent starts
      if (options.initProject) {
        await ensureProjectInitialized(sandbox, projectId, projectDir);
      }
      return fn();
    });
  } finally {
    // Clean up after the response has been fully sent.
    // For streaming responses, the Response object is returned immediately but
    // tool calls continue via the ReadableStream — they use the module-level
    // fallback. We defer cleanup so the sandbox stays accessible while streaming.
    // The sandbox itself is managed by createSandboxWithAutoPause (auto-pauses
    // after idle timeout), so we just remove the context reference here.
    //
    // NOTE: we intentionally do NOT remove synchronously — the stream is still
    // being consumed.  Instead, schedule cleanup after a generous delay to
    // cover the full streaming duration (maxDuration=300s).
    setTimeout(
      () => {
        const activeContext = activeSandboxContexts.get(projectId);
        // Do not remove a newer context for the same project.
        if (activeContext === context) {
          activeSandboxContexts.delete(projectId);
        }
      },
      5 * 60 * 1000,
    ); // 5 minutes — matches maxDuration
  }
}

/**
 * Check if we're currently in a sandbox context.
 */
export function hasSandboxContext(): boolean {
  return (
    sandboxStorage.getStore() !== undefined || activeSandboxContexts.size > 0
  );
}
