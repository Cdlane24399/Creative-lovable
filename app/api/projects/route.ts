import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import { getProjectService } from "@/lib/services"
import {
  validateRequest,
  createProjectSchema,
  ValidationError,
  createValidationErrorResponse,
} from "@/lib/validations"

/**
 * GET /api/projects - List all projects
 * 
 * Query params:
 * - starred: boolean - Filter by starred status
 * - limit: number (1-100, default 50) - Max results
 * - offset: number (default 0) - Skip results
 */
export const GET = withAuth(asyncErrorHandler(async (request: NextRequest) => {
  const projectService = getProjectService()
  const { searchParams } = new URL(request.url)

  // Parse query params
  const starred = searchParams.get("starred")
  const limit = parseInt(searchParams.get("limit") || "50")
  const offset = parseInt(searchParams.get("offset") || "0")

  // Build filters
  const filters = {
    starred: starred === "true" ? true : starred === "false" ? false : undefined,
  }

  // Fetch projects (service handles validation, caching)
  const result = await projectService.listProjects({
    filters,
    limit,
    offset,
  })

  return NextResponse.json(result)
}))

/**
 * POST /api/projects - Create a new project
 * 
 * Body:
 * - name: string (required)
 * - description?: string
 * - id?: string - Optional custom ID
 * - screenshot_base64?: string
 * - sandbox_id?: string
 * - sandbox_url?: string
 * - files_snapshot?: Record<string, string>
 * - dependencies?: Record<string, string>
 */
export const POST = withAuth(asyncErrorHandler(async (request: NextRequest) => {
  const projectService = getProjectService()
  const body = await request.json()

  // Validate request body with Zod schema
  let validatedBody: ReturnType<typeof createProjectSchema.parse> & { id?: string }
  try {
    validatedBody = { ...validateRequest(createProjectSchema, body), id: body.id }
  } catch (error) {
    if (error instanceof ValidationError) {
      return createValidationErrorResponse(error)
    }
    throw error
  }

  // Create project (service handles business logic)
  const project = await projectService.createProject(validatedBody)

  return NextResponse.json({ project }, { status: 201 })
}))
