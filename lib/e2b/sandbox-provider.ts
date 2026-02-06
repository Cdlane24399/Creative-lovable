/**
 * Sandbox Provider - Infrastructure-level sandbox management
 *
 * This module provides infrastructure-level sandbox lifecycle management,
 * separating sandbox concerns from AI tool logic. Tools should receive
 * a sandbox instance rather than creating their own.
 */

import { Sandbox } from "e2b"
import { createSandbox, createSandboxWithAutoPause } from "./sandbox"

// Per-request sandbox storage (using AsyncLocalStorage for request isolation)
import { AsyncLocalStorage } from "async_hooks"

interface SandboxContext {
  sandbox: Sandbox
  projectId: string
  projectDir: string
}

const sandboxStorage = new AsyncLocalStorage<SandboxContext>()

/**
 * Get the current sandbox from the request context.
 * Throws if not in a sandbox context.
 */
export function getCurrentSandbox(): Sandbox {
  const context = sandboxStorage.getStore()
  if (!context) {
    throw new Error("No sandbox context available. Call withSandbox() first.")
  }
  return context.sandbox
}

/**
 * Get the current project ID from the request context.
 */
export function getCurrentProjectId(): string {
  const context = sandboxStorage.getStore()
  if (!context) {
    throw new Error("No sandbox context available. Call withSandbox() first.")
  }
  return context.projectId
}

/**
 * Get the current project directory from the request context.
 */
export function getCurrentProjectDir(): string {
  const context = sandboxStorage.getStore()
  if (!context) {
    throw new Error("No sandbox context available. Call withSandbox() first.")
  }
  return context.projectDir
}

/**
 * Execute a function within a sandbox context.
 * The sandbox is created once and reused for all operations within the callback.
 *
 * @param projectId - The project ID for sandbox identification
 * @param fn - Function to execute with sandbox context
 * @returns Result of the function
 */
export async function withSandbox<T>(
  projectId: string,
  fn: () => Promise<T>,
  options: {
    projectDir?: string
    autoPause?: boolean
  } = {}
): Promise<T> {
  const projectDir = options.projectDir || "/home/user/project"
  const autoPause = options.autoPause ?? true

  // Create or get existing sandbox
  const sandbox = autoPause
    ? await createSandboxWithAutoPause(projectId)
    : await createSandbox(projectId)

  const context: SandboxContext = {
    sandbox,
    projectId,
    projectDir,
  }

  // Run function within sandbox context
  return sandboxStorage.run(context, fn)
}

/**
 * Check if we're currently in a sandbox context.
 */
export function hasSandboxContext(): boolean {
  return sandboxStorage.getStore() !== undefined
}

/**
 * Lazy sandbox getter for tools that need to support both modes.
 * Prefers context sandbox, falls back to creating one.
 * @deprecated Use getCurrentSandbox() within withSandbox() instead
 */
export async function getSandboxLazy(projectId: string): Promise<Sandbox> {
  const context = sandboxStorage.getStore()
  if (context) {
    return context.sandbox
  }
  // Fallback for backward compatibility
  console.warn("[SandboxProvider] No sandbox context, creating ad-hoc sandbox. Use withSandbox() for proper lifecycle management.")
  return createSandboxWithAutoPause(projectId)
}
