/**
 * Search Tools - Web Search via Tavily
 *
 * Provides real web search using Tavily's AI-optimized search API.
 * TAVILY_API_KEY is read automatically from process.env by the package.
 *
 * @see https://docs.tavily.com/documentation/integrations/vercel
 */

import { type ToolExecutionOptions } from "ai";
import { tavilySearch } from "@tavily/ai-sdk";
import { recordToolExecution } from "../agent-context";

/**
 * Creates search tools for the web builder agent.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing search tools
 */
export function createSearchTools(projectId: string) {
  const baseTool = tavilySearch({
    maxResults: 5,
    searchDepth: "basic",
    includeAnswer: true,
  });

  const baseExecute = baseTool.execute!;
  type ExecuteInput = Parameters<typeof baseExecute>[0];

  const webSearch = {
    ...baseTool,
    execute: (async (input: ExecuteInput, options: ToolExecutionOptions) => {
      try {
        const result = await baseExecute(input, options);
        recordToolExecution(projectId, "webSearch", input, undefined, true);
        return result;
      } catch (error) {
        recordToolExecution(projectId, "webSearch", input, undefined, false);
        throw error;
      }
    }) as unknown as typeof baseExecute,
  };

  return { webSearch };
}
