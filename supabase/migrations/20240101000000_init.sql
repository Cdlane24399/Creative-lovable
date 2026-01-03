-- Creative Lovable Database Schema for Neon PostgreSQL
-- This schema is automatically applied via /api/init-db or can be run manually

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table: Main table for storing user projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Project metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Screenshot stored as base64 or URL
  screenshot_url TEXT,
  screenshot_base64 TEXT,

  -- Sandbox state for restoration
  sandbox_id VARCHAR(255),
  sandbox_url TEXT,

  -- Project files snapshot (JSON blob of file paths and contents)
  files_snapshot JSONB DEFAULT '{}',

  -- Dependencies snapshot
  dependencies JSONB DEFAULT '{}',

  -- User preferences
  starred BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Optional user association (for future auth)
  user_id UUID DEFAULT auth.uid(),

  -- Index for faster queries
  CONSTRAINT projects_name_not_empty CHECK (char_length(name) > 0)
);

-- Chat messages table: Store conversation history per project
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Message content
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- For assistant messages with tool calls
  parts JSONB,

  -- Metadata
  model VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_starred ON projects(starred);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_last_opened_at ON projects(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on projects
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Agent context persistence table
-- Stores AI agent state for project continuity across server restarts
CREATE TABLE IF NOT EXISTS agent_context (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,

  -- Project identification
  project_name VARCHAR(255),
  project_dir TEXT,
  sandbox_id VARCHAR(255),

  -- State snapshots (JSON)
  files JSONB DEFAULT '{}',
  dependencies JSONB DEFAULT '{}',
  build_status JSONB,
  server_state JSONB,

  -- History tracking (JSON arrays)
  tool_history JSONB DEFAULT '[]',
  error_history JSONB DEFAULT '[]',

  -- Planning state
  current_plan JSONB,
  completed_steps JSONB DEFAULT '[]',
  task_graph JSONB,

  -- Metadata
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster sandbox lookups
CREATE INDEX IF NOT EXISTS idx_agent_context_sandbox_id
ON agent_context(sandbox_id)
WHERE sandbox_id IS NOT NULL;

-- Index for cleanup of stale contexts
CREATE INDEX IF NOT EXISTS idx_agent_context_updated_at
ON agent_context(updated_at);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_context ENABLE ROW LEVEL SECURITY;

-- Policies for projects
CREATE POLICY "Users can view their own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- Policies for messages (cascade check)
CREATE POLICY "Users can view messages of their projects" ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE id = messages.project_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can insert messages to their projects" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE id = messages.project_id AND user_id = auth.uid())
  );

-- Policies for agent_context
CREATE POLICY "Users can access agent context of their projects" ON agent_context
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = agent_context.project_id AND user_id = auth.uid())
  );
