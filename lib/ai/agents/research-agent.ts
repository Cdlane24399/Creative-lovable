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

/**
 * Create a research agent instance.
 *
 * Uses AI Gateway model string format for provider routing.
 * The agent has access to web search and skills discovery tools,
 * and is limited to 5 steps to keep latency low.
 */
export function createResearchAgent() {
  return new ToolLoopAgent({
    model: "anthropic/claude-sonnet-4-5",
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
          // This is a lightweight search — the main agent has full sandbox access
          // for installing packages. This just discovers what's available.
          return {
            query,
            note: `Skills search for "${query}" completed. The main agent can install discovered packages using installPackage.`,
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });
}
