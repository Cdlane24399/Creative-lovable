import { NextRequest, NextResponse } from "next/server";
import { getCacheManager } from "@/lib/cache/cache-manager";
import { logger } from "@/lib/logger";

// Rate limit configuration
// Both general and chat limits share the same window; only max requests differ.
const RATE_LIMIT_WINDOW_S = 60; // 1 minute
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_S * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute

// Chat-specific rate limiting (more restrictive for AI endpoints)
const CHAT_RATE_LIMIT_MAX_REQUESTS = 20; // 20 chat requests per minute

// In-memory store for rate limiting (fallback when Redis unavailable)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX_STORE_SIZE = 10_000;

const REDIS_RL_PREFIX = "rl:";

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Deterministic periodic cleanup every 60 seconds (replaces probabilistic 1% per-request)
const cleanupInterval = setInterval(cleanupExpiredEntries, 60_000);
// Allow Node.js to exit without waiting for this interval
if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
  cleanupInterval.unref();
}

/**
 * Get client identifier from request headers
 * Works with both NextRequest and standard Request
 */
function getClientIdentifierFromHeaders(headers: Headers): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwardedFor = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const clientIp = headers.get("x-client-ip");

  // Use the first available IP
  const ip =
    forwardedFor?.split(",")[0]?.trim() || realIp || clientIp || "unknown";

  return ip;
}

/**
 * Get client identifier (IP address) from NextRequest
 */
function getClientIdentifier(request: NextRequest): string {
  return getClientIdentifierFromHeaders(request.headers);
}

// ---------------------------------------------------------------------------
// Redis-backed rate limiting (atomic INCR + EXPIRE)
// Falls back to in-memory when Redis is unavailable.
// ---------------------------------------------------------------------------

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Try to perform the rate-limit check via Redis.
 * Returns `null` when Redis is not configured or the command fails,
 * signalling the caller to fall through to the in-memory path.
 */
async function checkRateLimitRedis(
  key: string,
  windowS: number,
  maxRequests: number,
): Promise<RateLimitResult | null> {
  const cache = getCacheManager();
  if (!cache.enabled) return null;

  try {
    const redis = cache.getRedisClientForAtomicOps();
    if (!redis) return null;

    const redisKey = `${REDIS_RL_PREFIX}${key}`;
    const count: number = await redis.incr(redisKey);

    if (count === 1) {
      // First request in this window – set the TTL.
      await redis.expire(redisKey, windowS);
    }

    // Approximate resetTime from the TTL value.
    const ttl: number = await redis.ttl(redisKey);
    const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : windowS * 1000);

    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetTime,
    };
  } catch (error) {
    logger.warn("Redis rate-limit check failed, falling back to in-memory", {}, error);
    return null;
  }
}

/**
 * In-memory rate-limit check (synchronous fallback).
 */
function checkRateLimitMemory(
  clientId: string,
  windowMs: number,
  maxRequests: number,
): RateLimitResult {
  const now = Date.now();

  if (rateLimitStore.size >= RATE_LIMIT_MAX_STORE_SIZE) {
    cleanupExpiredEntries();
  }

  let clientData = rateLimitStore.get(clientId);

  if (!clientData || now > clientData.resetTime) {
    clientData = { count: 1, resetTime: now + windowMs };
    rateLimitStore.set(clientId, clientData);
    return { allowed: true, remaining: maxRequests - 1, resetTime: clientData.resetTime };
  }

  if (clientData.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: clientData.resetTime };
  }

  clientData.count++;
  rateLimitStore.set(clientId, clientData);
  return { allowed: true, remaining: maxRequests - clientData.count, resetTime: clientData.resetTime };
}

/**
 * Check if request is within rate limits.
 * Tries Redis first, falls back to in-memory.
 */
export async function checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const clientId = getClientIdentifier(request);

  const redisResult = await checkRateLimitRedis(clientId, RATE_LIMIT_WINDOW_S, RATE_LIMIT_MAX_REQUESTS);
  if (redisResult) return redisResult;

  return checkRateLimitMemory(clientId, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);
}

/**
 * Check rate limit for chat endpoints (more restrictive).
 * Tries Redis first, falls back to in-memory.
 */
export async function checkChatRateLimit(request: Request): Promise<RateLimitResult> {
  const clientId = `chat:${getClientIdentifierFromHeaders(request.headers)}`;

  const redisResult = await checkRateLimitRedis(clientId, RATE_LIMIT_WINDOW_S, CHAT_RATE_LIMIT_MAX_REQUESTS);
  if (redisResult) return redisResult;

  return checkRateLimitMemory(clientId, RATE_LIMIT_WINDOW_MS, CHAT_RATE_LIMIT_MAX_REQUESTS);
}

/**
 * Rate limiting middleware for API routes
 */
export function withRateLimit<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse> | NextResponse,
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest;
    const rateLimit = await checkRateLimit(request);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              (rateLimit.resetTime - Date.now()) / 1000,
            ).toString(),
            "X-RateLimit-Remaining": rateLimit.remaining.toString(),
            "X-RateLimit-Reset": rateLimit.resetTime.toString(),
          },
        },
      );
    }

    // Execute handler and add rate limit headers to the response
    const response = await handler(...args);

    // Augment headers directly on the response — don't re-serialize the body
    response.headers.set(
      "X-RateLimit-Remaining",
      rateLimit.remaining.toString(),
    );
    response.headers.set("X-RateLimit-Reset", rateLimit.resetTime.toString());
    response.headers.set(
      "X-RateLimit-Limit",
      RATE_LIMIT_MAX_REQUESTS.toString(),
    );

    return response;
  };
}

/**
 * Get rate limit statistics
 */
export function getRateLimitStats() {
  const now = Date.now();
  let activeClients = 0;
  let totalRequests = 0;

  for (const [, data] of rateLimitStore.entries()) {
    if (now <= data.resetTime) {
      activeClients++;
      totalRequests += data.count;
    }
  }

  return {
    activeClients,
    totalRequests,
    storeSize: rateLimitStore.size,
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    chatWindowMs: RATE_LIMIT_WINDOW_MS,
    chatMaxRequests: CHAT_RATE_LIMIT_MAX_REQUESTS,
  };
}
