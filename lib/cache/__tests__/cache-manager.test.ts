jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue([0, []]),
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

// Ensure Redis env vars are NOT set for pure-LRU tests
const originalEnv = process.env;

describe("CacheManager (LRU-only mode)", () => {
  let CacheManager: typeof import("@/lib/cache/cache-manager").CacheManager;

  beforeAll(() => {
    process.env = { ...originalEnv };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TOKEN;

    // Re-import after env vars cleared
    jest.resetModules();
    CacheManager = require("@/lib/cache/cache-manager").CacheManager;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("reports Redis as not configured", () => {
    const cm = new CacheManager();
    expect(cm.enabled).toBe(false);
    expect(cm.available).toBe(true); // LRU always available
  });

  it("can set and get project data via LRU", async () => {
    const cm = new CacheManager();
    await cm.setProject("p1", { project: { id: "p1", name: "Test" } });
    const cached = await cm.getProject("p1");
    expect(cached).toEqual({ project: { id: "p1", name: "Test" } });
  });

  it("returns null for missing keys", async () => {
    const cm = new CacheManager();
    const cached = await cm.getProject("nonexistent");
    expect(cached).toBeNull();
  });

  it("invalidates project cache", async () => {
    const cm = new CacheManager();
    await cm.setProject("p2", { project: { id: "p2" } });
    await cm.invalidateProjectCache("p2");
    const cached = await cm.getProject("p2");
    expect(cached).toBeNull();
  });

  it("sets and retrieves messages", async () => {
    const cm = new CacheManager();
    const msgs = [{ id: "m1", content: "hello" }];
    await cm.setMessages("p1", msgs);
    const cached = await cm.getMessages("p1");
    expect(cached).toEqual(msgs);
  });

  it("sets and retrieves context", async () => {
    const cm = new CacheManager();
    const ctx = { taskGraph: null, serverState: { isRunning: true } };
    await cm.setContext("p1", ctx);
    const cached = await cm.getContext("p1");
    expect(cached).toEqual(ctx);
  });

  it("invalidateAllForProject clears all related caches", async () => {
    const cm = new CacheManager();
    await cm.setProject("p3", { project: { id: "p3" } });
    await cm.setMessages("p3", [{ id: "m1" }]);
    await cm.setContext("p3", { state: "active" });

    await cm.invalidateAllForProject("p3");

    expect(await cm.getProject("p3")).toBeNull();
    expect(await cm.getMessages("p3")).toBeNull();
    expect(await cm.getContext("p3")).toBeNull();
  });

  it("getStats reports disabled when Redis not configured", async () => {
    const cm = new CacheManager();
    const stats = await cm.getStats();
    expect(stats.status).toBe("disabled");
    expect(stats.connected).toBe(false);
  });

  it("emits events on cache operations", async () => {
    const cm = new CacheManager();
    const events: Array<{ type: string; key: string }> = [];
    cm.onEvent((event) => events.push({ type: event.type, key: event.key }));

    await cm.setProject("ev1", { project: {} });
    await cm.getProject("ev1");
    await cm.invalidateProjectCache("ev1");

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "set" }),
        expect.objectContaining({ type: "get" }),
        expect.objectContaining({ type: "delete" }),
      ]),
    );
  });
});
