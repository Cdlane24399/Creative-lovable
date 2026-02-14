import type { Sandbox } from "e2b";
import { buildSandboxMetadata } from "./sandbox-metadata";
import { executeCommand } from "./sandbox-commands";
import { writeFile } from "./sandbox-files";

// Re-declare the CodeInterpreterSandbox type locally to avoid pulling in the full module
type CodeInterpreterSandbox = import("@e2b/code-interpreter").Sandbox;

// Supported languages for code execution
export type CodeLanguage = "python" | "javascript" | "typescript" | "js" | "ts";

// Lazy-loaded CodeInterpreter class via dynamic import (avoids Jest issues with require())
let _codeInterpreterPromise: Promise<
  typeof import("@e2b/code-interpreter").Sandbox | undefined
> | null = null;

function getCodeInterpreterClass(): Promise<
  typeof import("@e2b/code-interpreter").Sandbox | undefined
> {
  if (!_codeInterpreterPromise) {
    _codeInterpreterPromise = import("@e2b/code-interpreter")
      .then((mod) => mod.Sandbox)
      .catch(() => undefined);
  }
  return _codeInterpreterPromise;
}

// Track code interpreter sandboxes
const codeInterpreterSandboxes = new Map<string, CodeInterpreterSandbox>();

// Default timeout for sandboxes (imported locally to avoid circular deps)
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Get or create a code interpreter sandbox for code execution.
 * Uses @e2b/code-interpreter for better code execution capabilities.
 *
 * @param projectId - Unique identifier for the project
 */
export async function getCodeInterpreterSandbox(
  projectId: string,
): Promise<CodeInterpreterSandbox> {
  // Check if code interpreter sandbox already exists
  const existing = codeInterpreterSandboxes.get(projectId);
  if (existing) {
    try {
      await existing.setTimeout(DEFAULT_TIMEOUT_MS);
      return existing;
    } catch {
      codeInterpreterSandboxes.delete(projectId);
    }
  }

  // Check if CodeInterpreter is available
  const CodeInterpreter = await getCodeInterpreterClass();
  if (!CodeInterpreter) {
    throw new Error("@e2b/code-interpreter package is not available");
  }

  // Create new code interpreter sandbox
  const metadata = buildSandboxMetadata({
    projectId,
    purpose: "code-execution",
  });

  const sandbox = (await CodeInterpreter.create({
    timeoutMs: DEFAULT_TIMEOUT_MS,
    metadata,
  })) as CodeInterpreterSandbox;

  codeInterpreterSandboxes.set(projectId, sandbox);
  return sandbox;
}

/**
 * Close code interpreter sandbox.
 */
export async function closeCodeInterpreterSandbox(
  projectId: string,
): Promise<void> {
  const sandbox = codeInterpreterSandboxes.get(projectId);
  if (sandbox) {
    try {
      await sandbox.kill();
    } catch (error) {
      console.error(
        `Failed to kill code interpreter sandbox for project ${projectId}:`,
        error,
      );
    } finally {
      codeInterpreterSandboxes.delete(projectId);
    }
  }
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
  sandbox: Sandbox | CodeInterpreterSandbox,
  code: string,
  language: CodeLanguage = "python",
) {
  // If it's a CodeInterpreter instance and language is Python, use runCode for better output
  if ("runCode" in sandbox && language === "python") {
    try {
      const execution = await (sandbox as CodeInterpreterSandbox).runCode(code);
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
      };
    } catch (error) {
      return {
        logs: { stdout: [], stderr: [] },
        results: [],
        error: {
          message:
            error instanceof Error ? error.message : "Code execution failed",
        },
      };
    }
  }

  // Fallback to file-based execution for other languages or regular Sandbox
  const langConfig: Record<CodeLanguage, { ext: string; runner: string }> = {
    python: { ext: "py", runner: "python3" },
    javascript: { ext: "js", runner: "node" },
    typescript: { ext: "ts", runner: "npx tsx" },
    js: { ext: "js", runner: "node" },
    ts: { ext: "ts", runner: "npx tsx" },
  };

  const config = langConfig[language];
  const filename = `/tmp/code_${Date.now()}.${config.ext}`;

  try {
    // Write code to file
    await sandbox.files.write(filename, code);

    // Execute the code with timeout
    const result = await sandbox.commands.run(`${config.runner} ${filename}`, {
      timeoutMs: 60_000,
    });

    // Clean up temporary file
    await sandbox.commands.run(`rm -f ${filename}`).catch(() => {});

    return {
      logs: {
        stdout: result.stdout ? [result.stdout] : [],
        stderr: result.stderr ? [result.stderr] : [],
      },
      results: [],
      error:
        result.exitCode !== 0
          ? { message: result.stderr || "Execution failed" }
          : null,
    };
  } catch (error) {
    return {
      logs: { stdout: [], stderr: [] },
      results: [],
      error: {
        message:
          error instanceof Error ? error.message : "Code execution failed",
      },
    };
  }
}

/**
 * Get the internal codeInterpreterSandboxes map.
 * Used by lifecycle functions for cleanup.
 */
export { codeInterpreterSandboxes };
