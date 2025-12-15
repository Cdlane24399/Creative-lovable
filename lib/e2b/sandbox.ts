import { Sandbox } from "e2b"

// Sandbox manager to track active sandboxes
const activeSandboxes = new Map<string, Sandbox>()

// Default timeout for sandboxes (10 minutes for website generation)
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

// Get custom template ID from environment (optional)
const CUSTOM_TEMPLATE_ID = process.env.E2B_TEMPLATE_ID

// Supported languages for code execution
export type CodeLanguage = "python" | "javascript" | "typescript" | "js" | "ts"

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
  
  // Create new sandbox with configured timeout and optional template
  // E2B SDK uses different overloads: Sandbox.create(template, opts) or Sandbox.create(opts)
  const sandbox = template
    ? await Sandbox.create(template, {
        timeoutMs: DEFAULT_TIMEOUT_MS,
      })
    : await Sandbox.create({
        timeoutMs: DEFAULT_TIMEOUT_MS,
      })

  activeSandboxes.set(projectId, sandbox)
  
  // Log template usage for debugging
  if (template) {
    console.log(`Created sandbox for project ${projectId} using template: ${template}`)
  }
  
  return sandbox
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
 * Executes code by writing it to a file and running it.
 * @param sandbox - The E2B sandbox instance
 * @param code - The code to execute
 * @param language - The programming language (default: "python")
 */
export async function executeCode(
  sandbox: Sandbox,
  code: string,
  language: CodeLanguage = "python"
) {
  // Map language to file extension and runtime
  const langConfig: Record<CodeLanguage, { ext: string; runner: string }> = {
    python: { ext: "py", runner: "python3" },
    javascript: { ext: "js", runner: "node" },
    typescript: { ext: "ts", runner: "npx tsx" },
    js: { ext: "js", runner: "node" },
    ts: { ext: "ts", runner: "npx tsx" },
  }

  const config = langConfig[language]
  const filename = `/tmp/code.${config.ext}`

  // Write code to file
  await sandbox.files.write(filename, code)

  // Execute the code
  const result = await sandbox.commands.run(`${config.runner} ${filename}`, {
    timeoutMs: 60_000,
  })

  return {
    logs: {
      stdout: result.stdout ? [result.stdout] : [],
      stderr: result.stderr ? [result.stderr] : [],
    },
    results: [],
    error: result.exitCode !== 0 ? { message: result.stderr || "Execution failed" } : null,
  }
}

/**
 * Execute shell commands in sandbox.
 * @param sandbox - The E2B sandbox instance
 * @param command - The shell command to execute
 */
export async function executeCommand(sandbox: Sandbox, command: string) {
  const result = await sandbox.commands.run(command, {
    timeoutMs: 300_000, // 5 minute timeout for commands like npm install
  })
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  }
}

/**
 * Write file to sandbox filesystem.
 */
export async function writeFile(sandbox: Sandbox, path: string, content: string) {
  await sandbox.files.write(path, content)
  return { success: true, path }
}

/**
 * Read file from sandbox filesystem.
 */
export async function readFile(sandbox: Sandbox, path: string) {
  const content = await sandbox.files.read(path)
  return { content, path }
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
  return sandbox.getHost(port)
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
  // Run in background with nohup to prevent termination
  await sandbox.commands.run(`nohup ${fullCommand} > /tmp/server.log 2>&1 &`, {
    timeoutMs: 10_000,
  })
  return { started: true }
}

/**
 * Cleanup all active sandboxes (call on server shutdown).
 */
export async function cleanupAllSandboxes(): Promise<void> {
  const promises = Array.from(activeSandboxes.keys()).map(closeSandbox)
  await Promise.allSettled(promises)
}
