import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "./rate-limit"
import { AuthenticationError, AuthorizationError, RateLimitError } from "./errors"
import { createClient } from "@/lib/supabase/server"

// Track if auth warning has been logged to avoid spam
let authWarningLogged = false

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
  const expectedApiKey = process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY

  if (!expectedApiKey) {
    // Only log once per process lifecycle to reduce noise
    if (!authWarningLogged) {
      console.warn("API_KEY environment variable not set - authentication disabled")
      authWarningLogged = true
    }
    return { isAuthenticated: true }
  }

  if (!apiKey) {
    const error = new AuthenticationError()
    const errorResponse = NextRequest.prototype.isPrototypeOf(request)
      ? NextResponse.json(
          { error: error.message, code: error.code },
          {
            status: error.statusCode,
            headers: { "WWW-Authenticate": "Bearer" }
          }
        )
      : new Response(JSON.stringify({ error: error.message, code: error.code }), {
          status: error.statusCode,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": "Bearer"
          }
        })
    return {
      isAuthenticated: false,
      error: errorResponse
    }
  }

  if (apiKey !== expectedApiKey) {
    const error = new AuthorizationError("Invalid API key")
    const errorResponse = NextRequest.prototype.isPrototypeOf(request)
      ? NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.statusCode }
        )
      : new Response(JSON.stringify({ error: error.message, code: error.code }), {
          status: error.statusCode,
          headers: { "Content-Type": "application/json" }
        })
    return {
      isAuthenticated: false,
      error: errorResponse
    }
  }

  return { isAuthenticated: true }
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
