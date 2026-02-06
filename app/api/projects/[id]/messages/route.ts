import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import { getMessageService } from "@/lib/services"
import { 
  validateRequest, 
  saveMessagesSchema, 
  saveMessageSchema,
  ValidationError,
  createValidationErrorResponse,
} from "@/lib/validations"

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/projects/[id]/messages - Get all messages for a project
 */
export const GET = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params
  const messageService = getMessageService()

  const messages = await messageService.getMessages(id)

  return NextResponse.json({ messages })
}))

/**
 * POST /api/projects/[id]/messages - Save message(s)
 * 
 * Body can be:
 * - Single message object (AI SDK v6 UIMessage format)
 * - Array of message objects
 * 
 * Expected format:
 * {
 *   role: "user" | "assistant" | "system",
 *   parts?: Array<{ type: "text", text: string } | { type: "tool-invocation", ... } | { type: "tool-result", ... }>,
 *   content?: string, // Optional, for backward compatibility
 *   model?: string
 * }
 */
export const POST = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const [{ id }, body] = await Promise.all([context.params, request.json()])
  const messageService = getMessageService()

  // Support both single message and batch messages
  const messagesToInsert = Array.isArray(body) ? body : [body]

  // Validate messages using saveMessageSchema
  let validatedMessages: { id?: string; role: "user" | "assistant" | "system"; content?: string; parts?: any[]; model?: string }[]
  
  try {
    // Try batch validation first
    validatedMessages = validateRequest(saveMessagesSchema, { messages: messagesToInsert }).messages
  } catch (batchError) {
    if (batchError instanceof ValidationError) {
      // Try individual message validation for better error messages
      const results = messagesToInsert.map((msg, index) => {
        try {
          return { success: true, data: validateRequest(saveMessageSchema, msg), index }
        } catch (error) {
          if (error instanceof ValidationError) {
            return { success: false, error: `Message ${index + 1}: ${error.message}`, index }
          }
          return { success: false, error: `Message ${index + 1}: Unknown error`, index }
        }
      })

      const failures = results.filter(r => !r.success)
      if (failures.length > 0) {
        return createValidationErrorResponse(
          new ValidationError(
            failures.map(f => (f as { success: false; error: string }).error).join(', '),
            []
          )
        )
      }

      validatedMessages = results.filter(r => r.success).map(r => (r as { success: true; data: any }).data)
    } else {
      throw batchError
    }
  }

  // Use appendMessages for adding to existing conversation
  const savedMessages = await messageService.appendMessages(
    id,
    validatedMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      parts: msg.parts,
      model: msg.model,
    }))
  )

  return NextResponse.json({ messages: savedMessages }, { status: 201 })
}))

/**
 * DELETE /api/projects/[id]/messages - Delete all messages for a project
 */
export const DELETE = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params
  const messageService = getMessageService()

  const deletedCount = await messageService.deleteMessages(id)

  return NextResponse.json({ success: true, deletedCount })
}))
