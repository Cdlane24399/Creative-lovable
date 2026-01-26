import { NextRequest, NextResponse } from "next/server"

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100 // 100 requests per minute

// Chat-specific rate limiting (more restrictive for AI endpoints)
const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const CHAT_RATE_LIMIT_MAX_REQUESTS = 20 // 20 chat requests per minute

// In-memory store for rate limiting (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

/**
 * Get client identifier from request headers
 * Works with both NextRequest and standard Request
 */
function getClientIdentifierFromHeaders(headers: Headers): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwardedFor = headers.get("x-forwarded-for")
  const realIp = headers.get("x-real-ip")
  const clientIp = headers.get("x-client-ip")

  // Use the first available IP
  const ip = forwardedFor?.split(",")[0]?.trim() ||
             realIp ||
             clientIp ||
             "unknown"

  return ip
}

/**
 * Get client identifier (IP address) from NextRequest
 */
function getClientIdentifier(request: NextRequest): string {
  return getClientIdentifierFromHeaders(request.headers)
}

/**
 * Check if request is within rate limits
 */
export function checkRateLimit(request: NextRequest): { allowed: boolean; remaining: number; resetTime: number } {
  const clientId = getClientIdentifier(request)
  const now = Date.now()

  // Clean up expired entries periodically
  if (Math.random() < 0.01) { // 1% chance to cleanup
    cleanupExpiredEntries()
  }

  let clientData = rateLimitStore.get(clientId)

  if (!clientData || now > clientData.resetTime) {
    // First request or window expired
    clientData = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    }
    rateLimitStore.set(clientId, clientData)
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetTime: clientData.resetTime
    }
  }

  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: clientData.resetTime
    }
  }

  // Increment counter
  clientData.count++
  rateLimitStore.set(clientId, clientData)

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - clientData.count,
    resetTime: clientData.resetTime
  }
}

/**
 * Check rate limit for chat endpoints (more restrictive)
 * Works with standard Request type for streaming endpoints
 */
export function checkChatRateLimit(request: Request): { 
  allowed: boolean
  remaining: number
  resetTime: number 
} {
  const clientId = `chat:${getClientIdentifierFromHeaders(request.headers)}`
  const now = Date.now()

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupExpiredEntries()
  }

  let clientData = rateLimitStore.get(clientId)

  if (!clientData || now > clientData.resetTime) {
    clientData = {
      count: 1,
      resetTime: now + CHAT_RATE_LIMIT_WINDOW_MS
    }
    rateLimitStore.set(clientId, clientData)
    return {
      allowed: true,
      remaining: CHAT_RATE_LIMIT_MAX_REQUESTS - 1,
      resetTime: clientData.resetTime
    }
  }

  if (clientData.count >= CHAT_RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: clientData.resetTime
    }
  }

  clientData.count++
  rateLimitStore.set(clientId, clientData)

  return {
    allowed: true,
    remaining: CHAT_RATE_LIMIT_MAX_REQUESTS - clientData.count,
    resetTime: clientData.resetTime
  }
}

/**
 * Rate limiting middleware for API routes
 */
export function withRateLimit<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse> | NextResponse
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest
    const rateLimit = checkRateLimit(request)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetTime.toString(),
          }
        }
      )
    }

    // Add rate limit headers to successful responses
    const response = await handler(...args)

    // Clone the response to add headers
    const newResponse = NextResponse.json(response.body, response)

    newResponse.headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString())
    newResponse.headers.set("X-RateLimit-Reset", rateLimit.resetTime.toString())
    newResponse.headers.set("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString())

    return newResponse
  }
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats() {
  const now = Date.now()
  let activeClients = 0
  let totalRequests = 0

  for (const [, data] of rateLimitStore.entries()) {
    if (now <= data.resetTime) {
      activeClients++
      totalRequests += data.count
    }
  }

  return {
    activeClients,
    totalRequests,
    storeSize: rateLimitStore.size,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    chatWindowMs: CHAT_RATE_LIMIT_WINDOW_MS,
    chatMaxRequests: CHAT_RATE_LIMIT_MAX_REQUESTS
  }
}
