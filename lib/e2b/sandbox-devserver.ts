import type { Sandbox } from "e2b";
import { executeCommand } from "./sandbox-commands";

// Re-declare the CodeInterpreterSandbox type locally to avoid pulling in the full module
type CodeInterpreterSandbox = import("@e2b/code-interpreter").Sandbox;

// Track background processes: projectId -> process handle
export const backgroundProcesses = new Map<string, any>();

/**
 * Wait for a dev server to be ready by polling port status.
 * Uses `ss -tln` to check if the port has a listening socket.
 * This is more reliable than HTTP checks which depend on curl/bun availability.
 *
 * @param sandbox - The E2B sandbox instance
 * @param port - Port to check (default: 3000)
 * @param maxWaitMs - Maximum time to wait in ms (default: 30000)
 * @param pollInterval - Time between polls in ms (default: 1000)
 * @returns Object with success status and optional error
 */
export async function waitForDevServer(
  sandbox: Sandbox | CodeInterpreterSandbox,
  port: number = 3000,
  maxWaitMs: number = 30000,
  pollInterval: number = 1000,
): Promise<{ success: boolean; port: number; error?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const result = await sandbox.commands.run(
        `ss -tln 2>/dev/null | grep -q ":${port} " && echo "listening" || echo "closed"`,
        { timeoutMs: 3000 },
      );

      if (result.stdout.trim() === "listening") {
        console.log(`[waitForDevServer] Server ready on port ${port}`);
        return { success: true, port };
      }
    } catch {
      // Ignore errors during polling, keep trying
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    success: false,
    port,
    error: `Dev server did not respond on port ${port} within ${maxWaitMs / 1000}s`,
  };
}

/**
 * Verify that an HTTP server on a port actually responds.
 * A listening socket alone is not sufficient: stale/hung processes can bind
 * the port while never serving requests.
 */
export async function checkDevServerHttp(
  sandbox: Sandbox | CodeInterpreterSandbox,
  port: number,
): Promise<{ ok: boolean; httpCode: string }> {
  const normalizeHttpCode = (raw: string): string => {
    const trimmed = raw.trim();
    const match = trimmed.match(/(\d{3})(?!.*\d)/);
    return match ? match[1] : "000";
  };

  // Prefer curl when available because it's lightweight and reliable.
  try {
    const curlCheck = await sandbox.commands.run(
      `code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:${port} 2>/dev/null || true)"; printf '%s' "$code"`,
      { timeoutMs: 7000 },
    );
    const httpCode = normalizeHttpCode(curlCheck.stdout);
    if (httpCode !== "000") {
      return { ok: true, httpCode };
    }
  } catch {
    // Fall through to bun/node fallback
  }

  // Fallback when curl is unavailable: try bun fetch.
  try {
    const bunCheck = await sandbox.commands.run(
      `bun -e "try{const r=await fetch('http://127.0.0.1:${port}');console.log(String(r.status))}catch{console.log('000')}"`,
      { timeoutMs: 7000 },
    );
    const httpCode = normalizeHttpCode(bunCheck.stdout);
    return { ok: httpCode !== "000", httpCode };
  } catch {
    return { ok: false, httpCode: "000" };
  }
}

/**
 * Check if a dev server is running and listening on any of the common ports.
 * Uses `ss -tln` for fast, reliable port-listening detection.
 * This works in any sandbox environment without depending on curl or bun fetch.
 *
 * @param sandbox - The E2B sandbox instance
 * @param ports - Ports to check (default: [3000, 3001, 3002, 3003, 3004, 3005])
 * @returns Object with running status and active port
 */
