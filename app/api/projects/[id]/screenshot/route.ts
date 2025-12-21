import { getDb } from "@/lib/db/neon"
import { NextRequest, NextResponse } from "next/server"
import type { Project } from "@/lib/db/types"

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/projects/[id]/screenshot - Save a screenshot for a project
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const sql = getDb()
    const body = await request.json()

    // Expect base64 screenshot data from the client
    const { screenshot_base64, sandbox_url } = body

    if (!screenshot_base64) {
      return NextResponse.json(
        { error: "screenshot_base64 is required" },
        { status: 400 }
      )
    }

    let result: Project[]

    if (sandbox_url) {
      result = await sql`
        UPDATE projects
        SET screenshot_base64 = ${screenshot_base64}, sandbox_url = ${sandbox_url}
        WHERE id = ${id}
        RETURNING *
      ` as Project[]
    } else {
      result = await sql`
        UPDATE projects
        SET screenshot_base64 = ${screenshot_base64}
        WHERE id = ${id}
        RETURNING *
      ` as Project[]
    }

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      project: result[0],
    })
  } catch (error) {
    console.error("Error in POST /api/projects/[id]/screenshot:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
