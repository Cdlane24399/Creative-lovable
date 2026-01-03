-- Migration: Add performance indexes
-- Date: 2026-01-03
-- Description: Add composite indexes for common query patterns

-- Composite index for messages query pattern: SELECT * FROM messages WHERE project_id = ? ORDER BY created_at
-- This replaces the need for separate indexes on project_id and created_at
CREATE INDEX IF NOT EXISTS idx_messages_project_id_created_at 
ON messages(project_id, created_at ASC);

-- Index for user projects with starred filter (common dashboard query)
-- Covers: SELECT * FROM projects WHERE user_id = ? AND starred = ? ORDER BY updated_at
CREATE INDEX IF NOT EXISTS idx_projects_user_starred_updated 
ON projects(user_id, starred, updated_at DESC) 
WHERE user_id IS NOT NULL;

-- Unique constraint on sandbox_id to prevent duplicate sandbox assignments
-- A sandbox should only belong to one project
ALTER TABLE projects 
ADD CONSTRAINT unique_sandbox_id UNIQUE (sandbox_id);

-- Add foreign key constraint on user_id if profiles table exists
-- This ensures referential integrity for user associations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'fk_projects_user_id' AND table_name = 'projects'
    ) THEN
      ALTER TABLE projects 
      ADD CONSTRAINT fk_projects_user_id 
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Add JSONB validation for files_snapshot (ensure it's always an object)
ALTER TABLE agent_context 
ADD CONSTRAINT valid_files_snapshot 
CHECK (jsonb_typeof(files) = 'object' OR files IS NULL);

-- Add JSONB validation for dependencies
ALTER TABLE agent_context 
ADD CONSTRAINT valid_dependencies 
CHECK (jsonb_typeof(dependencies) = 'object' OR dependencies IS NULL);
