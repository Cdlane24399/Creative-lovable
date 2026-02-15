import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "./rate-limit";
import {
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
} from "./errors";
import { createClient } from "@/lib/supabase/server";

// Track if auth warning has been logged to avoid spam
let authWarningLogged = false;

// Helper to get current environment values (allows testing)
function getApiKey(): string | undefined {
  return process.env.API_KEY;
}

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

// Authentication middleware
export async function authenticateRequest(
  request: NextRequest | Request,
): Promise<{ isAuthenticated: boolean; error?: NextResponse | Response }> {
  // 1. Try API Key first (fast synchronous path — no network calls)
  const apiKey =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace("Bearer ", "");
  const expectedApiKey = getApiKey();

  if (expectedApiKey && apiKey && apiKey === expectedApiKey) {
    return { isAuthenticated: true };
  }

  // 2. Handle missing API key configuration
  if (!expectedApiKey) {
    // In development, allow requests without API key (with warning)
    if (isDevelopment()) {
      if (!authWarningLogged) {
        console.warn(
          "[auth] API_KEY not set - authentication disabled in development mode",
        );
        authWarningLogged = true;
      }
      return { isAuthenticated: true };
    }

    // In production, continue to Supabase auth so browser sessions still work.
    // API key auth remains unavailable until API_KEY is configured.
    if (!authWarningLogged) {
      console.warn(
        "[auth] API_KEY not configured in production - falling back to Supabase session auth only",
      );
      authWarningLogged = true;
    }
  }

  // 3. Try Supabase Auth (Cookies) — slower path, requires network
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return { isAuthenticated: true };
    }
  } catch (error) {
    // Ignore error and fall through
  }

  // 4. Authentication failed
  if (!apiKey) {
    const error = new AuthenticationError();
    const errorResponse = createErrorResponse(
      request,
      error.message,
      error.code,
      error.statusCode,
      {
        "WWW-Authenticate": "Bearer",
      },
    );
    return { isAuthenticated: false, error: errorResponse };
  }

  const error = new AuthorizationError("Invalid API key");
  const errorResponse = createErrorResponse(
    request,
    error.message,
    error.code,
    error.statusCode,
  );
  return { isAuthenticated: false, error: errorResponse };
}

// Helper to create consistent error responses
function createErrorResponse(
  request: NextRequest | Request,
  message: string,
  code: string | undefined,
  status: number,
  headers?: Record<string, string>,
): NextResponse | Response {
  const body = JSON.stringify({ error: message, code });
  const responseHeaders = { "Content-Type": "application/json", ...headers };

  if (request instanceof NextRequest) {
    return NextResponse.json(
      { error: message, code },
      { status, headers: responseHeaders },
    );
  }
  return new Response(body, { status, headers: responseHeaders });
}

// Higher-order function to wrap API route handlers with authentication
export function withAuth<T extends unknown[]>(
  handler: (
    ...args: T
  ) => Promise<NextResponse | Response> | NextResponse | Response,
  options?: { skipRateLimit?: boolean },
) {
  return async (...args: T): Promise<NextResponse | Response> => {
    const request = args[0] as NextRequest | Request;

    // Check rate limit first (only for NextRequest, skip if handler does its own)
    let rateLimitResult: {
      allowed: boolean;
      remaining: number;
      resetTime: number;
    } | null = null;
    if (!options?.skipRateLimit && request instanceof NextRequest) {
      rateLimitResult = await checkRateLimit(request);
      if (!rateLimitResult.allowed) {
        const error = new RateLimitError(
          "Rate limit exceeded",
          Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
        );
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            retryAfter: error.retryAfter,
          },
          {
            status: error.statusCode,
            headers: {
              "Retry-After": error.retryAfter.toString(),
            },
          },
        );
      }
    }

    const auth = await authenticateRequest(request);

    if (!auth.isAuthenticated) {
      return auth.error!;
    }

    const response = await handler(...args);

    // Add rate limit headers to successful NextResponse (reuse stored result, no double-count)
    if (rateLimitResult && response instanceof NextResponse) {
      response.headers.set(
        "X-RateLimit-Remaining",
        rateLimitResult.remaining.toString(),
      );
      response.headers.set(
        "X-RateLimit-Reset",
        rateLimitResult.resetTime.toString(),
      );
      response.headers.set("X-RateLimit-Limit", "100");
    }

    return response;
  };
}
