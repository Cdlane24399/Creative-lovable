import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  try {
    const supabase = createAdminClient()
    const start = Date.now()
    
    const { data, error } = await supabase
      .from('projects')
      .select('id')
      .limit(1)
    
    const duration = Date.now() - start

    if (error) throw error

    return NextResponse.json({
      status: "online",
      latency: duration,
      database: "supabase",
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "offline",
        error: error.message
      },
      { status: 500 }
    )
  }
}
