import { getDb } from "@/lib/db/neon"
import { NextRequest, NextResponse } from "next/server"
import type { CreateProjectRequest, Project } from "@/lib/db/types"

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  try {
    const sql = getDb()
    const { searchParams } = new URL(request.url)

    // Query params for filtering
    const starred = searchParams.get("starred")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    let projects: Project[]

    // Use simple tagged template queries with fixed ORDER BY
    // The Neon serverless driver doesn't support dynamic identifiers well
    if (starred === "true") {
      projects = await sql`
        SELECT * FROM projects
        WHERE starred = true
        ORDER BY updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as Project[]
    } else if (starred === "false") {
      projects = await sql`
        SELECT * FROM projects
        WHERE starred = false
        ORDER BY updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as Project[]
    } else {
      projects = await sql`
        SELECT * FROM projects
        ORDER BY updated_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as Project[]
    }

    return NextResponse.json({ projects: projects || [] })
  } catch (error) {
    console.error("Error in GET /api/projects:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const sql = getDb()
    const body: CreateProjectRequest & { id?: string } = await request.json()

    // Validate required fields
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      )
    }

    const name = body.name.trim()
    const description = body.description || null
    const screenshot_base64 = body.screenshot_base64 || null
    const sandbox_id = body.sandbox_id || null
    const sandbox_url = body.sandbox_url || null
    const files_snapshot = body.files_snapshot || {}
    const dependencies = body.dependencies || {}

    let project: Project[]

    if (body.id) {
      // Use provided ID
      project = await sql`
        INSERT INTO projects (id, name, description, screenshot_base64, sandbox_id, sandbox_url, files_snapshot, dependencies, starred)
        VALUES (${body.id}, ${name}, ${description}, ${screenshot_base64}, ${sandbox_id}, ${sandbox_url}, ${JSON.stringify(files_snapshot)}, ${JSON.stringify(dependencies)}, false)
        RETURNING *
      ` as Project[]
    } else {
      // Let database generate ID
      project = await sql`
        INSERT INTO projects (name, description, screenshot_base64, sandbox_id, sandbox_url, files_snapshot, dependencies, starred)
        VALUES (${name}, ${description}, ${screenshot_base64}, ${sandbox_id}, ${sandbox_url}, ${JSON.stringify(files_snapshot)}, ${JSON.stringify(dependencies)}, false)
        RETURNING *
      ` as Project[]
    }

    if (!project || project.length === 0) {
      return NextResponse.json(
        { error: "Failed to create project" },
        { status: 500 }
      )
    }

    return NextResponse.json({ project: project[0] }, { status: 201 })
  } catch (error) {
    console.error("Error in POST /api/projects:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
