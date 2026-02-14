-- Migration: Add integrations table for OAuth provider connections
-- Stores encrypted access/refresh tokens for GitHub, Vercel, etc.
--
-- Uses gen_random_uuid() (standard, no extension needed) instead of uuid_generate_v4()

CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User association
  user_id UUID NOT NULL,

  -- Provider identification
  provider VARCHAR(50) NOT NULL,

  -- Encrypted credentials (encrypted via lib/crypto/encryption.ts)
  access_token TEXT,
  refresh_token TEXT,

  -- Metadata
  scope TEXT,
  expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each user can only have one integration per provider
  CONSTRAINT integrations_user_provider_unique UNIQUE (user_id, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON public.integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user_provider ON public.integrations(user_id, provider);

-- Auto-update updated_at (reuse existing function from init migration)
DROP TRIGGER IF EXISTS update_integrations_updated_at ON public.integrations;
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only manage their own integrations
CREATE POLICY "Users can view their own integrations"
  ON public.integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own integrations"
  ON public.integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own integrations"
  ON public.integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own integrations"
  ON public.integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass (for server-side operations)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;

COMMENT ON TABLE public.integrations IS 'OAuth provider integrations with encrypted credentials per user';
