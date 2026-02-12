import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

/**
 * Get a cached Supabase admin client (bypasses RLS).
 * The client is created once and reused across the process lifetime.
 * Supabase JS client is stateless (no connection pooling), so sharing is safe.
 */
export function createAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return cachedClient;
}
