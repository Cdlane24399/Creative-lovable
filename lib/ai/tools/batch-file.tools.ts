/**
 * Batch File Tools - Write multiple files in a single operation
 *
 * This module provides efficient batch file operations for the AI agent,
 * replacing the file-writing loops hidden inside the legacy createWebsite tool.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  getAgentContext,
  updateFileInContext,
  recordToolExecution,
} from "../agent-context";
import {
  executeCommand,
  writeFile as writeFileToSandbox,
} from "@/lib/e2b/sandbox";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { quickSyncToDatabaseWithRetry } from "@/lib/e2b/sync-manager";

const projectDir = "/home/user/project";

// Schema for a single file in a batch operation
const batchFileSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("File path relative to project root (e.g., 'app/page.tsx')"),
  content: z.string().describe("Complete file content"),
  action: z
    .enum(["create", "update"])
    .optional()
    .default("create")
    .describe("Whether to create new or update existing"),
});

/**
 * Creates batch file operation tools.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing the batchWriteFiles tool
 */
export function createBatchFileTools(projectId: string) {
  return {
    /**
     * Write multiple files in a single operation.
     * More efficient than calling writeFile multiple times for initial project setup.
     * Automatically creates parent directories.
     */
    batchWriteFiles: tool({
      description:
        "Write multiple files at once. Use for initial project setup or bulk updates. " +
        "More efficient than multiple writeFile calls. " +
        "Automatically creates parent directories. " +
        "Skips files that already exist with identical content.",
      inputSchema: z.object({
        files: z
          .array(batchFileSchema)
          .min(1)
          .max(50)
          .describe("Files to write (max 50 per batch)"),
        baseDir: z
          .string()
          .optional()
          .default("app")
          .describe("Base directory for relative paths ('app' or 'src/app')"),
      }),

      execute: async ({ files, baseDir }) => {
        const startTime = new Date();
        const ctx = getAgentContext(projectId);
        const results = {
          created: [] as string[],
          updated: [] as string[],
          skipped: [] as string[],
          failed: [] as { path: string; error: string }[],
        };

        console.log(`[batchWriteFiles] Writing ${files.length} files`);

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();

          // Get project name from context for frontend parser
          const projectName = ctx.projectName || "project";

          // Resolve app directory
          const hasSrcApp = await sandbox.files.exists(`${projectDir}/src/app`);
          const appDir = hasSrcApp ? "src/app" : "app";

          // Process files sequentially to avoid race conditions with directory creation
          for (const file of files) {
            try {
              // Determine full path
              const isAbsolutePath =
                file.path.startsWith("app/") ||
                file.path.startsWith("components/");
              const relativePath = isAbsolutePath
                ? file.path
                : `${baseDir}/${file.path}`;
              const fullPath = `${projectDir}/${relativePath}`;

              // Create parent directories
              const dirIndex = fullPath.lastIndexOf("/");
              if (dirIndex > projectDir.length) {
                const dir = fullPath.substring(0, dirIndex);
                await executeCommand(sandbox, `mkdir -p "${dir}"`);
              }

              // Check if file exists and compare content
              let shouldWrite = true;
              let action: "created" | "updated" =
                file.action === "update" ? "updated" : "created";

              try {
                const existing = await sandbox.files.read(fullPath);
                if (existing === file.content) {
                  shouldWrite = false;
                  results.skipped.push(relativePath);
                } else {
                  action = "updated";
                }
              } catch {
                // File doesn't exist, will create
                action = "created";
              }

              if (shouldWrite) {
                await writeFileToSandbox(sandbox, fullPath, file.content);
                updateFileInContext(
                  projectId,
                  relativePath,
                  file.content,
                  action,
                );

                if (action === "created") {
                  results.created.push(relativePath);
                } else {
                  results.updated.push(relativePath);
                }
              }
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : "Write failed";
              results.failed.push({ path: file.path, error: errorMsg });
              console.error(
                `[batchWriteFiles] Failed to write ${file.path}:`,
                errorMsg,
              );
            }
          }

          const success = results.failed.length === 0;
          const totalProcessed =
            results.created.length +
            results.updated.length +
            results.skipped.length;

          // Auto-sync to database after batch write
          if (results.created.length > 0 || results.updated.length > 0) {
            try {
              const syncResult = await quickSyncToDatabaseWithRetry(
                sandbox,
                projectId,
                projectDir,
              );
              console.log(
                `[batchWriteFiles] Auto-synced: ${syncResult.filesWritten} files`,
              );
            } catch (syncError) {
              console.warn("[batchWriteFiles] Auto-sync failed:", syncError);
            }
          }

          const result = {
            success,
            totalFiles: files.length,
            processed: totalProcessed,
            created: results.created,
            updated: results.updated,
            skipped: results.skipped,
            failed: results.failed,
            filesReady: success, // Signal that files are written and ready
            projectName, // Include for frontend parser
            message: success
              ? `Wrote ${results.created.length} new, ${results.updated.length} updated, ${results.skipped.length} skipped`
              : `Partial success: ${totalProcessed} succeeded, ${results.failed.length} failed`,
          };

          recordToolExecution(
            projectId,
            "batchWriteFiles",
            { fileCount: files.length },
            {
              created: results.created.length,
              updated: results.updated.length,
              filesReady: success,
            },
            success,
            success ? undefined : `${results.failed.length} files failed`,
            startTime,
          );

          return result;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Batch write failed";
          recordToolExecution(
            projectId,
            "batchWriteFiles",
            { fileCount: files.length },
            undefined,
            false,
            errorMsg,
            startTime,
          );

          // Get project name from context for error response
          const projectName =
            getAgentContext(projectId).projectName || "project";

          return {
            success: false,
            totalFiles: files.length,
            processed: 0,
            created: results.created,
            updated: results.updated,
            skipped: results.skipped,
            failed: results.failed,
            error: errorMsg,
            filesReady: false,
            projectName,
            message: `Failed to write files: ${errorMsg}`,
          };
        }
      },
    }),
  };
}
