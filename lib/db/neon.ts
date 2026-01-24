import { neon, neonConfig } from "@neondatabase/serverless"
import { Pool } from "pg"

// Configure Neon for production reliability
neonConfig.fetchConnectionCache = true // Enable connection caching for serverless

// Default query timeout (10 seconds)
const DEFAULT_QUERY_TIMEOUT_MS = 10000

// Cache for local pool to avoid connection exhaustion
let localPool: Pool | null = null;

// Create a SQL query function with timeout configuration
export function getDb(timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS) {
  const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("NEON_DATABASE_URL environment variable is not set")
  }

  // Check for local development URL
  if (databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')) {
    if (!localPool) {
      localPool = new Pool({ connectionString: databaseUrl });
    }
    
    // Mimic the neon function signature
    const sql = async (stringsOrQuery: TemplateStringsArray | string, ...values: any[]) => {
       if (typeof stringsOrQuery === 'string') {
         // Called as function: sql('SELECT ...', [args])
         // values[0] should be the params array if present
         const params = Array.isArray(values[0]) ? values[0] : [];
         const result = await localPool!.query(stringsOrQuery, params);
         return result.rows;
       } else {
         // Called as tagged template: sql`SELECT ... ${val}`
         // Convert to parameterized query: "SELECT ... $1"
         let text = stringsOrQuery[0];
         for (let i = 1; i < stringsOrQuery.length; i++) {
           text += `$${i}${stringsOrQuery[i]}`;
         }
         const result = await localPool!.query(text, values);
         return result.rows;
       }
    };
    return sql as unknown as ReturnType<typeof neon>;
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
