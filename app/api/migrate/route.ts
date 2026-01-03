import { NextResponse } from "next/server"
import { Client } from "@neondatabase/serverless"
import fs from "fs"
import path from "path"

export async function GET() {
    try {
        const sqlPath = path.join(process.cwd(), "lib/db/schema.sql")
        const sql = fs.readFileSync(sqlPath, "utf8")

        // Use Client for running raw SQL strings with multiple statements
        const client = new Client(process.env.NEON_DATABASE_URL)
        await client.connect()

        try {
            await client.query(sql)
        } finally {
            await client.end()
        }

        return NextResponse.json({
            success: true,
            message: "Database schema applied successfully"
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
