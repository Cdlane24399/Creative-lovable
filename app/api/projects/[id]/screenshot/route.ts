import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler, ValidationError } from "@/lib/errors"
import { checkChatRateLimit } from "@/lib/rate-limit"
import { getProjectService } from "@/lib/services"

export const maxDuration = 30

interface RouteContext {
  params: Promise<{ id: string }>
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

export function hasPngSignature(buffer: Buffer): boolean {
  if (buffer.length < PNG_SIGNATURE.length) return false
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (buffer[i] !== PNG_SIGNATURE[i]) return false
  }
  return true
}

export function isValidScreenshotPayload(value: string): boolean {
  if (value.startsWith("data:image/png;base64,")) {
    const base64 = value.slice("data:image/png;base64,".length)
    try {
      const buffer = Buffer.from(base64, "base64")
      return buffer.length >= 100 && hasPngSignature(buffer)
    } catch {
      return false
    }
  }

  if (value.startsWith("data:image/svg+xml;base64,")) {
    const base64 = value.slice("data:image/svg+xml;base64,".length)
    try {
      const svg = Buffer.from(base64, "base64").toString("utf8").trim()
      return svg.startsWith("<svg") || svg.includes("<svg")
    } catch {
      return false
    }
  }

  return false
}

/**
 * POST /api/projects/[id]/screenshot - Save a screenshot for a project
 * 
 * Body:
 * - screenshot_base64: string (required) - Base64 encoded screenshot
 * - sandbox_url?: string - Optional sandbox preview URL
 */
export const POST = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const rateLimit = await checkChatRateLimit(request)
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter },
      { status: 429, headers: { "Retry-After": retryAfter.toString() } }
    )
  }

  const [{ id }, body] = await Promise.all([context.params, request.json()])
  const projectService = getProjectService()

  const { screenshot_base64, sandbox_url } = body

  if (!screenshot_base64) {
    throw new ValidationError("screenshot_base64 is required", {
      screenshot_base64: ["This field is required"],
    })
  }

  if (
    typeof screenshot_base64 !== "string" ||
    !isValidScreenshotPayload(screenshot_base64)
  ) {
    throw new ValidationError("Invalid screenshot payload", {
      screenshot_base64: [
        "Expected a valid data URL for PNG or SVG screenshot content",
      ],
    })
  }

  // Update project with screenshot
  const project = await projectService.updateProject(id, {
    screenshot_base64,
    sandbox_url,
  })

  return NextResponse.json({
    success: true,
    project,
  })
}))
