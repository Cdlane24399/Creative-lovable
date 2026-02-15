/**
 * Dev Server Management API
 *
 * Handles starting, stopping, and monitoring the development server
 * in E2B sandboxes. Optimized for fast responses with minimal polling.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createSandbox,
  connectSandboxById,
  getSandbox,
  executeCommand,
  getHostUrl,
  startBackgroundProcess,
  killBackgroundProcess,
  checkDevServerStatus,
} from "@/lib/e2b/sandbox";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { withAuth } from "@/lib/auth";
import { type ReadableStreamDefaultController } from "node:stream/web";

export const maxDuration = 300;

interface DevServerStatus {
  isRunning: boolean;
  port: number | null;
  url: string | null;
  logs: string[];
  errors: string[];
  lastChecked: string;
}

// Cache for server status to reduce redundant checks
const statusCache = new Map<
  string,
  { status: DevServerStatus; timestamp: number }
>();
const CACHE_TTL_MS = 1500; // Cache valid for 1.5 seconds
const DEV_SERVER_PORTS = [3000, 3001, 3002, 3003, 3004, 3005] as const;
const DEFAULT_WEB_PORT = 3000;

// Track in-flight start requests to prevent duplicates
const startingProjects = new Map<string, Promise<NextResponse>>();

async function waitForRunningPort(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  waitMs: number,
  preferredPort: number = DEFAULT_WEB_PORT,
): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const status = await checkDevServerStatus(sandbox, [
      preferredPort,
      ...DEV_SERVER_PORTS.filter((p) => p !== preferredPort),
    ]);
    if (status.isRunning && status.port) {
      return status.port;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

type PackageManager = "bun" | "pnpm" | "npm";

async function detectPackageManager(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  projectDir: string,
): Promise<PackageManager> {
  const result = await executeCommand(
    sandbox,
    `cd "${projectDir}" && if [ -f bun.lock ] || [ -f bun.lockb ]; then echo "bun"; elif [ -f pnpm-lock.yaml ]; then echo "pnpm"; elif [ -f package-lock.json ]; then echo "npm"; elif command -v bun >/dev/null 2>&1; then echo "bun"; elif command -v pnpm >/dev/null 2>&1; then echo "pnpm"; else echo "npm"; fi`,
    { timeoutMs: 5000 },
  );

  const detected = result.stdout.trim();
  if (detected === "bun" || detected === "pnpm" || detected === "npm") {
    return detected;
  }
  return "npm";
}

function getDevServerCommand(pm: PackageManager): string {
  if (pm === "bun") {
    return "bun run dev --hostname 0.0.0.0 > /tmp/server.log 2>&1";
  }
  if (pm === "pnpm") {
    return "pnpm dev -- --hostname 0.0.0.0 > /tmp/server.log 2>&1";
  }
  return "npm run dev -- --hostname 0.0.0.0 > /tmp/server.log 2>&1";
}

// Helper to get server status
async function getStatus(projectId: string): Promise<DevServerStatus> {
  const now = Date.now();
  const cached = statusCache.get(projectId);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.status;
  }

  try {
    const sandbox = await getSandbox(projectId);

    if (!sandbox) {
      const status: DevServerStatus = {
        isRunning: false,
        port: null,
        url: null,
        logs: [],
        errors: [],
        lastChecked: new Date().toISOString(),
      };
      statusCache.set(projectId, { status, timestamp: Date.now() });
      return status;
    }

    // Check if server has a listening port (fast kernel-level check via ss -tln)
    const serverStatus = await checkDevServerStatus(sandbox);
    const isRunning = serverStatus.isRunning;
    const activePort = serverStatus.port || 3000;

    // Fetch logs if server is running
    const errors: string[] = [];

    if (isRunning) {
      // Minimal log fetch - just check for recent errors
      const logsResult = await executeCommand(
        sandbox,
        `tail -n 20 /tmp/server.log 2>/dev/null | grep -i -E "error|failed|cannot" || echo ""`,
        { timeoutMs: 3000 },
      );
      const errorLines = logsResult.stdout.trim();
      if (errorLines) {
        errors.push(...errorLines.split("\n").filter(Boolean));
      }
    }

    const url = isRunning ? getHostUrl(sandbox, activePort) : null;

    const status: DevServerStatus = {
      isRunning,
      port: isRunning ? activePort : null,
      url,
      logs: [], // Don't send full logs in SSE - use getLogs endpoint if needed
      errors,
      lastChecked: new Date().toISOString(),
    };
    statusCache.set(projectId, { status, timestamp: Date.now() });
    return status;
  } catch (error) {
    console.error("[DevServer] Error checking status:", error);
    const status: DevServerStatus = {
      isRunning: false,
      port: null,
      url: null,
      logs: [],
      errors: ["Failed to check server status"],
      lastChecked: new Date().toISOString(),
    };
    statusCache.set(projectId, { status, timestamp: Date.now() });
    return status;
  }
}

/**
 * GET /api/sandbox/[projectId]/dev-server
 * Stream dev server status using Server-Sent Events (SSE) or return JSON for polling
 */
