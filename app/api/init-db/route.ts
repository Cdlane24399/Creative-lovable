import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// This endpoint checks the Supabase connection
export async function GET() {
  try {
    const supabase = createAdminClient()
    
    // Check connection by counting projects
    const { count, error } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: "Database connected successfully (Supabase)",
      projectCount: count
    })
  } catch (error: any) {
    console.error("Error connecting to database:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to database",
        error: error.message || "Unknown error",
      },
      { status: 500 }
    )
  }
}
