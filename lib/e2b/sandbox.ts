import { Sandbox } from "e2b"
import { Sandbox as CodeInterpreter } from "@e2b/code-interpreter"

// Sandbox manager to track active sandboxes
const activeSandboxes = new Map<string, Sandbox>()
const codeInterpreterSandboxes = new Map<string, CodeInterpreter>()
const backgroundProcesses = new Map<string, any>() // projectId -> process handle
const pausedSandboxes = new Map<string, { sandboxId: string; pausedAt: Date }>() // projectId -> paused sandbox info

// Default timeout for sandboxes (10 minutes for website generation)
// Note: E2B default is 5 minutes, extended to 10 for:
// - npm install without templates (3-5 minutes)
// - Complex build processes
// - Multiple iterative operations
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

// Get custom template ID from environment (optional)
const CUSTOM_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID

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
 * @param projectId - Unique identifier for the project
 * @param templateId - Optional custom template ID (overrides E2B_TEMPLATE_ID env var)
 */
export async function createSandbox(projectId: string, templateId?: string): Promise<Sandbox> {
  // Check if sandbox already exists for this project
  const existing = activeSandboxes.get(projectId)
  if (existing) {
    try {
      // Verify sandbox is still alive by extending timeout
      await existing.setTimeout(DEFAULT_TIMEOUT_MS)
      return existing
    } catch {
      // Sandbox expired or errored, remove from cache
      activeSandboxes.delete(projectId)
    }
  }

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

    // Log template usage for debugging
    if (template) {
      console.log(`Created sandbox for project ${projectId} using template: ${template}`)
    }

    return sandbox
  } catch (error) {
    console.error(`Failed to create E2B sandbox for project ${projectId}:`, error)
    throw new Error(`Sandbox creation failed: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Retrieves an existing sandbox for a project without creating a new one.
 */
export async function getSandbox(projectId: string): Promise<Sandbox | undefined> {
  const sandbox = activeSandboxes.get(projectId)
  if (sandbox) {
    try {
      // Verify sandbox is still alive
      await sandbox.setTimeout(DEFAULT_TIMEOUT_MS)
      return sandbox
    } catch {
      // Sandbox expired, remove from cache
      activeSandboxes.delete(projectId)
      return undefined
    }
  }
  return undefined
}

/**
 * Closes and cleans up a sandbox for a project.
 * Also kills any associated background processes.
 */
export async function closeSandbox(projectId: string): Promise<void> {
  // Kill background processes first
  await killBackgroundProcess(projectId)

  const sandbox = activeSandboxes.get(projectId)
  if (sandbox) {
    try {
      await sandbox.kill()
    } catch (error) {
      console.error(`Failed to kill sandbox for project ${projectId}:`, error)
    } finally {
      activeSandboxes.delete(projectId)
      pausedSandboxes.delete(projectId)
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
    // @ts-expect-error - betaPause is a beta feature
    if (typeof sandbox.betaPause === "function") {
      // @ts-expect-error - betaPause is a beta feature
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
    // @ts-expect-error - betaCreate is a beta feature
    if (autoPause && typeof Sandbox.betaCreate === "function") {
      // @ts-expect-error - betaCreate is a beta feature
      const sandbox = template
        // @ts-expect-error - betaCreate is a beta feature
        ? await Sandbox.betaCreate(template, {
            timeoutMs: DEFAULT_TIMEOUT_MS,
            autoPause: true,
            metadata: metadata as any,
          })
        // @ts-expect-error - betaCreate is a beta feature
        : await Sandbox.betaCreate({
            timeoutMs: DEFAULT_TIMEOUT_MS,
            autoPause: true,
            metadata: metadata as any,
          })

      activeSandboxes.set(projectId, sandbox)
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
export async function getCodeInterpreterSandbox(projectId: string): Promise<CodeInterpreter> {
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

  // Create new code interpreter sandbox
  const metadata: SandboxMetadata = {
    projectId,
    createdAt: new Date(),
    purpose: "code-execution",
  }

  const sandbox = await CodeInterpreter.create({
    timeoutMs: DEFAULT_TIMEOUT_MS,
    metadata: metadata as any,
  })

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
  sandbox: Sandbox | CodeInterpreter,
  code: string,
  language: CodeLanguage = "python"
) {
  // If it's a CodeInterpreter instance and language is Python, use runCode for better output
  if ("runCode" in sandbox && language === "python") {
    try {
      const execution = await sandbox.runCode(code)
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
    await sandbox.commands.run(`rm -f ${filename}`).catch(() => {})

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
  sandbox: Sandbox | CodeInterpreter,
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
      onStdout: (data) => {
        stdoutLines.push(data)
        options.onStdout?.(data)
        // Report progress for long-running commands
        if (isNpmInstall || isBuild) {
          onProgress?.("output", data.trim().slice(0, 80))
        }
      },
      onStderr: (data) => {
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
    const errorMessage = error instanceof Error ? error.message : "Command execution failed"

    // Log detailed error for debugging
    console.error(`E2B command failed: "${command.slice(0, 100)}..."`, {
      error: errorMessage,
      commandLength: command.length,
      durationMs,
    })

    onProgress?.("error", "Command failed", errorMessage)

    return {
      stdout: "",
      stderr: errorMessage,
      exitCode: 1,
      durationMs,
    }
  }
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
  sandbox: Sandbox | CodeInterpreter,
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
  sandbox: Sandbox | CodeInterpreter,
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
export async function readFile(sandbox: Sandbox | CodeInterpreter, path: string) {
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
  try {
    // Use native E2B SDK v2 background API
    const process = await sandbox.commands.run(command, {
      background: true,
      cwd: options?.workingDir,
      onStdout: options?.onStdout,
      onStderr: options?.onStderr,
    })

    // Track process for cleanup
    if (options?.projectId) {
      backgroundProcesses.set(options.projectId, process)
    }

    return { started: true, process }
  } catch (error) {
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