export const GET = withAuth(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
  ) => {
    const { projectId } = await params;

    // Check if client wants SSE or JSON
    const acceptHeader = req.headers.get("accept") || "";
    const wantsSSE = acceptHeader.includes("text/event-stream");

    // If simple JSON requested (polling), return immediately
    if (!wantsSSE) {
      const status = await getStatus(projectId);
      return NextResponse.json(status);
    }

    // Set up SSE headers
    const responseStream = new ReadableStream({
      start(controller: ReadableStreamDefaultController) {
        let isClosed = false;
        let interval: NodeJS.Timeout | null = null;

        // Helper to safely enqueue data
        const safeEnqueue = (data: string) => {
          if (isClosed) return false;
          try {
            controller.enqueue(data);
            return true;
          } catch {
            // Controller is closed
            isClosed = true;
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            return false;
          }
        };

        // Send initial status
        const sendStatus = async () => {
          if (isClosed) return;

          try {
            const status = await getStatus(projectId);
            safeEnqueue(`data: ${JSON.stringify(status)}\n\n`);
          } catch (error) {
            if (isClosed) return;
            console.error("[SSE] Error sending status:", error);
            const errorStatus: DevServerStatus = {
              isRunning: false,
              port: null,
              url: null,
              logs: [],
              errors: ["Failed to check server status"],
              lastChecked: new Date().toISOString(),
            };
            safeEnqueue(`data: ${JSON.stringify(errorStatus)}\n\n`);
          }
        };

        // Send initial status
        sendStatus();

        // Set up interval to send updates every 2 seconds
        interval = setInterval(sendStatus, 2000);

        // Clean up on client disconnect
        req.signal.addEventListener("abort", () => {
          isClosed = true;
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          try {
            controller.close();
          } catch {
            // Already closed
          }
        });
      },
    });

    // Get allowed origin from environment or use same-origin
    const allowedOrigin =
      process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || "";

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Headers":
          "Cache-Control, Authorization, X-Api-Key",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  },
);

/**
 * POST /api/sandbox/[projectId]/dev-server
 * Start the dev server (fast startup, let client handle loading state)
 */
