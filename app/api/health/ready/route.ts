import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

interface HealthCheck {
  name: string
  status: "healthy" | "unhealthy" | "degraded"
  latencyMs?: number
  message?: string
}

/**
 * GET /api/health/ready
 * 
 * Readiness probe - checks if the server is ready to serve traffic.
 * Verifies all critical dependencies (database, cache, external services).
 * 
 * Returns:
 * - 200 OK: All dependencies healthy
 * - 503 Service Unavailable: One or more critical dependencies unhealthy
 */
export async function GET() {
  const startTime = Date.now()

  const checks: HealthCheck[] = await Promise.all([
    // Check Database (Supabase/Neon)
    checkDatabase(),
    // Check E2B (optional - don't fail readiness if unavailable)
    checkE2B(),
    // Check AI Provider (optional - don't fail readiness if unavailable)
    checkAIProvider(),
  ])

  const allHealthy = checks.every(
    (c) => c.status === "healthy" || c.status === "degraded"
  )
  const criticalHealthy = checks
    .filter((c) => c.name === "database")
    .every((c) => c.status === "healthy")

  const totalLatency = Date.now() - startTime

  return NextResponse.json(
    {
      status: criticalHealthy ? (allHealthy ? "ready" : "degraded") : "not_ready",
      timestamp: new Date().toISOString(),
      totalLatencyMs: totalLatency,
      checks,
    },
    { status: criticalHealthy ? 200 : 503 }
  )
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now()
  try {
    const supabase = createServiceRoleClient()
    
    // Simple query to verify connection
    const { error } = await supabase
      .from("projects")
      .select("id")
      .limit(1)

    if (error) {
      return {
        name: "database",
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: error.message,
      }
    }

    return {
      name: "database",
      status: "healthy",
      latencyMs: Date.now() - start,
    }
  } catch (error) {
    return {
      name: "database",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function checkE2B(): Promise<HealthCheck> {
  // E2B is optional - just check if API key is configured
  const hasApiKey = !!process.env.E2B_API_KEY

  if (!hasApiKey) {
    return {
      name: "e2b",
      status: "degraded",
      message: "E2B_API_KEY not configured",
    }
  }

  return {
    name: "e2b",
    status: "healthy",
    message: "API key configured",
  }
}

async function checkAIProvider(): Promise<HealthCheck> {
  // Check if at least one AI provider is configured
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY

  if (!hasAnthropic && !hasOpenAI && !hasGoogle) {
    return {
      name: "ai_provider",
      status: "unhealthy",
      message: "No AI provider API key configured",
    }
  }

  const providers: string[] = []
  if (hasAnthropic) providers.push("anthropic")
  if (hasOpenAI) providers.push("openai")
  if (hasGoogle) providers.push("google")

  return {
    name: "ai_provider",
    status: "healthy",
    message: `Available providers: ${providers.join(", ")}`,
  }
}
