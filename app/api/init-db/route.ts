import { NextResponse } from "next/server"
import { getDb } from "@/lib/db/neon"

// This endpoint runs the schema initialization for Neon database
export async function GET() {
  try {
    const sql = getDb()

    // Run schema initialization
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`

    // Create projects table
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        screenshot_url TEXT,
        screenshot_base64 TEXT,
        sandbox_id VARCHAR(255),
        sandbox_url TEXT,
        files_snapshot JSONB DEFAULT '{}',
        dependencies JSONB DEFAULT '{}',
        starred BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        user_id UUID,
        CONSTRAINT projects_name_not_empty CHECK (char_length(name) > 0)
      )
    `

    // Create messages table
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        parts JSONB,
        model VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_starred ON projects(starred)`
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_last_opened_at ON projects(last_opened_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`

    // Create updated_at trigger function
    await sql`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `

    // Create trigger (drop first if exists)
    await sql`DROP TRIGGER IF EXISTS update_projects_updated_at ON projects`
    await sql`
      CREATE TRIGGER update_projects_updated_at
        BEFORE UPDATE ON projects
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `

    // Create agent_context table for AI agent state persistence per project
    await sql`
      CREATE TABLE IF NOT EXISTS agent_context (
        project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        project_name VARCHAR(255),
        project_dir TEXT,
        sandbox_id VARCHAR(255),
        files JSONB DEFAULT '{}',
        dependencies JSONB DEFAULT '{}',
        build_status JSONB,
        server_state JSONB,
        tool_history JSONB DEFAULT '[]',
        error_history JSONB DEFAULT '[]',
        current_plan JSONB,
        completed_steps JSONB DEFAULT '[]',
        task_graph JSONB,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `

    // Create indexes for agent_context
    await sql`
      CREATE INDEX IF NOT EXISTS idx_agent_context_sandbox_id
      ON agent_context(sandbox_id)
      WHERE sandbox_id IS NOT NULL
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_agent_context_updated_at
      ON agent_context(updated_at)
    `

    return NextResponse.json({
      success: true,
      message: "Database schema initialized successfully",
      tables: ["projects", "messages", "agent_context"],
      indexes: [
        "idx_projects_user_id",
        "idx_projects_starred",
        "idx_projects_updated_at",
        "idx_projects_last_opened_at",
        "idx_messages_project_id",
        "idx_messages_created_at",
        "idx_agent_context_sandbox_id",
        "idx_agent_context_updated_at",
      ],
    })
  } catch (error) {
    console.error("Error initializing database:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to initialize database",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
