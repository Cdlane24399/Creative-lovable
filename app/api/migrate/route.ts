import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import fs from "fs"
import path from "path"

/**
 * Apply database schema migrations using Supabase admin client
 * This reads the schema.sql file and applies it via Supabase's SQL execution
 */
export async function GET() {
  try {
    const sqlPath = path.join(process.cwd(), "lib/db/schema.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    const supabase = createAdminClient()

    // Split SQL into individual statements and execute each
    // This is needed because Supabase doesn't support multiple statements in one call
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    const errors: string[] = []

    for (const statement of statements) {
      // Skip empty statements or comments
      if (!statement || statement.startsWith('--')) continue

      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })

      // If exec_sql RPC doesn't exist, we can't run raw SQL
      if (error?.code === 'PGRST202') {
        return NextResponse.json({
          success: false,
          message: "Cannot run raw SQL - exec_sql function not available",
          hint: "Run migrations directly in Supabase SQL Editor",
          sql: sql
        }, { status: 400 })
      }

      if (error) {
        // Some errors are expected (e.g., "already exists")
        if (!error.message.includes('already exists')) {
          errors.push(`${statement.slice(0, 50)}...: ${error.message}`)
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        message: "Some statements failed",
        errors
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Database schema applied successfully via Supabase"
    })
  } catch (error: any) {
    console.error("Migration error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to apply migration",
        error: error.message
      },
      { status: 500 }
    )
  }
}
