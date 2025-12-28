/**
 * Dev Server Management API
 * 
 * Handles starting, stopping, and monitoring the development server
 * in E2B sandboxes. Optimized for fast responses with minimal polling.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  createSandbox,
  getSandbox,
  executeCommand,
  getHostUrl,
  startBackgroundProcess,
  killBackgroundProcess,
  checkDevServerStatus,
} from "@/lib/e2b/sandbox"

export const maxDuration = 60

interface DevServerStatus {
  isRunning: boolean
  port: number | null
  url: string | null
  logs: string[]
  errors: string[]
  lastChecked: string
}

// Cache for server status to reduce redundant checks
const statusCache = new Map<string, { status: DevServerStatus; timestamp: number }>()
const CACHE_TTL_MS = 1500 // Cache valid for 1.5 seconds

// Track in-flight start requests to prevent duplicates
const startingProjects = new Map<string, Promise<any>>()

/**
 * GET /api/sandbox/[projectId]/dev-server
 * Get the current status of the dev server (with caching to reduce log noise)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  // Check cache first to reduce redundant status checks
  const cached = statusCache.get(projectId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.status)
  }

  try {
    const sandbox = await getSandbox(projectId)
    
    if (!sandbox) {
      const status: DevServerStatus = {
        isRunning: false,
        port: null,
        url: null,
        logs: [],
        errors: [],
        lastChecked: new Date().toISOString(),
      }
      statusCache.set(projectId, { status, timestamp: Date.now() })
      return NextResponse.json(status)
    }

    // Check if server is responding using curl (more reliable than nc -z)
    // This verifies the server can actually serve HTTP requests, not just that port is open
    const serverStatus = await checkDevServerStatus(sandbox)
    const isRunning = serverStatus.isRunning
    const activePort = serverStatus.port || 3000

    // Only fetch logs if server is running and we need them for error checking
    let logs: string[] = []
    let errors: string[] = []

    if (isRunning) {
      // Minimal log fetch - just check for recent errors
      const logsResult = await executeCommand(
        sandbox,
        `tail -n 20 /tmp/server.log 2>/dev/null | grep -i -E "error|failed|cannot" || echo ""`,
        { timeoutMs: 3000 }
      )
      const errorLines = logsResult.stdout.trim()
      if (errorLines) {
        errors = errorLines.split("\n").filter(Boolean)
      }
    }

    const url = isRunning ? getHostUrl(sandbox, activePort) : null

    const status: DevServerStatus = {
      isRunning,
      port: isRunning ? activePort : null,
      url,
      logs: [], // Don't send full logs on every poll - use getLogs endpoint if needed
      errors,
      lastChecked: new Date().toISOString(),
    }

    // Cache the result
    statusCache.set(projectId, { status, timestamp: Date.now() })

    return NextResponse.json(status)
  } catch (error) {
    // Silent error - don't log every failed status check
    
    // Return not running status on error
    const status: DevServerStatus = {
      isRunning: false,
      port: null,
      url: null,
      logs: [],
      errors: error instanceof Error ? [error.message] : ["Failed to check server status"],
      lastChecked: new Date().toISOString(),
    }
    return NextResponse.json(status)
  }
}

/**
 * POST /api/sandbox/[projectId]/dev-server
 * Start the dev server (fast startup, let client handle loading state)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  console.log("[dev-server POST] Starting for projectId:", projectId)

  // Check if already starting - prevent duplicate requests
  const existingStart = startingProjects.get(projectId)
  if (existingStart) {
    console.log("[dev-server POST] Already starting, waiting for existing request")
    try {
      return await existingStart
    } catch (err) {
      // If existing request failed, continue with new attempt
      startingProjects.delete(projectId)
    }
  }

  // Create promise for this start operation
  const startPromise = (async () => {
    try {
      const body = await req.json().catch(() => ({}))
      const { projectName = "project", sandboxId: providedSandboxId, forceRestart = false } = body
      console.log("[dev-server POST] Params:", { projectName, providedSandboxId, forceRestart })

      // If sandboxId is provided, try to connect to that specific sandbox first
      let sandbox
      if (providedSandboxId) {
        try {
          const { Sandbox } = await import("e2b")
          console.log("[dev-server POST] Connecting to provided sandbox:", providedSandboxId)
          sandbox = await Sandbox.connect(providedSandboxId, { timeoutMs: 10 * 60 * 1000 })
          console.log("[dev-server POST] Successfully connected to sandbox:", sandbox.sandboxId)
        } catch (err) {
          console.warn("[dev-server POST] Failed to connect to provided sandbox, falling back to createSandbox:", err)
          sandbox = await createSandbox(projectId)
        }
      } else {
        sandbox = await createSandbox(projectId)
      }
      console.log("[dev-server POST] Using sandbox:", sandbox.sandboxId)

      // When using E2B template, files are written to /home/user/project
      // The template already has the dev server running there
      const hasTemplate = !!process.env.E2B_TEMPLATE_ID
      const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${projectName}`

      // Check if project directory exists
      const checkDir = await executeCommand(
        sandbox, 
        `test -d ${projectDir} && echo "exists" || echo "not_exists"`, 
        { timeoutMs: 5000 }
      )
      console.log("[dev-server POST] Directory check:", { projectDir, result: checkDir.stdout.trim() })

      if (checkDir.stdout.trim() !== "exists") {
        console.error("[dev-server POST] Project directory not found:", projectDir)
        return NextResponse.json(
          { error: `Project directory not found: ${projectDir}` },
          { status: 404 }
        )
      }

      // Kill any existing processes if force restart
      if (forceRestart) {
        console.log("[dev-server POST] Force restart requested, killing existing processes")
        await killBackgroundProcess(projectId)
        await executeCommand(
          sandbox, 
          `pkill -f "next dev" 2>/dev/null || true`, 
          { timeoutMs: 5000 }
        )
        // Kill all ports in range
        for (const port of [3000, 3001, 3002, 3003, 3004, 3005]) {
          await executeCommand(
            sandbox,
            `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`,
            { timeoutMs: 2000 }
          )
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Quick check if server is already running using HTTP status (more reliable)
      const existingStatus = await checkDevServerStatus(sandbox)
      const alreadyRunning = existingStatus.isRunning
      const existingPort = existingStatus.port || 3000

      console.log(`[dev-server POST] Already running check: ${alreadyRunning} on port ${existingPort}`)

      if (alreadyRunning && !forceRestart) {
        const url = getHostUrl(sandbox, existingPort)
        // Clear cache to ensure fresh status
        statusCache.delete(projectId)
        return NextResponse.json({
          success: true,
          alreadyRunning: true,
          url,
          port: existingPort,
          message: "Dev server is already running",
        })
      }

      // Clear server log for fresh output (but preserve .next cache for faster rebuilds)
      await executeCommand(sandbox, `rm -f /tmp/server.log 2>/dev/null || true`, { timeoutMs: 5000 })

      // Start the dev server in background
      console.log("[dev-server POST] Starting background process...")
      await startBackgroundProcess(sandbox, "npm run dev > /tmp/server.log 2>&1", {
        workingDir: projectDir,
        projectId,
      })
      console.log("[dev-server POST] Background process started")

      // Extended wait for server startup (30 seconds max to account for slower environments)
      const maxWaitMs = 30000
      const pollInterval = 1000
      const maxPolls = Math.ceil(maxWaitMs / pollInterval)

      let serverReady = false
      let actualPort = 3000

      console.log("[dev-server POST] Polling for server readiness (max 30s)...")
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval))

        // Check for port in logs first (Next.js logs the port it binds to)
        const logCheck = await executeCommand(
          sandbox,
          `grep -oE "http://localhost:[0-9]+" /tmp/server.log 2>/dev/null | tail -1 | grep -oE "[0-9]+$" || echo ""`,
          { timeoutMs: 2000 }
        )
        const logPort = parseInt(logCheck.stdout.trim(), 10)

        if (logPort > 0) {
          console.log(`[dev-server POST] Found port ${logPort} in logs, verifying with HTTP check...`)
          // Use curl to verify server is actually responding (not just port open)
          const httpCheck = await executeCommand(
            sandbox,
            `curl -s -o /dev/null -w '%{http_code}' http://localhost:${logPort} 2>/dev/null || echo "000"`,
            { timeoutMs: 5000 }
          )
          const httpCode = httpCheck.stdout.trim()
          if (httpCode.startsWith('2') || httpCode.startsWith('3')) {
            console.log(`[dev-server POST] Server responding on port ${logPort} with HTTP ${httpCode}`)
            serverReady = true
            actualPort = logPort
            break
          }
        }

        // Fallback: Check all possible ports using HTTP status
        const portStatus = await checkDevServerStatus(sandbox)
        if (portStatus.isRunning && portStatus.port) {
          console.log(`[dev-server POST] Server responding on port ${portStatus.port} with HTTP ${portStatus.httpCode}`)
          serverReady = true
          actualPort = portStatus.port
          break
        }

        // Log progress every 5 seconds
        if ((i + 1) % 5 === 0) {
          const elapsed = (i + 1) * pollInterval / 1000
          console.log(`[dev-server POST] Still waiting... ${elapsed}s elapsed`)

          // Check for errors in logs
          const errorCheck = await executeCommand(
            sandbox,
            `tail -n 15 /tmp/server.log 2>/dev/null | grep -iE "error|failed|EADDRINUSE" || echo ""`,
            { timeoutMs: 2000 }
          )
          if (errorCheck.stdout.trim()) {
            console.warn(`[dev-server POST] Potential issues in logs:`, errorCheck.stdout.trim())
          }
        }
      }

      if (!serverReady) {
        // Get comprehensive logs for debugging
        const logsResult = await executeCommand(
          sandbox, 
          `tail -n 50 /tmp/server.log 2>/dev/null || echo "No logs available"`, 
          { timeoutMs: 3000 }
        )
        
        console.error("[dev-server POST] Server failed to start, logs:", logsResult.stdout)
        
        return NextResponse.json(
          { 
            error: "Dev server failed to start within 30 seconds. The server may still be starting up in the background.",
            logs: logsResult.stdout,
            hint: "Try refreshing the page in a few seconds, or check the server logs for errors."
          },
          { status: 500 }
        )
      }

      const url = getHostUrl(sandbox, actualPort)

      // Clear cache
      statusCache.delete(projectId)

      console.log(`[dev-server POST] Server ready at ${url} on port ${actualPort}`)

      return NextResponse.json({
        success: true,
        alreadyRunning: false,
        url,
        port: actualPort,
        sandboxId: sandbox.sandboxId,
        message: `Dev server started at ${url}`,
      })
    } catch (error) {
      console.error("[dev-server POST] Failed to start dev server:", error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to start dev server" },
        { status: 500 }
      )
    } finally {
      // Clean up tracking
      startingProjects.delete(projectId)
    }
  })()

  // Track this start operation
  startingProjects.set(projectId, startPromise)

  return startPromise
}

/**
 * DELETE /api/sandbox/[projectId]/dev-server
 * Stop the dev server
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  try {
    const sandbox = await getSandbox(projectId)
    
    // Clear cache
    statusCache.delete(projectId)
    
    if (!sandbox) {
      return NextResponse.json({ success: true, message: "No sandbox to stop" })
    }

    // Kill the background process
    await killBackgroundProcess(projectId)
    
    // Also kill any lingering processes on all potential ports
    await executeCommand(
      sandbox, 
      `pkill -f "next dev" 2>/dev/null || true`, 
      { timeoutMs: 5000 }
    )
    
    for (const port of [3000, 3001, 3002, 3003, 3004, 3005]) {
      await executeCommand(
        sandbox,
        `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`,
        { timeoutMs: 2000 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Dev server stopped",
    })
  } catch (error) {
    console.error("[dev-server DELETE] Failed to stop dev server:", error)
    return NextResponse.json(
      { error: "Failed to stop dev server" },
      { status: 500 }
    )
  }
}
