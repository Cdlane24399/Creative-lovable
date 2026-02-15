/**
 * Sync Tools - Database persistence for project files
 *
 * This module provides explicit sync operations to persist sandbox files
 * to the database.
 */

import { tool } from "ai";
import { z } from "zod";
import { getAgentContext, recordToolExecution } from "../agent-context";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { quickSyncToDatabaseWithRetry } from "@/lib/e2b/sync-manager";

/**
 * Creates sync tools for database persistence.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing the syncProject tool
 */
export function createSyncTools(projectId: string) {
  return {
    /**
     * Sync all project files to the database for persistence.
     * Call this after making file changes to ensure they're saved.
     * Automatically retries on transient failures.
     */
    syncProject: tool({
      description:
        "Sync all project files to the database for persistence. " +
        "Call this after batchWriteFiles or multiple writeFile operations to save changes. " +
        "Automatically retries on transient failures. " +
        "Does NOT need to be called after every single writeFile (that syncs automatically).",
      needsApproval: true,
      inputSchema: z.object({
        retryAttempts: z
          .number()
          .optional()
          .default(3)
          .describe("Number of retry attempts on failure"),
      }),

      execute: async ({ retryAttempts }) => {
        const startTime = new Date();
        const projectDir = getProjectDir();
        const ctx = getAgentContext(projectId);
        const projectName = ctx.projectName || "project";

        console.log(`[syncProject] Starting sync for project ${projectId}`);

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();

          const syncResult = await quickSyncToDatabaseWithRetry(
            sandbox,
            projectId,
            projectDir,
            retryAttempts,
          );

          const success = syncResult.success;
          const result = {
            success,
            filesSynced: syncResult.filesWritten,
            retryCount: syncResult.retryCount,
            errors: syncResult.errors || [],
            filesReady: success, // Signal that files are persisted
            projectName, // Include for frontend parser
            message: success
              ? `Synced ${syncResult.filesWritten} files to database`
              : `Sync completed with ${syncResult.errors?.length || 0} errors`,
          };

          recordToolExecution(
            projectId,
            "syncProject",
            {},
            {
              filesSynced: syncResult.filesWritten,
              filesReady: success,
              projectName,
            },
            success,
            success
              ? undefined
              : `Sync had ${syncResult.errors?.length || 0} errors`,
            startTime,
          );

          if (syncResult.errors && syncResult.errors.length > 0) {
            console.warn("[syncProject] Sync errors:", syncResult.errors);
          }

          // Return result with projectName for frontend parser
          return {
            ...result,
            projectName,
          };
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Sync failed";
          console.error("[syncProject] Failed to sync:", errorMsg);

          recordToolExecution(
            projectId,
            "syncProject",
            {},
            undefined,
            false,
            errorMsg,
            startTime,
          );

          return {
            success: false,
            filesSynced: 0,
            retryCount: retryAttempts,
            errors: [errorMsg],
            filesReady: false,
            projectName: ctx.projectName || "project",
            message: `Failed to sync project: ${errorMsg}`,
          };
        }
      },
    }),
  };
}
