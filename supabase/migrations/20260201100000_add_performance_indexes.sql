-- Performance indexes for project queries
-- Addresses slow /api/projects responses (2-3+ seconds -> <1 second)

-- Index for project listing queries (sorted by updated_at)
CREATE INDEX IF NOT EXISTS idx_projects_user_id_updated_at
ON projects(user_id, updated_at DESC);

-- Index for starred filter queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id_starred
ON projects(user_id, starred) WHERE starred = true;

-- Index for sandbox ID lookups (used in reconnection)
CREATE INDEX IF NOT EXISTS idx_projects_sandbox_id
ON projects(sandbox_id) WHERE sandbox_id IS NOT NULL;

-- Analyze tables to update query planner statistics
ANALYZE projects;
