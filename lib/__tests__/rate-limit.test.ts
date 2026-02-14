import { NextRequest } from "next/server";

// Mock the cache manager before importing the module under test
const mockIncr = jest.fn();
const mockExpire = jest.fn();
const mockTtl = jest.fn();

jest.mock("@/lib/cache/cache-manager", () => ({
  getCacheManager: jest.fn(() => ({
    enabled: false,
    getRedisClientForAtomicOps: () => null,
  })),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  checkRateLimit,
  checkChatRateLimit,
  getRateLimitStats,
} from "@/lib/rate-limit";

function makeRequest(ip = "127.0.0.1"): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
}

function makeStdRequest(ip = "127.0.0.1"): Request {
  return new Request("http://localhost/api/chat", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rate-limit (in-memory fallback)", () => {
  beforeEach(() => {
    // Reset internal store between tests via stats check
    jest.clearAllMocks();
  });

  it("allows the first request", async () => {
    const result = await checkRateLimit(makeRequest("10.0.0.1"));
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
  });

  it("decrements remaining on subsequent requests", async () => {
    const ip = "10.0.0.2";
    await checkRateLimit(makeRequest(ip));
    const second = await checkRateLimit(makeRequest(ip));
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(98);
  });

  it("checkChatRateLimit allows the first request", async () => {
    const result = await checkChatRateLimit(makeStdRequest("10.0.0.3"));
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(19);
  });

  it("checkChatRateLimit blocks after 20 requests", async () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 20; i++) {
      await checkChatRateLimit(makeStdRequest(ip));
    }
    const blocked = await checkChatRateLimit(makeStdRequest(ip));
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("getRateLimitStats returns store info", () => {
    const stats = getRateLimitStats();
    expect(stats).toHaveProperty("activeClients");
    expect(stats).toHaveProperty("storeSize");
    expect(stats.maxRequests).toBe(100);
    expect(stats.chatMaxRequests).toBe(20);
  });
});

describe("rate-limit (Redis path)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Enable Redis for these tests
    const { getCacheManager } = require("@/lib/cache/cache-manager");
    (getCacheManager as jest.Mock).mockReturnValue({
      enabled: true,
      getRedisClientForAtomicOps: () => ({
        incr: mockIncr,
        expire: mockExpire,
        ttl: mockTtl,
      }),
    });
  });

  it("uses Redis INCR when enabled", async () => {
    mockIncr.mockResolvedValue(1);
    mockTtl.mockResolvedValue(60);

    const result = await checkRateLimit(makeRequest("10.0.1.1"));
    expect(result.allowed).toBe(true);
    expect(mockIncr).toHaveBeenCalled();
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  it("blocks when Redis count exceeds limit", async () => {
    mockIncr.mockResolvedValue(101);
    mockTtl.mockResolvedValue(30);

    const result = await checkRateLimit(makeRequest("10.0.1.2"));
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("falls back to in-memory when Redis throws", async () => {
    mockIncr.mockRejectedValue(new Error("Connection refused"));

    const result = await checkRateLimit(makeRequest("10.0.1.3"));
    // Should succeed via in-memory fallback
    expect(result.allowed).toBe(true);
  });
});
