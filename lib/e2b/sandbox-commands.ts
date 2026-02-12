import type { Sandbox } from "e2b";
import type { ProgressCallback } from "./sandbox-files";

// Re-declare the CodeInterpreterSandbox type locally to avoid pulling in the full module
type CodeInterpreterSandbox = import("@e2b/code-interpreter").Sandbox;

/**
 * Options for executeCommand function.
 */
export interface ExecuteCommandOptions {
  /** Timeout in milliseconds (default: 5 minutes, 10 minutes for npm install) */
  timeoutMs?: number;
  /** Working directory for the command */
  cwd?: string;
  /** Callback for real-time stdout streaming */
  onStdout?: (data: string) => void;
  /** Callback for real-time stderr streaming */
  onStderr?: (data: string) => void;
  /** Progress callback for status updates */
  onProgress?: ProgressCallback;
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
  sandbox: Sandbox | CodeInterpreterSandbox,
  command: string,
  optionsOrTimeout?: number | ExecuteCommandOptions,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}> {
  const startTime = Date.now();

  // Handle backward compatibility: if second param is a number, treat it as timeoutMs
  const options: ExecuteCommandOptions =
    typeof optionsOrTimeout === "number"
      ? { timeoutMs: optionsOrTimeout }
      : optionsOrTimeout || {};

  const { onProgress } = options;

  try {
    // Dynamic timeout based on command type
    // Package install commands get longer timeout
    const isInstall =
      command.includes("bun install") || command.includes("npm install");
    const isBuild =
      command.includes("bun run build") ||
      command.includes("npm run build") ||
      command.includes("next build");
    const effectiveTimeout = isInstall
      ? 600_000 // 10 minutes for package install
      : isBuild
        ? 300_000 // 5 minutes for builds
        : options.timeoutMs || 300_000;

    // Extract command name for progress reporting
    const cmdName = command.split(" ")[0].split("/").pop() || "command";
    onProgress?.("start", `Running: ${cmdName}`, command.slice(0, 100));

    // Wrap stdout/stderr to include progress updates
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    const result = await sandbox.commands.run(command, {
      timeoutMs: effectiveTimeout,
      cwd: options.cwd,
      onStdout: (data: string) => {
        stdoutLines.push(data);
        options.onStdout?.(data);
        // Report progress for long-running commands
        if (isInstall || isBuild) {
          onProgress?.("output", data.trim().slice(0, 80));
        }
      },
      onStderr: (data: string) => {
        stderrLines.push(data);
        options.onStderr?.(data);
      },
    });

    const durationMs = Date.now() - startTime;
    const success = result.exitCode === 0;

    onProgress?.(
      success ? "complete" : "error",
      success
        ? `Completed in ${(durationMs / 1000).toFixed(1)}s`
        : `Failed with exit code ${result.exitCode}`,
      result.stderr?.slice(0, 200),
    );

    return {
      stdout: result.stdout || stdoutLines.join(""),
      stderr: result.stderr || stderrLines.join(""),
      exitCode: result.exitCode,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // E2B SDK may attach stdout/stderr directly to the error object
    const e2bError = error as {
      stderr?: string;
      stdout?: string;
      exitCode?: number;
    };
    const actualStderr = e2bError.stderr || "";
    const actualStdout = e2bError.stdout || "";
    const errorMessage =
      error instanceof Error ? error.message : "Command execution failed";

    // E2B SDK throws on non-zero exit codes - this is often expected behavior
    // (e.g., `test -d` returns 1 when directory doesn't exist)
    // Use debug level unless it's a "real" command failure
    const isTestCommand =
      command.startsWith("test ") || command.includes("&& test ");
    const allowsNonZeroExit = command.includes("|| true");
    const isProcessCleanupCommand =
      /\bpkill\b|\bkill\s+-9\b|\bxargs\s+kill\b/.test(command);
    const isTerminationSignal =
      errorMessage.includes("signal: terminated") ||
      errorMessage.includes("signal: killed");
    const isExpectedFailure =
      (errorMessage.includes("exit status 1") && isTestCommand) ||
      allowsNonZeroExit ||
      (isProcessCleanupCommand && isTerminationSignal);

    if (isExpectedFailure) {
      console.debug(
        `[E2B] Expected non-zero exit: "${command.slice(0, 60)}..."`,
        { durationMs },
      );
    } else {
      // For package manager commands, log more details including actual stderr
      const isPkgManager = command.includes("bun") || command.includes("npm");
      console.error(`[E2B] Command failed: "${command.slice(0, 100)}..."`, {
        error: errorMessage,
        stderr: actualStderr.slice(0, 500) || undefined,
        commandLength: command.length,
        durationMs,
        ...(isPkgManager &&
          !actualStderr && {
            hint: "Check if lock files are conflicting or package manager is available",
          }),
      });
    }

    onProgress?.("error", "Command failed", actualStderr || errorMessage);

    return {
      stdout: actualStdout,
      stderr: actualStderr || errorMessage,
      exitCode: e2bError.exitCode ?? 1,
      durationMs,
    };
  }
}

/**
 * Check if a directory exists in the sandbox.
 * Uses a pattern that always returns exit code 0 to avoid E2B SDK exceptions.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to check
 * @returns true if directory exists, false otherwise
 */
export async function directoryExists(
  sandbox: Sandbox | CodeInterpreterSandbox,
  path: string,
): Promise<boolean> {
  const result = await executeCommand(
    sandbox,
    `test -d ${path} && echo "exists" || echo "not_exists"`,
  );
  return result.stdout.trim() === "exists";
}

/**
 * Check if a file exists in the sandbox.
 * Uses a pattern that always returns exit code 0 to avoid E2B SDK exceptions.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to check
 * @returns true if file exists, false otherwise
 */
export async function fileExists(
  sandbox: Sandbox | CodeInterpreterSandbox,
  path: string,
): Promise<boolean> {
  const result = await executeCommand(
    sandbox,
    `test -f ${path} && echo "exists" || echo "not_exists"`,
  );
  return result.stdout.trim() === "exists";
}
