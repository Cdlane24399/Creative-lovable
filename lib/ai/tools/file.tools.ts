/**
 * File Tools - File operation tools for the web builder agent
 *
 * This module contains tools for reading, writing, and editing files
 * in the project environment.
 *
 * @see {@link ../web-builder-agent.ts} for additional tool implementations
 */

import { tool } from "ai";
import { z } from "zod";
import { filePathSchema } from "../schemas/tool-schemas";
import {
  getAgentContext,
  updateFileInContext,
  recordToolExecution,
} from "../agent-context";
import {
  executeCommand,
  writeFile as writeFileToSandbox,
  readFile as readFileFromSandbox,
  fileExists,
  directoryExists,
} from "@/lib/e2b/sandbox";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { createErrorResult } from "../utils";

/**
 * Creates file operation tools for managing files in the project.
 * These tools enable reading, writing, and editing files during development.
 *
 * @param projectId - The unique identifier for the project
 * @returns Object containing writeFile, readFile, and editFile tools
 */
export function createFileTools(projectId: string) {
  const ctx = () => getAgentContext(projectId);
  const projectDir = getProjectDir();
  const appLayoutRef = { checked: false, runtimeAppDir: "app" as "app" | "src/app" };

  const resolveRuntimeFilePath = async (
    sandbox: ReturnType<typeof getCurrentSandbox>,
    filePath: string,
  ): Promise<string> => {
    const normalized = filePath.replace(/^\/+/, "");

    if (!appLayoutRef.checked) {
      const [hasSrcApp, hasRootApp] = await Promise.all([
        directoryExists(sandbox, `${projectDir}/src/app`),
        directoryExists(sandbox, `${projectDir}/app`),
      ]);
      appLayoutRef.runtimeAppDir =
        hasSrcApp && !hasRootApp ? "src/app" : "app";
      appLayoutRef.checked = true;
    }

    if (appLayoutRef.runtimeAppDir === "src/app") {
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
     * Writes content to a file in the project.
     * Creates parent directories automatically.
     */
    writeFile: tool({
      description:
        "Write content to a single file in the project. Creates parent directories " +
        "if they don't exist. Prefer batchWriteFiles when changing multiple files.",
      inputSchema: z.object({
        path: filePathSchema,
        content: z.string().describe("Complete file content to write"),
      }),
      execute: async ({ path: filePath, content }) => {
        const startTime = new Date();
        const context = ctx();

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();
          const resolvedPath = await resolveRuntimeFilePath(sandbox, filePath);
          const fullPath = `${projectDir}/${resolvedPath}`;

          // Ensure parent directory exists
          const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
          await executeCommand(sandbox, `mkdir -p "${dir}"`);

          await writeFileToSandbox(sandbox, fullPath, content);

          // Track file state
          const isNew = !context.files.has(resolvedPath);
          updateFileInContext(
            projectId,
            resolvedPath,
            content,
            isNew ? "created" : "updated",
          );

          // Persist just this file to the database (incremental, not full sync)
          // Full project sync is deferred to syncProject/batchWriteFiles for efficiency
          console.log(
            `[writeFile] Persisting file ${resolvedPath} to database for project ${projectId}`,
          );
          try {
            const { getProjectRepository } = await import("@/lib/db/repositories");
            const repo = getProjectRepository();
            await repo.saveSingleFile(projectId, resolvedPath, content);
            console.log(
              `[writeFile] File persisted: ${resolvedPath}`,
            );
          } catch (syncError) {
            console.warn("[writeFile] Failed to persist file to database:", syncError);
            // Don't fail the tool execution if persistence fails - the file is still written to sandbox
          }

          // Get project name from context for frontend parser
          const projectName =
            getAgentContext(projectId).projectName || "project";

          // NOTE: filesReady is false here — only batchWriteFiles/syncProject
          // should signal filesReady to prevent premature dev server start
          const result = {
            success: true as const,
            path: resolvedPath,
            action: isNew ? ("created" as const) : ("updated" as const),
            bytes: content.length,
            filesReady: false,
            projectName,
            message: `File ${isNew ? "created" : "updated"}: ${filePath}`,
          };

          recordToolExecution(
            projectId,
            "writeFile",
            { path: resolvedPath },
            result,
            true,
            undefined,
            startTime,
          );

          return result;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Write failed";
          recordToolExecution(
            projectId,
            "writeFile",
            { path: filePath },
            undefined,
            false,
            errorMsg,
            startTime,
          );
          return createErrorResult(error, { path: filePath });
        }
      },
    }),

    /**
     * Reads content from a file in the project.
     * Caches content in context for future reference.
     */
    readFile: tool({
      description:
        "Read content from a file in the project. Use to examine existing " +
        "code before making edits or to understand project structure.",
      inputSchema: z.object({
        path: filePathSchema,
      }),
      execute: async ({ path: filePath }) => {
        const startTime = new Date();
        const context = ctx();

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();
          const resolvedPath = await resolveRuntimeFilePath(sandbox, filePath);
          const fullPath = `${projectDir}/${resolvedPath}`;

          // Check if file exists first to provide a clearer error message
          const exists = await fileExists(sandbox, fullPath);
          if (!exists) {
            const error = `File not found: ${resolvedPath}. The file may not have been created yet. Use getProjectStructure to see what files exist.`;
            recordToolExecution(
              projectId,
              "readFile",
              { path: resolvedPath },
              undefined,
              false,
              error,
              startTime,
            );
            return {
              success: false as const,
              error,
              path: resolvedPath,
              hint: "Use getProjectStructure to see what files currently exist in the project.",
            };
          }

          const result = await readFileFromSandbox(sandbox, fullPath);

          // Cache in context
          updateFileInContext(projectId, resolvedPath, result.content);

          const successResult = {
            success: true as const,
            path: resolvedPath,
            content: result.content,
            length: result.content.length,
            lines: result.content.split("\n").length,
          };

          recordToolExecution(
            projectId,
            "readFile",
            { path: resolvedPath },
            { success: true, length: result.content.length },
            true,
            undefined,
            startTime,
          );

          return successResult;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Read failed";
          recordToolExecution(
            projectId,
            "readFile",
            { path: filePath },
            undefined,
            false,
            errorMsg,
            startTime,
          );
          return createErrorResult(error, { path: filePath });
        }
      },
    }),

    /**
     * Edits specific content in a file using search and replace.
     * More precise than rewriting entire files.
     */
    editFile: tool({
      description:
        "Edit specific content in a file using search and replace. Use for targeted " +
        "modifications when you only need to change part of a file. The search text " +
        "must appear exactly once in the file.",
      inputSchema: z.object({
        path: filePathSchema,
        search: z
          .string()
          .min(1)
          .describe(
            "Exact text to find in the file - must be unique within the file",
          ),
        replace: z
          .string()
          .describe("New text to replace the search text with"),
      }),
      execute: async ({ path: filePath, search, replace }) => {
        const startTime = new Date();
        const context = ctx();

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();
          const resolvedPath = await resolveRuntimeFilePath(sandbox, filePath);
          const fullPath = `${projectDir}/${resolvedPath}`;

          // Check if file exists first
          const exists = await fileExists(sandbox, fullPath);
          if (!exists) {
            const error = `Cannot edit: file not found at ${resolvedPath}. Use writeFile to create it first, or use getProjectStructure to verify existing files.`;
            recordToolExecution(
              projectId,
              "editFile",
              { path: resolvedPath, search },
              undefined,
              false,
              error,
              startTime,
            );
            return {
              success: false as const,
              error,
              path: resolvedPath,
              hint: "The file doesn't exist. Use writeFile to create it, or check getProjectStructure for existing files.",
            };
          }

          // Read current content
          const { content } = await readFileFromSandbox(sandbox, fullPath);

          // Validate search text exists and is unique
          const occurrences = content.split(search).length - 1;

          if (occurrences === 0) {
            const error = `Search text not found in ${resolvedPath}`;
            recordToolExecution(
              projectId,
              "editFile",
              { path: resolvedPath, search },
              undefined,
              false,
              error,
              startTime,
            );
            return { success: false, error, path: resolvedPath };
          }

          if (occurrences > 1) {
            const error = `Search text appears ${occurrences} times in ${resolvedPath}. It must be unique. Add more context to your search string.`;
            recordToolExecution(
              projectId,
              "editFile",
              { path: resolvedPath, search },
              undefined,
              false,
              error,
              startTime,
            );
            return { success: false, error, path: resolvedPath };
          }

          // Perform replacement
          const newContent = content.replace(search, replace);
          await writeFileToSandbox(sandbox, fullPath, newContent);

          // Update context
          updateFileInContext(projectId, resolvedPath, newContent, "updated");

          // Persist just this file to the database (incremental, not full sync)
          console.log(
            `[editFile] Persisting file ${resolvedPath} to database for project ${projectId}`,
          );
          try {
            const { getProjectRepository } = await import("@/lib/db/repositories");
            const repo = getProjectRepository();
            await repo.saveSingleFile(projectId, resolvedPath, newContent);
            console.log(
              `[editFile] File persisted: ${resolvedPath}`,
            );
          } catch (syncError) {
            console.warn("[editFile] Failed to persist file to database:", syncError);
            // Don't fail the tool execution if persistence fails - the file is still written to sandbox
          }

          // Get project name from context for frontend parser
          const projectName =
            getAgentContext(projectId).projectName || "project";

          const result = {
            success: true as const,
            path: resolvedPath,
            linesChanged:
              Math.abs(
                search.split("\n").length - replace.split("\n").length,
              ) || 1,
            filesReady: false,
            projectName,
            message: `Successfully edited ${filePath}`,
          };

          recordToolExecution(
            projectId,
            "editFile",
            { path: resolvedPath, search },
            result,
            true,
            undefined,
            startTime,
          );

          return result;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Edit failed";
          recordToolExecution(
            projectId,
            "editFile",
            { path: filePath, search },
            undefined,
            false,
            errorMsg,
            startTime,
          );
          return createErrorResult(error, { path: filePath });
        }
      },
    }),
  };
}
