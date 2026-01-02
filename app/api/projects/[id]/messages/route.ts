import { NextRequest, NextResponse } from "next/server"
import type { MessagePart } from "@/lib/db/types"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import { getMessageService } from "@/lib/services"

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
 * - Single message object
 * - Array of message objects
 */
export const POST = withAuth(asyncErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params
  const messageService = getMessageService()
  const body = await request.json()

  // Support both single message and batch messages
  const messagesToInsert = Array.isArray(body) ? body : [body]

  // Use appendMessages for adding to existing conversation
  const savedMessages = await messageService.appendMessages(
    id,
    messagesToInsert.map((msg: {
      role: "user" | "assistant" | "system"
      content: string
      parts?: MessagePart[]
      model?: string
    }) => ({
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
