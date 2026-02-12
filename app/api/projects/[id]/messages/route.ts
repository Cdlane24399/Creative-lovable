import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import { getMessageService } from "@/lib/services"
import {
  validateRequest,
  saveMessagesSchema,
  saveMessageSchema,
  type SaveMessage,
  ValidationError,
  createValidationErrorResponse,
} from "@/lib/validations"
import type { MessagePart } from "@/lib/db/types"

interface RouteContext {
  params: Promise<{ id: string }>
}

interface ValidationSuccess {
  success: true
  data: SaveMessage
}

interface ValidationFailure {
  success: false
  error: string
}

type SingleMessageValidationResult = ValidationSuccess | ValidationFailure
type MessageValidationResult =
  | { ok: true; messages: SaveMessage[] }
  | { ok: false; response: Response }

function isValidationSuccess(
  result: SingleMessageValidationResult
): result is ValidationSuccess {
  return result.success
}

function validateMessagesForSave(messages: unknown[]): MessageValidationResult {
  try {
    const validatedBatch = validateRequest(saveMessagesSchema, {
      messages,
    })
    return { ok: true, messages: validatedBatch.messages }
  } catch (batchError) {
    if (!(batchError instanceof ValidationError)) {
      throw batchError
    }

    const results = messages.map<SingleMessageValidationResult>((message, index) => {
      try {
        return {
          success: true,
          data: validateRequest(saveMessageSchema, message),
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          return {
            success: false,
            error: `Message ${index + 1}: ${error.message}`,
          }
        }
        return {
          success: false,
          error: `Message ${index + 1}: Unknown error`,
        }
      }
    })

    const failedResults = results.filter((result) => !result.success)
    if (failedResults.length > 0) {
      return {
        ok: false,
        response: createValidationErrorResponse(
          new ValidationError(
            failedResults.map((result) => result.error).join(", "),
            []
          )
        ),
      }
    }

    return {
      ok: true,
      messages: results
        .filter(isValidationSuccess)
        .map((result) => result.data),
    }
  }
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

  const validationResult = validateMessagesForSave(messagesToInsert)
  if (!validationResult.ok) {
    return validationResult.response
  }

  // Use appendMessages for adding to existing conversation
  const savedMessages = await messageService.appendMessages(
    id,
    validationResult.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      parts: msg.parts as MessagePart[] | undefined,
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
