/**
 * Batch File Tools - Write multiple files in a single operation
 *
 * This module provides efficient batch file operations for the AI agent.
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
  directoryExists,
} from "@/lib/e2b/sandbox";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { quickSyncToDatabaseWithRetry } from "@/lib/e2b/sync-manager";

const projectDir = getProjectDir();

const ROOT_LEVEL_DIRS = new Set([
  "app",
  "src",
  "components",
  "lib",
  "hooks",
  "styles",
  "public",
  "scripts",
  "docs",
  "e2e",
  "supabase",
  "types",
  "tests",
  "__tests__",
]);

const ROOT_LEVEL_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "yarn.lock",
  "package-lock.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.mjs",
  "postcss.config.js",
  "postcss.config.mjs",
  "tailwind.config.js",
  "tailwind.config.ts",
  "eslint.config.js",
  "eslint.config.mjs",
  "jest.config.js",
  "jest.setup.js",
  "playwright.config.ts",
  "components.json",
  "vercel.json",
  "README.md",
  ".env",
  ".env.local",
  ".env.example",
]);

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
  const resolveRuntimeRelativePath = async (
    sandbox: ReturnType<typeof getCurrentSandbox>,
    path: string,
  ): Promise<string> => {
    const normalized = path.replace(/^\/+/, "");
    const [hasSrcApp, hasRootApp] = await Promise.all([
      directoryExists(sandbox, `${projectDir}/src/app`),
      directoryExists(sandbox, `${projectDir}/app`),
    ]);

    const runtimeAppDir = hasSrcApp && !hasRootApp ? "src/app" : "app";

    if (runtimeAppDir === "src/app") {
      if (normalized === "app") return "src/app";
      if (normalized.startsWith("app/")) return `src/${normalized}`;
    } else {
      if (normalized === "src/app") return "app";
      if (normalized.startsWith("src/app/"))
        return normalized.replace(/^src\//, "");
    }

    return normalized;
  };

  return {
    /**
     * Write multiple files in a single operation.
     * More efficient than calling writeFile multiple times for initial project setup.
     * Automatically creates parent directories.
     */
    batchWriteFiles: tool({
      description:
        "Write multiple files at once (default for new scaffolds and multi-file edits). " +
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
          const [hasSrcApp, hasRootApp] = await Promise.all([
            directoryExists(sandbox, `${projectDir}/src/app`),
            directoryExists(sandbox, `${projectDir}/app`),
          ]);
          const appDir = hasSrcApp && !hasRootApp ? "src/app" : "app";

          const normalizedBaseDir = (baseDir || "app")
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");
          const effectiveBaseDir =
            normalizedBaseDir === "app" ? appDir : normalizedBaseDir;

          // Process files sequentially to avoid race conditions with directory creation
          for (const file of files) {
            try {
              // Determine full path
              const rawPath = file.path.trim().replace(/^\/+/, "");
              const firstSegment = rawPath.split("/")[0] || "";
              const isRootRelative = rawPath.includes("/")
                ? ROOT_LEVEL_DIRS.has(firstSegment)
                : ROOT_LEVEL_FILES.has(rawPath) || rawPath.startsWith(".");

              const unresolvedPath = isRootRelative
                ? rawPath
                : `${effectiveBaseDir}/${rawPath}`;
              const relativePath = await resolveRuntimeRelativePath(
                sandbox,
                unresolvedPath,
              );
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
