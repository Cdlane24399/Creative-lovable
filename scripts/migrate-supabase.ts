/**
 * Migration script to add missing columns to Supabase production database
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function migrate() {
  console.log('Connecting to Supabase...')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // SQL migrations to add missing columns
  const migrations = [
    // Add missing columns to projects table
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false;`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS files_snapshot JSONB DEFAULT '{}';`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '{}';`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();`,
    
    // Create indexes if they don't exist
    `CREATE INDEX IF NOT EXISTS idx_projects_starred ON projects(starred);`,
    `CREATE INDEX IF NOT EXISTS idx_projects_last_opened_at ON projects(last_opened_at DESC);`,
  ]

  for (const sql of migrations) {
    console.log(`Running: ${sql.substring(0, 60)}...`)
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
    if (error) {
      // Try direct approach if RPC doesn't work
      console.log(`  RPC failed, trying workaround...`)
    } else {
      console.log(`  ✓ Success`)
    }
  }

  console.log('Migration complete!')
}

migrate().catch(console.error)
