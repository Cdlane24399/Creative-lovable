-- Migration: Add token_usage table for tracking AI model usage and costs
-- Created: 2026-02-01

-- Create the token_usage table
CREATE TABLE IF NOT EXISTS public.token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key to project
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Model information
  model VARCHAR(100) NOT NULL,

  -- Token counts
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- Step tracking for agentic workflows
  step_number INTEGER,

  -- Cost tracking (in USD)
  cost_usd DECIMAL(10, 6),

  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_token_usage_project_id ON public.token_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON public.token_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_project_timestamp ON public.token_usage(project_id, timestamp DESC);

-- Enable RLS
ALTER TABLE public.token_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access token usage for their own projects
CREATE POLICY "Users can view token usage for their projects"
  ON public.token_usage FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert token usage for their projects"
  ON public.token_usage FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT ON public.token_usage TO authenticated;
GRANT SELECT, INSERT ON public.token_usage TO service_role;

-- Add comment
COMMENT ON TABLE public.token_usage IS 'Tracks AI model token usage and costs per project';
