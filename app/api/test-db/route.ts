import { getDb } from "@/lib/db/neon"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const sql = getDb()

    // Test connection by running a simple query
    const result = await sql`SELECT NOW() as current_time`

    // Check the structure of existing tables
    const tables = ["messages", "projects"]
    const tableInfo: Record<string, unknown> = {}

    for (const table of tables) {
      try {
        const data = await sql.unsafe(`SELECT * FROM ${table} LIMIT 1`)
        tableInfo[table] = {
          exists: true,
          sampleRow: data?.[0] || null,
          columns: data?.[0] ? Object.keys(data[0]) : [],
        }
      } catch (error) {
        tableInfo[table] = {
          exists: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }
      }
    }

    // Get projects sample
    let projectsData = null
    try {
      projectsData = await sql`SELECT * FROM projects LIMIT 5`
    } catch {
      projectsData = null
    }

    // Get messages sample
    let messagesData = null
    try {
      messagesData = await sql`SELECT * FROM messages LIMIT 5`
    } catch {
      messagesData = null
    }

    return NextResponse.json({
      success: true,
      message: "Database connection successful!",
      details: {
        connected: true,
        databaseUrl: process.env.DATABASE_URL ? "***configured***" : "NOT SET",
        serverTime: result[0]?.current_time,
        tableInfo,
        projects: projectsData ? { count: projectsData.length, sample: projectsData } : { error: "Could not fetch" },
        messages: messagesData ? { count: messagesData.length, sample: messagesData } : { error: "Could not fetch" },
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Database connection failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
