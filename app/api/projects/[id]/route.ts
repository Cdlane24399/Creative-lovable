import { getDb } from "@/lib/db/neon"
import { NextRequest, NextResponse } from "next/server"
import type { UpdateProjectRequest, Project, Message } from "@/lib/db/types"

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/projects/[id] - Get a single project with messages
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const sql = getDb()
    const { searchParams } = new URL(request.url)
    const includeMessages = searchParams.get("includeMessages") === "true"

    // Get the project
    const projects = await sql`
      SELECT * FROM projects WHERE id = ${id}
    ` as Project[]

    if (!projects || projects.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const project = projects[0]

    // Update last_opened_at timestamp
    await sql`
      UPDATE projects SET last_opened_at = NOW() WHERE id = ${id}
    `

    // Optionally include messages
    let messages = null
    if (includeMessages) {
      const messageData = await sql`
        SELECT * FROM messages
        WHERE project_id = ${id}
        ORDER BY created_at ASC
      ` as Message[]
      messages = messageData || []
    }

    return NextResponse.json({
      project,
      ...(messages !== null && { messages }),
    })
  } catch (error) {
    console.error("Error in GET /api/projects/[id]:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// PATCH /api/projects/[id] - Update a project
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const sql = getDb()
    const body: UpdateProjectRequest = await request.json()

    // Build update object with only provided fields
    const updates: string[] = []
    const values: unknown[] = []

    if (body.name !== undefined) {
      updates.push("name")
      values.push(body.name.trim())
    }
    if (body.description !== undefined) {
      updates.push("description")
      values.push(body.description)
    }
    if (body.screenshot_base64 !== undefined) {
      updates.push("screenshot_base64")
      values.push(body.screenshot_base64)
    }
    if (body.screenshot_url !== undefined) {
      updates.push("screenshot_url")
      values.push(body.screenshot_url)
    }
    if (body.sandbox_id !== undefined) {
      updates.push("sandbox_id")
      values.push(body.sandbox_id)
    }
    if (body.sandbox_url !== undefined) {
      updates.push("sandbox_url")
      values.push(body.sandbox_url)
    }
    if (body.files_snapshot !== undefined) {
      updates.push("files_snapshot")
      values.push(JSON.stringify(body.files_snapshot))
    }
    if (body.dependencies !== undefined) {
      updates.push("dependencies")
      values.push(JSON.stringify(body.dependencies))
    }
    if (body.starred !== undefined) {
      updates.push("starred")
      values.push(body.starred)
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No update fields provided" },
        { status: 400 }
      )
    }

    // Build dynamic update query
    const setClause = updates.map((field, i) => `${field} = $${i + 2}`).join(", ")
    const query = `UPDATE projects SET ${setClause} WHERE id = $1 RETURNING *`

    // Use raw query for dynamic updates
    const result = await sql.unsafe(query, [id, ...values]) as Project[]

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    return NextResponse.json({ project: result[0] })
  } catch (error) {
    console.error("Error in PATCH /api/projects/[id]:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const sql = getDb()

    // Messages will be cascade deleted due to FK constraint
    await sql`
      DELETE FROM projects WHERE id = ${id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/projects/[id]:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
