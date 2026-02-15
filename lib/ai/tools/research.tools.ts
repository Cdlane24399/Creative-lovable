/**
 * Research Tools - Subagent-based Research
 *
 * Wraps the research subagent as a tool for the main web builder agent.
 * Calls the research agent, collects all output, and returns a compressed
 * text summary to keep the main agent's context window clean.
 *
 * The research tool should be called FIRST on every new project to find
 * design inspiration, relevant APIs, color palettes, typography, and
 * reusable skills before writing any code.
 *
 * @see https://v6.ai-sdk.dev/docs/ai-sdk-core/agents
 */

import { tool, readUIMessageStream } from "ai";
import { z } from "zod";
import { createResearchAgent } from "../agents/research-agent";
import { recordToolExecution } from "../agent-context";

/**
 * Creates research tools for the web builder agent.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing the research tool
 */
export function createResearchTools(projectId: string) {
  const research = tool({
    description: `Research a topic before building. Use this FIRST on every new project to find design inspiration, relevant APIs, color palettes, typography, and reusable skills. Returns a concise summary that informs your design decisions.

Call this with the user's request as the task parameter. The research runs in a dedicated agent with web search access, keeping your main context clean.`,
    inputSchema: z.object({
      task: z
        .string()
        .describe("What the user wants to build — used as the research query"),
    }),
    execute: async ({ task }, { abortSignal }) => {
      try {
        const researchAgent = createResearchAgent();

        const result = await researchAgent.stream({
          prompt: `Research for building: ${task}. Find design inspiration, relevant UI patterns, color palettes, typography suggestions, and any reusable skills or packages.`,
          abortSignal,
        });

        // Collect all messages from the research agent stream
        let lastTextContent = "Research completed — no specific findings.";
        for await (const message of readUIMessageStream({
          stream: result.toUIMessageStream(),
        })) {
          const lastTextPart = message?.parts?.findLast(
            (p: { type: string }) => p.type === "text",
          );
          if (lastTextPart && "text" in lastTextPart) {
            lastTextContent = (lastTextPart as { text: string }).text;
          }
        }

        recordToolExecution(projectId, "research", { task }, undefined, true);
        return { summary: lastTextContent };
      } catch (error) {
        recordToolExecution(projectId, "research", { task }, undefined, false);
        return {
          summary: `Research could not be completed: ${error instanceof Error ? error.message : "Unknown error"}. Proceeding without research — use webSearch directly if needed.`,
        };
      }
    },
  });

  return { research };
}
