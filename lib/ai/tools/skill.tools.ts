/**
 * Skill Tools - Vercel Skills Registry Discovery
 *
 * Provides a tool to search the Vercel Skills registry from within
 * the E2B sandbox using `npx -y skills find [query]`.
 *
 * @see https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem
 */

import { tool } from "ai";
import { z } from "zod";
import { recordToolExecution } from "../agent-context";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";

/**
 * Creates skill discovery tools for the web builder agent.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing skill tools
 */
export function createSkillTools(projectId: string) {
  const findSkills = tool({
    description: `Search the Vercel Skills registry for reusable agent capabilities.
Use this to discover npm packages that provide specialized skills like:
- UI component generation
- Code refactoring and analysis
- Testing and quality tools
- Data fetching and API integration

Returns matching skills with descriptions and install instructions.`,
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe("Search query for the skills registry (e.g., 'react testing', 'form validation')"),
    }),
    execute: async ({ query }) => {
      const sandbox = getCurrentSandbox();

      if (!sandbox) {
        recordToolExecution(projectId, "findSkills", { query }, undefined, false);
        return {
          success: false,
          query,
          error: "No sandbox available to search skills registry",
        };
      }

      try {
        const result = await sandbox.commands.run(
          `npx -y skills find ${JSON.stringify(query)}`,
          { timeoutMs: 30_000 },
        );

        const success = result.exitCode === 0;
        recordToolExecution(projectId, "findSkills", { query }, undefined, success);

        return {
          success,
          query,
          results: result.stdout.trim(),
          ...(result.stderr && !success ? { error: result.stderr.trim() } : {}),
        };
      } catch (error) {
        recordToolExecution(projectId, "findSkills", { query }, undefined, false);
        return {
          success: false,
          query,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  return { findSkills };
}
