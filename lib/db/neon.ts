import { neon, neonConfig } from "@neondatabase/serverless"

// Configure Neon for production reliability
neonConfig.fetchConnectionCache = true // Enable connection caching for serverless

// Default query timeout (10 seconds)
const DEFAULT_QUERY_TIMEOUT_MS = 10000

// Create a SQL query function with timeout configuration
export function getDb(timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS) {
  const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("NEON_DATABASE_URL environment variable is not set")
  }
  
  return neon(databaseUrl, {
    fetchOptions: {
      // Abort query if it takes longer than timeout
      signal: AbortSignal.timeout(timeoutMs),
    },
  })
}

// Get DB with custom timeout for long-running operations
export function getDbWithTimeout(timeoutMs: number) {
  return getDb(timeoutMs)
}

// Helper type for query results
export type NeonQueryFunction = ReturnType<typeof neon>
