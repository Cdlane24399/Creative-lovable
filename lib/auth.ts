import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "./rate-limit"
import { AuthenticationError, AuthorizationError, RateLimitError } from "./errors"
import { createClient } from "@/lib/supabase/server"

// Track if auth warning has been logged to avoid spam
let authWarningLogged = false

// Helper to get current environment values (allows testing)
function getApiKey(): string | undefined {
  return process.env.API_KEY
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
}

// Authentication middleware
export async function authenticateRequest(request: NextRequest | Request): Promise<{ isAuthenticated: boolean; error?: NextResponse | Response }> {
  // 1. Try Supabase Auth (Cookies)
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      return { isAuthenticated: true }
    }
  } catch (error) {
    // Ignore error and try API Key
  }

  // 2. Try API Key
  const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization")?.replace("Bearer ", "")
  const expectedApiKey = getApiKey()

  // SECURITY: Only use server-side API_KEY, never NEXT_PUBLIC_* for auth
  if (!expectedApiKey) {
    // In development, allow requests without API key (with warning)
    if (isDevelopment()) {
      if (!authWarningLogged) {
        console.warn("[auth] API_KEY not set - authentication disabled in development mode")
        authWarningLogged = true
      }
      return { isAuthenticated: true }
    }
    
    // SECURITY: In production, fail closed - reject all requests
    console.error("[auth] CRITICAL: API_KEY not configured in production - rejecting request")
    const error = new AuthenticationError("Server authentication not configured")
    const errorResponse = createErrorResponse(request, error.message, error.code, 500)
    return { isAuthenticated: false, error: errorResponse }
  }

  if (!apiKey) {
    const error = new AuthenticationError()
    const errorResponse = createErrorResponse(request, error.message, error.code, error.statusCode, {
      "WWW-Authenticate": "Bearer"
    })
    return { isAuthenticated: false, error: errorResponse }
  }

  if (apiKey !== expectedApiKey) {
    const error = new AuthorizationError("Invalid API key")
    const errorResponse = createErrorResponse(request, error.message, error.code, error.statusCode)
    return { isAuthenticated: false, error: errorResponse }
  }

  return { isAuthenticated: true }
}

// Helper to create consistent error responses
function createErrorResponse(
  request: NextRequest | Request,
  message: string,
  code: string | undefined,
  status: number,
  headers?: Record<string, string>
): NextResponse | Response {
  const body = JSON.stringify({ error: message, code })
  const responseHeaders = { "Content-Type": "application/json", ...headers }
  
  if (NextRequest.prototype.isPrototypeOf(request)) {
    return NextResponse.json({ error: message, code }, { status, headers: responseHeaders })
  }
  return new Response(body, { status, headers: responseHeaders })
}

// Higher-order function to wrap API route handlers with authentication
export function withAuth<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse | Response> | NextResponse | Response
) {
  return async (...args: T): Promise<NextResponse | Response> => {
    const request = args[0] as NextRequest | Request

    // Check rate limit first (only for NextRequest)
    if (request instanceof Request === false) {
      const rateLimit = checkRateLimit(request as NextRequest)
      if (!rateLimit.allowed) {
        const error = new RateLimitError("Rate limit exceeded", Math.ceil((rateLimit.resetTime - Date.now()) / 1000))
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            retryAfter: error.retryAfter
          },
          {
            status: error.statusCode,
            headers: {
              "Retry-After": error.retryAfter.toString(),
            }
          }
        )
      }
    }

    const auth = await authenticateRequest(request)

    if (!auth.isAuthenticated) {
      return auth.error!
    }

    const response = await handler(...args)

    // Add rate limit headers to successful responses (only for NextResponse)
    if (response instanceof NextResponse && request instanceof Request === false) {
      const rateLimit = checkRateLimit(request as NextRequest)
      response.headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString())
      response.headers.set("X-RateLimit-Reset", rateLimit.resetTime.toString())
      response.headers.set("X-RateLimit-Limit", "100")
    }

    return response
  }
}
