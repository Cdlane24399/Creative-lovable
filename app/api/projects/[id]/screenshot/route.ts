import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler, ValidationError } from "@/lib/errors"
import { getProjectService } from "@/lib/services"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/projects/[id]/screenshot - Save a screenshot for a project
 * 
 * Body:
 * - screenshot_base64: string (required) - Base64 encoded screenshot
 * - sandbox_url?: string - Optional sandbox preview URL
 */
export const POST = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params
  const projectService = getProjectService()
  const body = await request.json()

  const { screenshot_base64, sandbox_url } = body

  if (!screenshot_base64) {
    throw new ValidationError("screenshot_base64 is required", {
      screenshot_base64: ["This field is required"],
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
