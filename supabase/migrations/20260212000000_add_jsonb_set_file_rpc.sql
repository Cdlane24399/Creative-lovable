-- Migration: Add jsonb_set_file RPC for atomic single-file updates
-- This function atomically updates a single file in a project's files_snapshot
-- without the read-modify-write race condition of the previous approach.
--
-- Called by: lib/db/repositories/project.repository.ts saveSingleFile()

CREATE OR REPLACE FUNCTION public.jsonb_set_file(
  project_id UUID,
  file_path TEXT,
  file_content TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.projects
  SET
    files_snapshot = COALESCE(files_snapshot, '{}'::jsonb) || jsonb_build_object(file_path, file_content),
    updated_at = NOW()
  WHERE id = project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', project_id;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.jsonb_set_file(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_set_file(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.jsonb_set_file IS
  'Atomically set a single file in a project files_snapshot using jsonb || merge';
