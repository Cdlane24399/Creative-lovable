import { mkdtemp, writeFile as fsWriteFile, readFile as fsReadFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { spawn } from "node:child_process"

// Sandbox type definition
export interface BunSandbox {
  id: string
  dir: string
  createdAt: Date
}

// Sandbox manager to track active sandboxes
const activeSandboxes = new Map<string, BunSandbox>()

export async function createSandbox(projectId: string): Promise<BunSandbox> {
  // Check if sandbox already exists for this project
  const existing = activeSandboxes.get(projectId)
  if (existing) {
    return existing
  }

  // Create new sandbox in temp directory
  const dir = await mkdtemp(join(tmpdir(), `sandbox-${projectId}-`))

  const sandbox: BunSandbox = {
    id: projectId,
    dir,
    createdAt: new Date(),
  }

  activeSandboxes.set(projectId, sandbox)
  return sandbox
}

export async function getSandbox(projectId: string): Promise<BunSandbox | undefined> {
  return activeSandboxes.get(projectId)
}

export async function closeSandbox(projectId: string): Promise<void> {
  const sandbox = activeSandboxes.get(projectId)
  if (sandbox) {
    // Clean up the temp directory
    try {
      await rm(sandbox.dir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
    activeSandboxes.delete(projectId)
  }
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: false,
    })

    let stdout = ""
    let stderr = ""

    proc.stdout?.on("data", (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on("data", (data) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      })
    })

    proc.on("error", (err) => {
      resolve({
        stdout,
        stderr: err.message,
        exitCode: 1,
      })
    })
  })
}

export async function executeCode(sandbox: BunSandbox, code: string) {
  // Determine language from code (simple heuristic)
  const isPython = code.includes("import ") || code.includes("def ") || code.includes("print(")
  const ext = isPython ? "py" : "js"
  const runner = isPython ? "python3" : "node"

  // Write code to temp file
  const filename = `script.${ext}`
  const filepath = join(sandbox.dir, filename)
  await fsWriteFile(filepath, code, "utf-8")

  const result = await runProcess(runner, [filepath], sandbox.dir)

  return {
    logs: {
      stdout: result.stdout.split("\n").filter(Boolean),
      stderr: result.stderr.split("\n").filter(Boolean),
    },
    results: [],
    error: result.exitCode !== 0 ? { message: result.stderr || "Execution failed" } : undefined,
  }
}

// Execute shell commands in sandbox
export async function executeCommand(sandbox: BunSandbox, command: string) {
  const parts = command.split(" ")
  const [cmd, ...args] = parts

  const result = await runProcess(cmd, args, sandbox.dir)

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  }
}

// Write file to sandbox
export async function writeFile(sandbox: BunSandbox, path: string, content: string) {
  const fullPath = join(sandbox.dir, path)

  // Ensure directory exists
  await mkdir(dirname(fullPath), { recursive: true })

  await fsWriteFile(fullPath, content, "utf-8")
  return { success: true, path }
}

// Read file from sandbox
export async function readFile(sandbox: BunSandbox, path: string) {
  const fullPath = join(sandbox.dir, path)
  const content = await fsReadFile(fullPath, "utf-8")
  return { content, path }
}
