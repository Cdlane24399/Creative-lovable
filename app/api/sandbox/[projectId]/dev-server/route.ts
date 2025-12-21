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

    // Quick port check - just see if something is listening
    const statusCheck = await executeCommand(
      sandbox,
      `nc -z 127.0.0.1 3000 && echo "UP" || echo "DOWN"`,
      { timeoutMs: 3000 }
    )
    const isRunning = statusCheck.stdout.trim() === "UP"

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

    const url = isRunning ? getHostUrl(sandbox, 3000) : null

    const status: DevServerStatus = {
      isRunning,
      port: isRunning ? 3000 : null,
      url,
      logs: [], // Don't send full logs on every poll - use getLogs endpoint if needed
      errors,
      lastChecked: new Date().toISOString(),
    }

    // Cache the result
    statusCache.set(projectId, { status, timestamp: Date.now() })

    return NextResponse.json(status)
  } catch (error) {
    // Don't log every status check failure - just return not running
    const status: DevServerStatus = {
      isRunning: false,
      port: null,
      url: null,
      logs: [],
      errors: [],
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

  try {
    const body = await req.json().catch(() => ({}))
    const { projectName = "project", forceRestart = false } = body

    const sandbox = await createSandbox(projectId)
    const projectDir = `/home/user/${projectName}`

    // Check if project directory exists
    const checkDir = await executeCommand(sandbox, `test -d ${projectDir} && echo "exists"`, { timeoutMs: 5000 })
    if (checkDir.stdout.trim() !== "exists") {
      return NextResponse.json(
        { error: `Project directory not found: ${projectDir}` },
        { status: 404 }
      )
    }

    // Kill any existing processes if force restart
    if (forceRestart) {
      await killBackgroundProcess(projectId)
      await executeCommand(sandbox, `pkill -f "next dev" 2>/dev/null; lsof -ti :3000 | xargs kill -9 2>/dev/null; true`, { timeoutMs: 5000 })
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Quick check if server is already running
    const quickCheck = await executeCommand(
      sandbox,
      `nc -z 127.0.0.1 3000 && echo "UP" || echo "DOWN"`,
      { timeoutMs: 3000 }
    )
    const alreadyRunning = quickCheck.stdout.trim() === "UP"

    if (alreadyRunning && !forceRestart) {
      const url = getHostUrl(sandbox, 3000)
      // Clear cache to ensure fresh status
      statusCache.delete(projectId)
      return NextResponse.json({
        success: true,
        alreadyRunning: true,
        url,
        port: 3000,
        message: "Dev server is already running",
      })
    }

    // Clear old .next cache for fresh build
    await executeCommand(sandbox, `rm -rf ${projectDir}/.next 2>/dev/null; rm -f /tmp/server.log 2>/dev/null; true`, { timeoutMs: 5000 })

    // Start the dev server in background
    await startBackgroundProcess(sandbox, "npm run dev > /tmp/server.log 2>&1", {
      workingDir: projectDir,
      projectId,
    })

    // Fast wait - just wait for the server to bind to port (15 seconds max)
    const maxWaitMs = 15000
    const pollInterval = 1000
    const maxPolls = Math.ceil(maxWaitMs / pollInterval)
    
    let serverReady = false

    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval))

      // Check if port is listening
      const check = await executeCommand(
        sandbox,
        `nc -z 127.0.0.1 3000 && echo "UP" || echo "DOWN"`,
        { timeoutMs: 2000 }
      )
      
      if (check.stdout.trim() === "UP") {
        serverReady = true
        break
      }

      // Check for fatal errors only
      const logCheck = await executeCommand(sandbox, `tail -n 10 /tmp/server.log 2>/dev/null | grep -i "EADDRINUSE\\|address already in use" || echo ""`, { timeoutMs: 2000 })
      if (logCheck.stdout.trim()) {
        return NextResponse.json(
          { error: "Port 3000 is already in use. Try force restart." },
          { status: 500 }
        )
      }
    }

    if (!serverReady) {
      // Get logs for debugging
      const logsResult = await executeCommand(sandbox, `tail -n 30 /tmp/server.log 2>/dev/null || echo "No logs"`, { timeoutMs: 3000 })
      return NextResponse.json(
        { 
          error: "Dev server failed to start within timeout",
          logs: logsResult.stdout,
        },
        { status: 500 }
      )
    }

    const url = getHostUrl(sandbox, 3000)

    // Clear cache
    statusCache.delete(projectId)

    return NextResponse.json({
      success: true,
      alreadyRunning: false,
      url,
      port: 3000,
      message: `Dev server started at ${url}`,
    })
  } catch (error) {
    console.error("Failed to start dev server:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start dev server" },
      { status: 500 }
    )
  }
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
    
    // Also kill any lingering processes
    await executeCommand(sandbox, `pkill -f "next dev" 2>/dev/null; lsof -ti :3000 | xargs kill -9 2>/dev/null; true`, { timeoutMs: 5000 })

    return NextResponse.json({
      success: true,
      message: "Dev server stopped",
    })
  } catch (error) {
    console.error("Failed to stop dev server:", error)
    return NextResponse.json(
      { error: "Failed to stop dev server" },
      { status: 500 }
    )
  }
}
