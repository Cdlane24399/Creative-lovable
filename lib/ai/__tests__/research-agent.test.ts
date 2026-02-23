jest.mock(
  "@tavily/ai-sdk",
  () => ({
    tavilySearch: () => ({ execute: jest.fn() }),
  }),
  { virtual: true },
);

import { searchSkillPackages } from "@/lib/ai/agents/research-agent";

describe("research agent skill search", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns sorted package candidates from npm search", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        objects: [
          {
            package: {
              name: "pkg-low",
              version: "1.0.0",
              description: "low",
              links: { npm: "https://npmjs.com/pkg-low" },
            },
            score: { final: 0.2 },
          },
          {
            package: {
              name: "pkg-high",
              version: "2.0.0",
              description: "high",
              links: { npm: "https://npmjs.com/pkg-high" },
            },
            score: { final: 0.9 },
          },
        ],
      }),
    } as Response);

    const results = await searchSkillPackages("form validation");

    expect(results).toHaveLength(2);
    expect(results[0]?.name).toBe("pkg-high");
    expect(results[1]?.name).toBe("pkg-low");
  });

  it("returns empty results for blank query", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const results = await searchSkillPackages("   ");

    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
