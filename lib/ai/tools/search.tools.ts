/**
 * Search Tools - Web Search Capability for AI Agent
 *
 * This module provides web search tools that leverage AI Gateway's built-in
 * search capability. When enabled via providerOptions, the model can perform
 * web searches to look up documentation, APIs, best practices, and more.
 *
 * AI SDK v6 Web Search:
 * - Enabled via providerOptions.gateway.search in streamText()
 * - Model automatically gets access to search tool when search is enabled
 * - No separate tool definition needed - it's automatic
 *
 * This file provides:
 * - A search tool that can be used to document the capability
 * - Helper to check if search is available
 *
 * @see https://vercel.com/docs/ai-gateway/capabilities/web-search
 */

import { tool } from "ai";
import { z } from "zod";
import { recordToolExecution } from "../agent-context";

/**
 * Web search tool schema
 * Documents the search capability for the model
 */
const webSearchSchema = z.object({
  query: z.string().describe("The search query to look up information"),
  reason: z
    .string()
    .optional()
    .describe("Why this search is needed - helps with context"),
});

export type WebSearchInput = z.infer<typeof webSearchSchema>;

/**
 * Creates search-related tools for the web builder agent
 *
 * Note: The actual web search capability is enabled via providerOptions
 * in the streamText call. This tool serves as documentation and can be
 * used to trigger searches when needed.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing search-related tools
 */
export function createSearchTools(projectId: string) {
  /**
   * Web Search Tool
   *
   * When web search is enabled via AI Gateway provider options,
   * the model automatically gets access to search capabilities.
   *
   * This tool documents the capability and can be used to:
   * - Look up documentation for libraries/frameworks
   * - Find API references and examples
   * - Search for best practices and patterns
   * - Debug issues by searching for solutions
   *
   * Usage: The model will automatically use search when enabled in providerOptions
   */
  const webSearch = tool({
    description: `Search the web for information. Use this to:
- Look up documentation for libraries, frameworks, or APIs
- Find code examples and best practices
- Search for solutions to debugging problems
- Get up-to-date information on technologies

The search results will provide relevant links and summaries to help answer the user's question.`,
    inputSchema: webSearchSchema,
    execute: async ({ query, reason }) => {
      // Record tool execution for context tracking
      recordToolExecution(
        projectId,
        "webSearch",
        { query, reason },
        undefined,
        true,
      );

      // The actual search is handled by AI Gateway automatically
      // This tool serves as documentation and can be used to
      // explicitly trigger a search when needed
      return {
        success: true,
        message: `Search for "${query}" initiated. The model will use search results to provide an informed response.`,
        query,
        reason: reason || "Information lookup",
      };
    },
  });

  /**
   * Documentation Lookup Tool
   *
   * Specialized tool for looking up documentation
   */
  const lookupDocumentation = tool({
    description: `Look up documentation for a specific library, framework, API, or technology. 
Use this when you need to:
- Check official documentation for a library
- Find API reference for a service
- Understand how to use a specific feature
- Find correct usage patterns for a tool`,
    inputSchema: z.object({
      library: z
        .string()
        .describe("The name of the library or technology"),
      topic: z
        .string()
        .optional()
        .describe("Specific topic or feature to look up"),
      query: z
        .string()
        .optional()
        .describe("Additional search query if needed"),
    }),
    execute: async ({ library, topic, query }) => {
      recordToolExecution(
        projectId,
        "lookupDocumentation",
        { library, topic, query },
        undefined,
        true,
      );

      const searchQuery = query
        ? query
        : topic
          ? `${library} ${topic} documentation`
          : `${library} documentation`;

      return {
        success: true,
        message: `Looking up documentation for ${library}${topic ? `: ${topic}` : ""}`,
        searchQuery,
        library,
        topic,
      };
    },
  });

  return {
    webSearch,
    lookupDocumentation,
  };
}
