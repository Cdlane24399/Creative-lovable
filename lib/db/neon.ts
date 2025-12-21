import { neon } from "@neondatabase/serverless"

// Create a SQL query function
export function getDb() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set")
  }
  return neon(databaseUrl)
}

// Helper type for query results
export type NeonQueryFunction = ReturnType<typeof neon>