export const POST = withAuth(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
  ) => {
    const { projectId } = await params;
    console.log("[dev-server POST] Starting for projectId:", projectId);

    // Check if already starting - prevent duplicate requests
    const existingStart = startingProjects.get(projectId);
    if (existingStart) {
      console.log(
        "[dev-server POST] Already starting, waiting for existing request",
      );
      try {
        return await existingStart;
      } catch (err) {
        // If existing request failed, continue with new attempt
        startingProjects.delete(projectId);
      }
    }

    // Create promise for this start operation
    const startPromise = (async () => {
      try {
        const body = await req.json().catch(() => ({}));
        const {
          projectName = "project",
          sandboxId: providedSandboxId,
          forceRestart = false,
          waitForReady = false,
        } = body;
        console.log("[dev-server POST] Params:", {
          projectName,
          providedSandboxId,
          forceRestart,
          waitForReady,
        });

        // If sandboxId is provided, try to connect to that specific sandbox first
        let sandbox;
        if (providedSandboxId) {
          try {
            console.log(
              "[dev-server POST] Connecting to provided sandbox:",
              providedSandboxId,
            );
            sandbox = await connectSandboxById(projectId, providedSandboxId, {
              timeoutMs: 10 * 60 * 1000,
              clearDatabaseOnFailure: false,
            });
            console.log(
              "[dev-server POST] Successfully connected to sandbox:",
              sandbox.sandboxId,
            );
          } catch (err) {
            console.warn(
              "[dev-server POST] Failed to connect to provided sandbox, falling back to createSandbox:",
              err,
            );
            sandbox = await createSandbox(projectId);
          }
        } else {
          sandbox = await createSandbox(projectId);
        }
        console.log("[dev-server POST] Using sandbox:", sandbox.sandboxId);

        // Always use the shared sandbox project directory resolver
        const projectDir = getProjectDir();

        // Check if project directory exists
        const checkDir = await executeCommand(
          sandbox,
          `test -d "${projectDir}" && echo "exists" || echo "not_exists"`,
          { timeoutMs: 5000 },
        );
        console.log("[dev-server POST] Directory check:", {
          projectDir,
          result: checkDir.stdout.trim(),
        });

        if (checkDir.stdout.trim() !== "exists") {
          console.error(
            "[dev-server POST] Project directory not found:",
            projectDir,
          );
          return NextResponse.json(
            { error: `Project directory not found: ${projectDir}` },
            { status: 404 },
          );
        }

        // Ensure we're pointing to a real Next.js workspace, not just an existing directory
        const packageJsonCheck = await executeCommand(
          sandbox,
          `test -f "${projectDir}/package.json" && echo "exists" || echo "missing"`,
          { timeoutMs: 5000 },
        );
        if (packageJsonCheck.stdout.trim() !== "exists") {
          console.error(
            "[dev-server POST] package.json not found in project directory:",
            projectDir,
          );
          return NextResponse.json(
            {
              error: `Project appears uninitialized at ${projectDir} (missing package.json)`,
            },
            { status: 422 },
          );
        }

        // Fragments-style flow: use template/autostart server when available and
        // return sandbox host URL directly when it's already live.
        const initialStatus = await checkDevServerStatus(sandbox);
        const initialPort = initialStatus.port || DEFAULT_WEB_PORT;
        console.log(
          `[dev-server POST] Initial status: running=${initialStatus.isRunning} port=${initialPort}`,
        );

        if (initialStatus.isRunning && !forceRestart) {
          const url = getHostUrl(sandbox, initialPort);
          statusCache.delete(projectId);
          return NextResponse.json({
            success: true,
            alreadyRunning: true,
            url,
            port: initialPort,
            sandboxId: sandbox.sandboxId,
            message: "Dev server is already running",
          });
        }

        // Give template start command a short window before forcing manual restart.
        // This mirrors fragments behavior where template start_cmd boots preview.
        if (!forceRestart && waitForReady) {
          const templatePort = await waitForRunningPort(
            sandbox,
            12_000,
            DEFAULT_WEB_PORT,
          );
          if (templatePort) {
            const url = getHostUrl(sandbox, templatePort);
            statusCache.delete(projectId);
            return NextResponse.json({
              success: true,
              alreadyRunning: false,
              url,
              port: templatePort,
              sandboxId: sandbox.sandboxId,
              message: `Dev server ready at ${url} (template runtime)`,
            });
          }
        }

        // Fallback: clean up and start server manually.
        console.log(
          "[dev-server POST] Cleaning up existing processes and lock files",
        );
        await Promise.all([
          killBackgroundProcess(projectId),
          executeCommand(sandbox, `pkill -f "[n]ext dev" 2>/dev/null || true`, {
            timeoutMs: 5000,
          }),
        ]);
        await Promise.all(
          DEV_SERVER_PORTS.map((port) =>
            executeCommand(
              sandbox,
              `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`,
              { timeoutMs: 2000 },
            ),
          ),
        );
        await executeCommand(
          sandbox,
          `rm -rf "${projectDir}/.next" 2>/dev/null || true`,
          { timeoutMs: 5000 },
        );
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Clear server log for fresh output (but preserve .next cache for faster rebuilds)
        await executeCommand(
          sandbox,
          `rm -f /tmp/server.log 2>/dev/null || true`,
          { timeoutMs: 5000 },
        );

        // Start the dev server in background
        const packageManager = await detectPackageManager(sandbox, projectDir);
        const devServerCommand = getDevServerCommand(packageManager);
        console.log(
          `[dev-server POST] Starting dev server with package manager: ${packageManager}`,
        );
        console.log("[dev-server POST] Starting background process...");
        await startBackgroundProcess(
          sandbox,
          devServerCommand,
          {
            workingDir: projectDir,
            projectId,
          },
        );
        console.log("[dev-server POST] Background process started");

        // Non-blocking default: return immediately and let the client poll status.
        if (!waitForReady) {
          statusCache.delete(projectId);
          return NextResponse.json({
            success: true,
            starting: true,
            alreadyRunning: false,
            url: null,
            port: null,
            sandboxId: sandbox.sandboxId,
            message: "Dev server start initiated; polling for readiness.",
          });
        }

        // Extended wait for server startup (120 seconds max to account for slower environments and first-time builds)
        const maxWaitMs = 120000;
        const pollInterval = 1000;
        const maxPolls = Math.ceil(maxWaitMs / pollInterval);

        let serverReady = false;
        let actualPort = 3000;

        console.log(
          "[dev-server POST] Polling for server readiness (max 120s)...",
        );
        // Adaptive polling: start fast, slow down over time
        const getInterval = (i: number) =>
          i < 5 ? 1000 : i < 15 ? 2000 : 3000;

        for (let i = 0; i < maxPolls; i++) {
          await new Promise((resolve) => setTimeout(resolve, getInterval(i)));

          // Combined check: look for "Ready in" AND port in logs with a single command
          const logCheck = await executeCommand(
            sandbox,
            `grep -c "Ready in" /tmp/server.log 2>/dev/null && grep -oE "http://localhost:[0-9]+" /tmp/server.log 2>/dev/null | tail -1 | grep -oE "[0-9]+$" || echo ""`,
            { timeoutMs: 5000 },
          );
          const lines = logCheck.stdout.trim().split("\n");
          const readyCount = parseInt(lines[0] || "0", 10);
          const logPort = parseInt(lines[1] || "", 10);

          // Trust Next.js "Ready" signal + port as sufficient evidence
          // No HTTP verification needed - the "Ready in" message means the server is accepting connections
          if (readyCount > 0 && logPort > 0) {
            // Verify the port is actually listening (fast kernel-level check)
            const portCheck = await executeCommand(
              sandbox,
              `ss -tln 2>/dev/null | grep -q ":${logPort} " && echo "listening" || echo "closed"`,
              { timeoutMs: 2000 },
            );
            if (portCheck.stdout.trim() === "listening") {
              console.log(
                `[dev-server POST] Server ready on port ${logPort} (Next.js Ready + port listening)`,
              );
              serverReady = true;
              actualPort = logPort;
              break;
            }
          }

          // Fallback: Check all common ports for a listening socket
          const portStatus = await checkDevServerStatus(sandbox);
          if (portStatus.isRunning && portStatus.port) {
            console.log(
              `[dev-server POST] Server detected on port ${portStatus.port}`,
            );
            serverReady = true;
            actualPort = portStatus.port;
            break;
          }

          // Log progress every 5 seconds
          if ((i + 1) % 5 === 0) {
            const elapsed = ((i + 1) * pollInterval) / 1000;
            console.log(
              `[dev-server POST] Still waiting... ${elapsed}s elapsed`,
            );

            // Check for fatal errors in logs that indicate server won't recover
            const errorCheck = await executeCommand(
              sandbox,
              `tail -n 15 /tmp/server.log 2>/dev/null | grep -iE "error|failed|EADDRINUSE|FATAL" || echo ""`,
              { timeoutMs: 5000 },
            );
            if (errorCheck.stdout.trim()) {
              console.warn(
                `[dev-server POST] Potential issues in logs:`,
                errorCheck.stdout.trim(),
              );

              // Check for fatal errors that won't self-resolve
              const fatalCheck = await executeCommand(
                sandbox,
                `tail -n 30 /tmp/server.log 2>/dev/null | grep -c "EADDRINUSE\\|Cannot find module\\|SyntaxError\\|FATAL" || echo "0"`,
                { timeoutMs: 3000 },
              );
              const fatalCount = parseInt(fatalCheck.stdout.trim());
              if (fatalCount > 0 && elapsed >= 15) {
                console.error(
                  `[dev-server POST] Fatal errors detected after ${elapsed}s, stopping wait`,
                );
                break;
              }
            }
          }
        }

        if (!serverReady) {
          // Get comprehensive logs for debugging
          const logsResult = await executeCommand(
            sandbox,
            `tail -n 50 /tmp/server.log 2>/dev/null || echo "No logs available"`,
            { timeoutMs: 3000 },
          );

          console.error(
            "[dev-server POST] Server failed to start, logs:",
            logsResult.stdout,
          );

          return NextResponse.json(
            {
              error:
                "Dev server failed to start within 120 seconds. The server may still be starting up in the background.",
              logs: logsResult.stdout,
              hint: "Try refreshing the page in a few seconds, or check the server logs for errors.",
            },
            { status: 500 },
          );
        }

        const url = getHostUrl(sandbox, actualPort);

        // Clear cache
        statusCache.delete(projectId);

        console.log(
          `[dev-server POST] Server ready at ${url} on port ${actualPort}`,
        );

        return NextResponse.json({
          success: true,
          alreadyRunning: false,
          url,
          port: actualPort,
          sandboxId: sandbox.sandboxId,
          message: `Dev server started at ${url}`,
        });
      } catch (error) {
        console.error("[dev-server POST] Failed to start dev server:", error);
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to start dev server",
          },
          { status: 500 },
        );
      } finally {
        // Clean up tracking
        startingProjects.delete(projectId);
      }
    })();

    // Track this start operation
    startingProjects.set(projectId, startPromise);

    return startPromise;
  },
);

/**
 * DELETE /api/sandbox/[projectId]/dev-server
 * Stop the dev server
 */
export const DELETE = withAuth(
  async (
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
  ) => {
    const { projectId } = await params;

    try {
      const sandbox = await getSandbox(projectId);

      // Clear cache
      statusCache.delete(projectId);

      if (!sandbox) {
        return NextResponse.json({
          success: true,
          message: "No sandbox to stop",
        });
      }

      await Promise.all([
        // Kill the background process
        killBackgroundProcess(projectId),
        // Also kill any lingering processes on all potential ports
        executeCommand(sandbox, `pkill -f "[n]ext dev" 2>/dev/null || true`, {
          timeoutMs: 5000,
        }),
      ]);

      await Promise.all(
        DEV_SERVER_PORTS.map((port) =>
          executeCommand(
            sandbox,
            `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`,
            { timeoutMs: 2000 },
          ),
        ),
      );

      return NextResponse.json({
        success: true,
        message: "Dev server stopped",
      });
    } catch (error) {
      console.error("[dev-server DELETE] Failed to stop dev server:", error);
      return NextResponse.json(
        { error: "Failed to stop dev server" },
        { status: 500 },
      );
    }
  },
);
