import { Sandbox } from "@e2b/code-interpreter"

// Sandbox manager to track active sandboxes
const activeSandboxes = new Map<string, Sandbox>()

export async function createSandbox(projectId: string): Promise<Sandbox> {
  // Check if sandbox already exists for this project
  const existing = activeSandboxes.get(projectId)
  if (existing) {
    return existing
  }

  // Create new sandbox
  const sandbox = await Sandbox.create({
    timeoutMs: 5 * 60 * 1000, // 5 minutes timeout
  })

  activeSandboxes.set(projectId, sandbox)
  return sandbox
}

export async function getSandbox(projectId: string): Promise<Sandbox | undefined> {
  return activeSandboxes.get(projectId)
}

export async function closeSandbox(projectId: string): Promise<void> {
  const sandbox = activeSandboxes.get(projectId)
  if (sandbox) {
    await sandbox.kill()
    activeSandboxes.delete(projectId)
  }
}

export async function executeCode(sandbox: Sandbox, code: string) {
  const execution = await sandbox.runCode(code)

  return {
    logs: execution.logs,
    results: execution.results,
    error: execution.error,
  }
}

// Execute shell commands in sandbox
export async function executeCommand(sandbox: Sandbox, command: string) {
  const result = await sandbox.commands.run(command)
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  }
}

// Write file to sandbox
export async function writeFile(sandbox: Sandbox, path: string, content: string) {
  await sandbox.files.write(path, content)
  return { success: true, path }
}

// Read file from sandbox
export async function readFile(sandbox: Sandbox, path: string) {
  const content = await sandbox.files.read(path)
  return { content, path }
}
