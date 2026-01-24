import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Apply pending migrations to Supabase database
 * This route runs ALTER TABLE statements that may be missing from the schema
 */
export async function GET() {
  try {
    const supabase = createAdminClient()

    // Add missing 'model' column to messages table
    const { error: modelColumnError } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS model VARCHAR(50);`
    })

    // If RPC doesn't exist, try direct SQL via postgrest-js
    if (modelColumnError?.code === 'PGRST202') {
      // RPC not available, use raw SQL via the REST API
      const { error } = await supabase
        .from('messages')
        .select('model')
        .limit(1)

      if (error?.code === 'PGRST204') {
        // Column doesn't exist - need to add it via Supabase Dashboard
        return NextResponse.json({
          success: false,
          message: "Migration required via Supabase Dashboard",
          sql: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS model VARCHAR(50);",
          instructions: "Run this SQL in Supabase SQL Editor"
        }, { status: 400 })
      }

      // Column exists, just return success
      return NextResponse.json({
        success: true,
        message: "Schema is up to date (model column exists)"
      })
    }

    if (modelColumnError) {
      throw new Error(modelColumnError.message)
    }

    // Notify PostgREST to reload schema cache
    await supabase.rpc('exec_sql', {
      sql: `NOTIFY pgrst, 'reload schema';`
    }).catch(() => {
      // Ignore if NOTIFY fails
    })

    return NextResponse.json({
      success: true,
      message: "Migration applied successfully"
    })
  } catch (error: any) {
    console.error("Supabase migration error:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to apply migration",
        error: error.message,
        fallback: {
          sql: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS model VARCHAR(50);",
          instructions: "Run manually in Supabase SQL Editor"
        }
      },
      { status: 500 }
    )
  }
}
