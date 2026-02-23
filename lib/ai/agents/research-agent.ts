/**
 * Research Subagent - AI SDK v6 ToolLoopAgent
 *
 * A dedicated research agent that runs in an isolated context window to:
 * 1. Search the web for design inspiration, UI patterns, and relevant APIs
 * 2. Search the Vercel Skills registry for reusable skills matching the task
 * 3. Summarize findings concisely for the main coding agent
 *
 * This agent is invoked as a subagent by the main web builder agent
 * via the `research` tool. Its output is compressed via `toModelOutput`
 * to keep only the summary in the main agent's context.
 *
 * @see https://v6.ai-sdk.dev/docs/ai-sdk-core/agents
 */

import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { z } from "zod";
import { tavilySearch } from "@tavily/ai-sdk";

interface NpmSearchResponse {
  objects?: Array<{
    package?: {
      name?: string;
      version?: string;
      description?: string;
      links?: {
        npm?: string;
        homepage?: string;
        repository?: string;
      };
    };
    score?: {
      final?: number;
    };
  }>;
}

interface SkillSearchResult {
  name: string;
  version: string;
  description: string;
  npmUrl?: string;
  homepage?: string;
  repository?: string;
  score: number;
}

export async function searchSkillPackages(
  query: string,
): Promise<SkillSearchResult[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const searchTerms = `${trimmedQuery} ai agent skill vercel`;
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchTerms)}&size=10`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`npm registry search failed: ${response.status}`);
    }

    const data = (await response.json()) as NpmSearchResponse;
    const results =
      data.objects
        ?.map((entry): SkillSearchResult | null => {
          const pkg = entry.package;
          if (!pkg?.name || !pkg.version) return null;

          return {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description || "No description provided",
            npmUrl: pkg.links?.npm,
            homepage: pkg.links?.homepage,
            repository: pkg.links?.repository,
            score: entry.score?.final ?? 0,
          };
        })
        .filter((entry): entry is SkillSearchResult => Boolean(entry))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5) || [];

    return results;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Create a research agent instance.
 *
 * Uses AI Gateway model string format for provider routing.
 * The agent has access to web search and skills discovery tools,
 * and is limited to 5 steps to keep latency low.
 */
export function createResearchAgent() {
  return new ToolLoopAgent({
    model: "anthropic/claude-sonnet-4-6",
    instructions: `You are a research agent for a web builder. Your job is to:
1. Search the web for design inspiration, UI patterns, and relevant APIs
2. Search for reusable skills or packages matching the task
3. Summarize findings concisely for the main coding agent

IMPORTANT: Your final response must be a clear summary containing:
- Design inspiration URLs and key takeaways
- Relevant color palettes, typography suggestions, and layout patterns
- Any skills or packages discovered that could help
- API endpoints or data sources relevant to the task

Keep your summary under 2000 tokens. Be specific and actionable.
Focus on unique, distinctive design choices — avoid generic suggestions.`,
    tools: {
      webSearch: tavilySearch({
        maxResults: 5,
        searchDepth: "basic",
        includeAnswer: true,
      }),
      findSkills: tool({
        description:
          "Search for reusable skills, packages, or component libraries relevant to the task",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Search query for skills or packages (e.g., 'landing page animations', 'form validation')",
            ),
        }),
        execute: async ({ query }) => {
          try {
            const results = await searchSkillPackages(query);
            return {
              query,
              count: results.length,
              results,
              message:
                results.length > 0
                  ? `Found ${results.length} package candidates for "${query}".`
                  : `No package candidates found for "${query}".`,
            };
          } catch (error) {
            return {
              query,
              count: 0,
              results: [],
              error:
                error instanceof Error
                  ? error.message
                  : "Skill package search failed",
            };
          }
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });
}
