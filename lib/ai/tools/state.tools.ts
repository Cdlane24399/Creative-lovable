/**
 * State Analysis Tools
 *
 * Tools for analyzing the current state of the project including files,
 * build status, server state, and recent errors. Use these to understand
 * what's happening before making decisions or when debugging issues.
 */

import { tool } from "ai";
import { z } from "zod";
import { MAX_CONTENT_PREVIEW } from "../schemas/tool-schemas";
import {
  getAgentContext,
  generateContextSummary,
  getContextRecommendations,
  recordToolExecution,
} from "../agent-context";
import { createErrorResult } from "../utils/format-utils";

/**
 * Creates state analysis tools for a specific project.
 * These tools provide deep awareness of the project state, structure,
 * build status, and execution history for intelligent agentic decisions.
 *
 * @param projectId - The unique identifier for the project
 * @returns Object containing state analysis tools
 */
export function createStateTools(projectId: string) {
  const ctx = () => getAgentContext(projectId);

  return {
    /**
     * Analyzes the current state of the project.
     * Use to understand context before making decisions.
     */
    analyzeProjectState: tool({
      description:
        "Analyze the current state of the project including files, build status, " +
        "server state, and recent errors. Use this to understand what's happening " +
        "before making decisions or when debugging issues.",
      inputSchema: z.object({
        includeFileContents: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include content previews of recently modified files (first 1KB each)",
          ),
      }),
      execute: async ({ includeFileContents }) => {
        const startTime = new Date();

        try {
          const context = ctx();
          const summary = generateContextSummary(projectId);
          const recommendations = getContextRecommendations(projectId);

          const result: Record<string, unknown> = {
            success: true,
            summary,
            recommendations,
            stats: {
              filesTracked: context.files.size,
              dependenciesTracked: context.dependencies.size,
            },
            buildStatus: context.buildStatus,
            serverState: context.serverState,
            recentErrors: context.errorHistory.slice(-5),
            planProgress: context.currentPlan
              ? {
                  total: context.currentPlan.length,
                  completed: context.completedSteps.length,
                  remaining:
                    context.currentPlan.length - context.completedSteps.length,
                  nextStep:
                    context.currentPlan[context.completedSteps.length] ?? null,
                  completedSteps: context.completedSteps,
                }
              : null,
          };

          // Optionally include file content previews
          if (includeFileContents && context.files.size > 0) {
            const recentFiles: Record<string, string> = {};
            const entries = Array.from(context.files.entries()).slice(-5);

            for (const [filePath, info] of entries) {
              if (info.content) {
                recentFiles[filePath] = info.content.slice(
                  0,
                  MAX_CONTENT_PREVIEW,
                );
              }
            }

            result.recentFileContents = recentFiles;
          }

          recordToolExecution(
            projectId,
            "analyzeProjectState",
            { includeFileContents },
            result,
            true,
            undefined,
            startTime,
          );

          return result;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Analysis failed";
          recordToolExecution(
            projectId,
            "analyzeProjectState",
            { includeFileContents },
            undefined,
            false,
            errorMsg,
            startTime,
          );
          return createErrorResult(error);
        }
      },
    }),
  };
}
