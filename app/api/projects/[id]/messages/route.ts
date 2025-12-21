import { getDb } from "@/lib/db/neon"
import { NextRequest, NextResponse } from "next/server"
import type { Message, MessagePart } from "@/lib/db/types"

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/projects/[id]/messages - Get all messages for a project
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const sql = getDb()

    const messages = await sql`
      SELECT * FROM messages
      WHERE project_id = ${id}
      ORDER BY created_at ASC
    ` as Message[]

    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    console.error("Error in GET /api/projects/[id]/messages:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST /api/projects/[id]/messages - Save a message
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const sql = getDb()
    const body = await request.json()

    // Support both single message and batch messages
    const messagesToInsert = Array.isArray(body) ? body : [body]

    const insertedMessages: Message[] = []

    for (const msg of messagesToInsert as Array<{
      role: "user" | "assistant" | "system"
      content: string
      parts?: MessagePart[]
      model?: string
    }>) {
      const result = await sql`
        INSERT INTO messages (project_id, role, content, parts, model)
        VALUES (${id}, ${msg.role}, ${msg.content}, ${msg.parts ? JSON.stringify(msg.parts) : null}, ${msg.model || null})
        RETURNING *
      ` as Message[]

      if (result && result.length > 0) {
        insertedMessages.push(result[0])
      }
    }

    return NextResponse.json({ messages: insertedMessages }, { status: 201 })
  } catch (error) {
    console.error("Error in POST /api/projects/[id]/messages:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id]/messages - Delete all messages for a project
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const sql = getDb()

    await sql`
      DELETE FROM messages WHERE project_id = ${id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/projects/[id]/messages:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
