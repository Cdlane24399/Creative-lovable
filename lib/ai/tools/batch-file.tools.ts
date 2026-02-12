/**
 * Batch File Tools - Write multiple files in a single operation
 *
 * This module provides efficient batch file operations for the AI agent.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  getAgentContext,
  updateFilesInContext,
  recordToolExecution,
} from "../agent-context";
import { isPlaceholderProjectName } from "../project-naming";
import {
  executeCommand,
  writeFile as writeFileToSandbox,
  directoryExists,
} from "@/lib/e2b/sandbox";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { quickSyncToDatabaseWithRetry } from "@/lib/e2b/sync-manager";

// NOTE: getProjectDir() is called at runtime inside execute(), not at module load time,
// to ensure the sandbox context (AsyncLocalStorage) is available.
const WRITE_CONCURRENCY = 8;

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

interface ResolvedBatchFile {
  originalPath: string;
  relativePath: string;
  fullPath: string;
  content: string;
  requestedAction: "create" | "update";
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;

  const runWorker = async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current]);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    runWorker(),
  );

  await Promise.all(workers);
}

function resolveRuntimeRelativePath(
  path: string,
  runtimeAppDir: "app" | "src/app",
): string {
  const normalized = path.replace(/^\/+/, "");

  if (runtimeAppDir === "src/app") {
    if (normalized === "app") return "src/app";
    if (normalized.startsWith("app/")) return `src/${normalized}`;
  } else {
    if (normalized === "src/app") return "app";
    if (normalized.startsWith("src/app/")) {
      return normalized.replace(/^src\//, "");
    }
  }

  return normalized;
}

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
        "Write multiple files at once (default for new scaffolds and multi-file edits). " +
        "More efficient than multiple writeFile calls. " +
        "Automatically creates parent directories.",
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
        const projectDir = getProjectDir();
        const results = {
          created: [] as string[],
          updated: [] as string[],
          skipped: [] as string[],
          failed: [] as { path: string; error: string }[],
        };

        console.log(`[batchWriteFiles] Writing ${files.length} files`);

        try {
          const sandbox = getCurrentSandbox();
          const contextProjectName = ctx.projectName;
          const projectName =
            contextProjectName &&
            !isPlaceholderProjectName(contextProjectName, projectId)
              ? contextProjectName
              : "project";

          const [hasSrcApp, hasRootApp] = await Promise.all([
            directoryExists(sandbox, `${projectDir}/src/app`),
            directoryExists(sandbox, `${projectDir}/app`),
          ]);
          const appDir: "app" | "src/app" =
            hasSrcApp && !hasRootApp ? "src/app" : "app";

          const normalizedBaseDir = (baseDir || "app")
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");
          const effectiveBaseDir =
            normalizedBaseDir === "app" ? appDir : normalizedBaseDir;

          const resolvedFiles: ResolvedBatchFile[] = files.map((file) => {
            const rawPath = file.path.trim().replace(/^\/+/, "");
            const firstSegment = rawPath.split("/")[0] || "";
            const isRootRelative = rawPath.includes("/")
              ? ROOT_LEVEL_DIRS.has(firstSegment)
              : ROOT_LEVEL_FILES.has(rawPath) || rawPath.startsWith(".");

            const unresolvedPath = isRootRelative
              ? rawPath
              : `${effectiveBaseDir}/${rawPath}`;
            const relativePath = resolveRuntimeRelativePath(
              unresolvedPath,
              appDir,
            );

            return {
              originalPath: file.path,
              relativePath,
              fullPath: `${projectDir}/${relativePath}`,
              content: file.content,
              requestedAction: file.action ?? "create",
            };
          });

          const uniqueDirs = Array.from(
            new Set(
              resolvedFiles
                .map((file) => {
                  const dirIndex = file.fullPath.lastIndexOf("/");
                  return dirIndex > projectDir.length
                    ? file.fullPath.substring(0, dirIndex)
                    : null;
                })
                .filter((dir): dir is string => Boolean(dir)),
            ),
          );

          await runWithConcurrency(
            uniqueDirs,
            WRITE_CONCURRENCY,
            async (dir) => {
              await executeCommand(sandbox, `mkdir -p "${dir}"`);
            },
          );

          const contextUpdates: Array<{
            path: string;
            content?: string;
            action?: "created" | "updated" | "deleted";
          }> = [];

          await runWithConcurrency(
            resolvedFiles,
            WRITE_CONCURRENCY,
            async (file) => {
              try {
                if (file.requestedAction === "create") {
                  await writeFileToSandbox(
                    sandbox,
                    file.fullPath,
                    file.content,
                  );
                  results.created.push(file.relativePath);
                  contextUpdates.push({
                    path: file.relativePath,
                    content: file.content,
                    action: "created",
                  });
                  return;
                }

                let action: "created" | "updated" = "updated";
                try {
                  const existingContent = await sandbox.files.read(
                    file.fullPath,
                  );
                  if (existingContent === file.content) {
                    results.skipped.push(file.relativePath);
                    return;
                  }
                } catch {
                  action = "created";
                }

                await writeFileToSandbox(sandbox, file.fullPath, file.content);

                if (action === "created") {
                  results.created.push(file.relativePath);
                } else {
                  results.updated.push(file.relativePath);
                }

                contextUpdates.push({
                  path: file.relativePath,
                  content: file.content,
                  action,
                });
              } catch (error) {
                const errorMsg =
                  error instanceof Error ? error.message : "Write failed";
                results.failed.push({
                  path: file.originalPath,
                  error: errorMsg,
                });
                console.error(
                  `[batchWriteFiles] Failed to write ${file.originalPath}:`,
                  errorMsg,
                );
              }
            },
          );

          if (contextUpdates.length > 0) {
            updateFilesInContext(projectId, contextUpdates);
          }

          const success = results.failed.length === 0;
          const totalProcessed =
            results.created.length +
            results.updated.length +
            results.skipped.length;

          // Fire-and-forget sync so filesReady returns immediately.
          if (contextUpdates.length > 0) {
            quickSyncToDatabaseWithRetry(sandbox, projectId, projectDir)
              .then((syncResult) => {
                console.log(
                  `[batchWriteFiles] Background sync completed: ${syncResult.filesWritten} files`,
                );
              })
              .catch((syncError) => {
                console.warn(
                  "[batchWriteFiles] Background sync failed:",
                  syncError,
                );
              });
          }

          const result = {
            success,
            totalFiles: files.length,
            processed: totalProcessed,
            created: results.created,
            updated: results.updated,
            skipped: results.skipped,
            failed: results.failed,
            filesReady: success,
            projectName,
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

          const projectName =
            getAgentContext(projectId).projectName || "project";
          const safeProjectName = isPlaceholderProjectName(
            projectName,
            projectId,
          )
            ? "project"
            : projectName;

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
            projectName: safeProjectName,
            message: `Failed to write files: ${errorMsg}`,
          };
        }
      },
    }),
  };
}
