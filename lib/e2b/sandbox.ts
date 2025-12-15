import { Sandbox } from "e2b"
import { Sandbox as CodeInterpreter } from "@e2b/code-interpreter"

// Sandbox manager to track active sandboxes
const activeSandboxes = new Map<string, Sandbox>()
const codeInterpreterSandboxes = new Map<string, CodeInterpreter>()

// Default timeout for sandboxes (10 minutes for website generation)
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

/**
 * Creates or retrieves an existing sandbox for a project.
 * Sandboxes are isolated cloud environments for code execution.
 *
 * @param projectId - Unique identifier for the project
 * @param templateId - Optional custom template ID (overrides E2B_TEMPLATE_ID env var)
 */
export async function createSandbox(projectId: string, templateId?: string): Promise<Sandbox> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sandbox.ts:createSandbox:entry',message:'createSandbox called',data:{projectId,templateId,hasExisting:activeSandboxes.has(projectId),envTemplateId:CUSTOM_TEMPLATE_ID},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
  // #endregion

  // Check if sandbox already exists for this project
  const existing = activeSandboxes.get(projectId)
  if (existing) {
    try {
      // Verify sandbox is still alive by extending timeout
      await existing.setTimeout(DEFAULT_TIMEOUT_MS)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sandbox.ts:createSandbox:reuse',message:'Reusing existing sandbox',data:{projectId,sandboxId:existing.sandboxId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
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

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sandbox.ts:createSandbox:created',message:'New sandbox created',data:{projectId,sandboxId:sandbox.sandboxId,template:template||'default'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
    // #endregion

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
 */
export async function closeSandbox(projectId: string): Promise<void> {
  const sandbox = activeSandboxes.get(projectId)
  if (sandbox) {
    try {
      await sandbox.kill()
    } catch (error) {
      console.error(`Failed to kill sandbox for project ${projectId}:`, error)
    } finally {
      activeSandboxes.delete(projectId)
    }
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
        error: execution.error ? { message: execution.error.message } : null,
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
 * Execute shell commands in sandbox with improved error handling.
 *
 * @param sandbox - The E2B sandbox instance
 * @param command - The shell command to execute
 * @param timeoutMs - Optional timeout in milliseconds (default: 5 minutes)
 */
export async function executeCommand(
  sandbox: Sandbox | CodeInterpreter,
  command: string,
  timeoutMs: number = 300_000
) {
  try {
    // Dynamic timeout based on command type
    // npm install commands get longer timeout
    const effectiveTimeout = command.includes("npm install")
      ? 600_000 // 10 minutes for npm install
      : timeoutMs

    const result = await sandbox.commands.run(command, {
      timeoutMs: effectiveTimeout,
    })

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.exitCode,
    }
  } catch (error) {
    // Improved error handling with specific error types
    const errorMessage = error instanceof Error ? error.message : "Command execution failed"

    // Log detailed error for debugging
    console.error(`E2B command failed: "${command.slice(0, 100)}..."`, {
      error: errorMessage,
      commandLength: command.length,
    })

    return {
      stdout: "",
      stderr: errorMessage,
      exitCode: 1,
    }
  }
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
    await sandbox.files.write(path, content)
    return { success: true, path }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error(`E2B write file failed: "${path}"`, { error: errorMessage })
    throw new Error(`Failed to write ${path}: ${errorMessage}`)
  }
}

/**
 * Write multiple files to sandbox filesystem efficiently.
 * E2B SDK v2 best practice: Batch file writes when possible.
 *
 * @param sandbox - The E2B sandbox instance
 * @param files - Array of {path, content} objects
 */
export async function writeFiles(
  sandbox: Sandbox | CodeInterpreter,
  files: Array<{ path: string; content: string | Buffer }>
) {
  try {
    // Write files in parallel for better performance
    const results = await Promise.allSettled(
      files.map(({ path, content }) => sandbox.files.write(path, content))
    )

    const succeeded = results.filter((r) => r.status === "fulfilled").length
    const failed = results.filter((r) => r.status === "rejected")

    if (failed.length > 0) {
      console.warn(`E2B batch write: ${succeeded} succeeded, ${failed.length} failed`)
    }

    return {
      success: failed.length === 0,
      succeeded,
      failed: failed.length,
      paths: files.map((f) => f.path),
    }
  } catch (error) {
    throw new Error(
      `Batch file write failed: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
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
 * Returns immediately without waiting for the process to complete.
 */
export async function startBackgroundProcess(
  sandbox: Sandbox,
  command: string,
  workingDir?: string
) {
  const fullCommand = workingDir ? `cd ${workingDir} && ${command}` : command
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sandbox.ts:startBackgroundProcess:entry',message:'Starting background process',data:{command,workingDir,fullCommand},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion

  // Run in background with nohup to prevent termination
  // The & at the end makes it a background job, but we use timeout:0 to fire-and-forget
  // IMPORTANT: Wrap in sh -c because shell built-ins like 'cd' need a shell interpreter
  try {
    // Use nohup with sh -c to properly handle the command with cd and redirection
    // Setting a short timeout since the & should return immediately
    await sandbox.commands.run(`nohup sh -c "${fullCommand}" > /tmp/server.log 2>&1 &`, {
      timeoutMs: 5_000,
    })
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sandbox.ts:startBackgroundProcess:success',message:'Background process started',data:{fullCommand},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    return { started: true }
  } catch (error) {
    // Even if the command times out, the background process may have started
    // Log the error but still return started: true since the process likely began
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sandbox.ts:startBackgroundProcess:timeout',message:'Command timed out but process may have started',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    console.warn(`Background process command timed out, but process may still be running: ${command}`)
    return { started: true }
  }
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
    total: activeSandboxes.size + codeInterpreterSandboxes.size,
    regularSandboxIds: Array.from(activeSandboxes.keys()),
    codeSandboxIds: Array.from(codeInterpreterSandboxes.keys()),
  }
}
