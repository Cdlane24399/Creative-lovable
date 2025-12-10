import { mkdtemp, writeFile as fsWriteFile, readFile as fsReadFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { spawn } from "bun"

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

export async function executeCode(sandbox: BunSandbox, code: string) {
  // Determine language from code (simple heuristic)
  const isPython = code.includes("import ") || code.includes("def ") || code.includes("print(")
  const ext = isPython ? "py" : "ts"
  const runner = isPython ? ["python3"] : ["bun", "run"]

  // Write code to temp file
  const filename = `script.${ext}`
  const filepath = join(sandbox.dir, filename)
  await fsWriteFile(filepath, code, "utf-8")

  // Execute the code
  const proc = spawn([...runner, filepath], {
    cwd: sandbox.dir,
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  return {
    logs: {
      stdout: stdout.split("\n").filter(Boolean),
      stderr: stderr.split("\n").filter(Boolean),
    },
    results: [],
    error: exitCode !== 0 ? { message: stderr || "Execution failed" } : undefined,
  }
}

// Execute shell commands in sandbox
export async function executeCommand(sandbox: BunSandbox, command: string) {
  const parts = command.split(" ")
  const proc = spawn(parts, {
    cwd: sandbox.dir,
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  return {
    stdout,
    stderr,
    exitCode,
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
