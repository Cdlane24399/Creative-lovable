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
} from "@/lib/e2b/sandbox";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { quickSyncToDatabaseWithRetry } from "@/lib/e2b/sync-manager";
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

  return {
    /**
     * Writes content to a file in the project.
     * Creates parent directories automatically.
     */
    writeFile: tool({
      description:
        "Write content to a file in the project. Creates parent directories " +
        "if they don't exist. Use for creating new files or completely replacing existing ones.",
      inputSchema: z.object({
        path: filePathSchema,
        content: z.string().describe("Complete file content to write"),
      }),
      execute: async ({ path: filePath, content }) => {
        const startTime = new Date();
        const context = ctx();
        const projectDir = "/home/user/project";
        const fullPath = `${projectDir}/${filePath}`;

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();

          // Ensure parent directory exists
          const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
          await executeCommand(sandbox, `mkdir -p "${dir}"`);

          await writeFileToSandbox(sandbox, fullPath, content);

          // Track file state
          const isNew = !context.files.has(filePath);
          updateFileInContext(
            projectId,
            filePath,
            content,
            isNew ? "created" : "updated",
          );

          // Sync to database to persist the file
          console.log(
            `[writeFile] Syncing file ${filePath} to database for project ${projectId}`,
          );
          try {
            const syncResult = await quickSyncToDatabaseWithRetry(
              sandbox,
              projectId,
              projectDir,
            );
            console.log(
              `[writeFile] Sync completed: ${syncResult.filesWritten} files synced, success: ${syncResult.success}`,
            );
          } catch (syncError) {
            console.warn("[writeFile] Failed to sync to database:", syncError);
            // Don't fail the tool execution if sync fails - the file is still written to sandbox
          }

          // Get project name from context for frontend parser
          const projectName =
            getAgentContext(projectId).projectName || "project";

          const result = {
            success: true as const,
            path: filePath,
            action: isNew ? ("created" as const) : ("updated" as const),
            bytes: content.length,
            filesReady: true,
            projectName,
            message: `File ${isNew ? "created" : "updated"}: ${filePath}`,
          };

          recordToolExecution(
            projectId,
            "writeFile",
            { path: filePath },
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
        const projectDir = "/home/user/project";
        const fullPath = `${projectDir}/${filePath}`;

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();

          // Check if file exists first to provide a clearer error message
          const exists = await fileExists(sandbox, fullPath);
          if (!exists) {
            const error = `File not found: ${filePath}. The file may not have been created yet. Use getProjectStructure to see what files exist.`;
            recordToolExecution(
              projectId,
              "readFile",
              { path: filePath },
              undefined,
              false,
              error,
              startTime,
            );
            return {
              success: false as const,
              error,
              path: filePath,
              hint: "Use getProjectStructure to see what files currently exist in the project.",
            };
          }

          const result = await readFileFromSandbox(sandbox, fullPath);

          // Cache in context
          updateFileInContext(projectId, filePath, result.content);

          const successResult = {
            success: true as const,
            path: filePath,
            content: result.content,
            length: result.content.length,
            lines: result.content.split("\n").length,
          };

          recordToolExecution(
            projectId,
            "readFile",
            { path: filePath },
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
        const projectDir = "/home/user/project";
        const fullPath = `${projectDir}/${filePath}`;

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();

          // Check if file exists first
          const exists = await fileExists(sandbox, fullPath);
          if (!exists) {
            const error = `Cannot edit: file not found at ${filePath}. Use writeFile to create it first, or use getProjectStructure to verify existing files.`;
            recordToolExecution(
              projectId,
              "editFile",
              { path: filePath, search },
              undefined,
              false,
              error,
              startTime,
            );
            return {
              success: false as const,
              error,
              path: filePath,
              hint: "The file doesn't exist. Use writeFile to create it, or check getProjectStructure for existing files.",
            };
          }

          // Read current content
          const { content } = await readFileFromSandbox(sandbox, fullPath);

          // Validate search text exists and is unique
          const occurrences = content.split(search).length - 1;

          if (occurrences === 0) {
            const error = `Search text not found in ${filePath}`;
            recordToolExecution(
              projectId,
              "editFile",
              { path: filePath, search },
              undefined,
              false,
              error,
              startTime,
            );
            return { success: false, error, path: filePath };
          }

          if (occurrences > 1) {
            const error = `Search text appears ${occurrences} times in ${filePath}. It must be unique. Add more context to your search string.`;
            recordToolExecution(
              projectId,
              "editFile",
              { path: filePath, search },
              undefined,
              false,
              error,
              startTime,
            );
            return { success: false, error, path: filePath };
          }

          // Perform replacement
          const newContent = content.replace(search, replace);
          await writeFileToSandbox(sandbox, fullPath, newContent);

          // Update context
          updateFileInContext(projectId, filePath, newContent, "updated");

          // Sync to database to persist the edit
          console.log(
            `[editFile] Syncing file ${filePath} to database for project ${projectId}`,
          );
          try {
            const syncResult = await quickSyncToDatabaseWithRetry(
              sandbox,
              projectId,
              projectDir,
            );
            console.log(
              `[editFile] Sync completed: ${syncResult.filesWritten} files synced, success: ${syncResult.success}`,
            );
          } catch (syncError) {
            console.warn("[editFile] Failed to sync to database:", syncError);
            // Don't fail the tool execution if sync fails - the file is still written to sandbox
          }

          // Get project name from context for frontend parser
          const projectName =
            getAgentContext(projectId).projectName || "project";

          const result = {
            success: true as const,
            path: filePath,
            linesChanged:
              Math.abs(
                search.split("\n").length - replace.split("\n").length,
              ) || 1,
            filesReady: true,
            projectName,
            message: `Successfully edited ${filePath}`,
          };

          recordToolExecution(
            projectId,
            "editFile",
            { path: filePath, search },
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