export async function checkDevServerStatus(
  sandbox: Sandbox | CodeInterpreterSandbox,
  ports: number[] = [3000, 3001, 3002, 3003, 3004, 3005],
): Promise<{ isRunning: boolean; port: number | null; httpCode?: string }> {
  try {
    // Single command to check all ports at once - much faster than per-port probing.
    // Keep the command exit code 0 on "no match" to avoid unnecessary fallback delays.
    const result = await sandbox.commands.run(
      `if command -v ss >/dev/null 2>&1; then ss -tln 2>/dev/null | grep -oE ':(${ports.join("|")}) ' | grep -oE '[0-9]+' | head -1 || true; else echo "__NO_SS__"; fi`,
      { timeoutMs: 3000 },
    );

    const output = result.stdout.trim();
    if (output !== "__NO_SS__") {
      const detectedPort = parseInt(output.split(/\s+/)[0] || "", 10);
      if (detectedPort > 0) {
        const httpCheck = await checkDevServerHttp(sandbox, detectedPort);
        if (httpCheck.ok) {
          return {
            isRunning: true,
            port: detectedPort,
            httpCode: httpCheck.httpCode,
          };
        }
      }
      // `ss` is available but did not yield a healthy port.
      // Continue into fallbacks (lsof, /dev/tcp) before reporting false.
    }
  } catch {
    // Ignore and try fallback below.
  }

  // Fast fallback when `ss` is unavailable: try `lsof` once.
  try {
    const lsofResult = await sandbox.commands.run(
      `if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -oE ':(${ports.join("|")})\\b' | head -1 | tr -d ':' || true; fi`,
      { timeoutMs: 3000 },
    );
    const lsofPort = parseInt(lsofResult.stdout.trim(), 10);
    if (lsofPort > 0) {
      const httpCheck = await checkDevServerHttp(sandbox, lsofPort);
      if (httpCheck.ok) {
        return {
          isRunning: true,
          port: lsofPort,
          httpCode: httpCheck.httpCode,
        };
      }
    }
  } catch {
    // Ignore and continue.
  }

  // Last-resort fallback: /dev/tcp probe.
  for (const port of ports) {
    try {
      const result = await sandbox.commands.run(
        `(echo > /dev/tcp/localhost/${port}) 2>/dev/null && echo "open" || echo "closed"`,
        { timeoutMs: 750 },
      );
      if (result.stdout.trim() === "open") {
        const httpCheck = await checkDevServerHttp(sandbox, port);
        if (httpCheck.ok) {
          return { isRunning: true, port, httpCode: httpCheck.httpCode };
        }
      }
    } catch {
      continue;
    }
  }

  return { isRunning: false, port: null };
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
    workingDir?: string;
    projectId?: string;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  },
) {
  console.log(
    `[startBackgroundProcess] Starting command: ${command} in ${options?.workingDir || "default cwd"}`,
  );
  try {
    // Use native E2B SDK v2 background API
    const process = await sandbox.commands.run(command, {
      background: true,
      cwd: options?.workingDir,
      onStdout: options?.onStdout,
      onStderr: options?.onStderr,
    });
    console.log(`[startBackgroundProcess] Native command started successfully`);

    // Track process for cleanup
    if (options?.projectId) {
      backgroundProcesses.set(options.projectId, process);
    }

    return { started: true, process };
  } catch (error) {
    console.warn(
      `[startBackgroundProcess] Native API failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Fallback to shell-based approach if native API fails
    const fullCommand = options?.workingDir
      ? `cd ${options.workingDir} && ${command}`
      : command;

    try {
      await sandbox.commands.run(
        `nohup sh -c "${fullCommand}" > /tmp/server.log 2>&1 &`,
        {
          timeoutMs: 5_000,
        },
      );
      return { started: true, process: null };
    } catch (fallbackError) {
      // Even if the command times out, the background process may have started
      console.warn(
        `Background process command timed out, but process may still be running: ${command}`,
        fallbackError,
      );
      return { started: true, process: null };
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
export async function killBackgroundProcess(
  projectId: string,
): Promise<boolean> {
  const process = backgroundProcesses.get(projectId);
  if (process) {
    try {
      await process.kill();
      backgroundProcesses.delete(projectId);
      return true;
    } catch (error) {
      console.warn(
        `Failed to kill background process for ${projectId}:`,
        error,
      );
      backgroundProcesses.delete(projectId);
      return false;
    }
  }
  return false;
}
