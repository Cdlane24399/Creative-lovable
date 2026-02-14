import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler, NotFoundError } from "@/lib/errors"
import { getProjectService } from "@/lib/services"
import {
  validateRequest,
  updateProjectSchema,
  ValidationError,
  createValidationErrorResponse,
} from "@/lib/validations"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/projects/[id] - Get a single project with optional messages
 * 
 * Query params:
 * - includeMessages: boolean - Include conversation history
 */
export const GET = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params
  const projectService = getProjectService()
  const { searchParams } = new URL(request.url)
  const includeMessages = searchParams.get("includeMessages") === "true"

  if (includeMessages) {
    // Get project with messages
    const result = await projectService.getProjectWithMessages(id)
    return NextResponse.json(result)
  } else {
    // Get project only
    const project = await projectService.getProject(id)
    return NextResponse.json({ project })
  }
}))

/**
 * PATCH /api/projects/[id] - Update a project
 * 
 * Body: UpdateProjectRequest fields (all optional)
 */
export const PATCH = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const [{ id }, body] = await Promise.all([
    context.params,
    request.json(),
  ])
  const projectService = getProjectService()

  // Validate request body with Zod schema
  let validatedBody: ReturnType<typeof updateProjectSchema.parse>
  try {
    validatedBody = validateRequest(updateProjectSchema, body)
  } catch (error) {
    if (error instanceof ValidationError) {
      return createValidationErrorResponse(error)
    }
    throw error
  }

  // Update project (service handles business logic, cache invalidation)
  const project = await projectService.updateProject(id, validatedBody)

  return NextResponse.json({ project })
}))

/**
 * DELETE /api/projects/[id] - Delete a project
 * 
 * Deletes the project, all messages, and context
 */
export const DELETE = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params
  const projectService = getProjectService()

  // Delete project (service handles cascade, cache invalidation)
  await projectService.deleteProject(id)

  return NextResponse.json({ success: true })
}))
