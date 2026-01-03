import { NextResponse } from "next/server"

/**
 * GET /api/health
 * 
 * Liveness probe - checks if the server is running.
 * Used by load balancers and container orchestrators to detect crashed instances.
 * 
 * Returns 200 OK if the process is alive.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
}
