/**
 * Project Tools - Project management tools for the web builder agent
 *
 * This module contains tools for understanding and managing project structure
 * in E2B sandboxes. These tools help the AI agent comprehend existing codebases
 * and make informed decisions about file modifications.
 */

import { tool } from "ai";
import { z } from "zod";
import { MAX_PROJECT_FILES, MAX_FILE_CONTENTS } from "../schemas/tool-schemas";
import {
  getAgentContext,
  setProjectInfo,
  updateFileInContext,
  recordToolExecution,
} from "../agent-context";
import {
  executeCommand,
  readFile as readFileFromSandbox,
} from "@/lib/e2b/sandbox";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { createErrorResult } from "../utils";
import { categorizeFiles } from "../helpers";

/**
 * Creates project management tools for a specific project context.
 *
 * @param projectId - The unique identifier for the project/sandbox
 * @returns Object containing project management tools
 */
export function createProjectTools(projectId: string) {
  const ctx = () => getAgentContext(projectId);

  return {
    /**
     * Gets the file tree and optionally key file contents.
     * Use to understand existing project structure.
     */
    getProjectStructure: tool({
      description:
        "Get the file tree and optionally key file contents of the current project. " +
        "Use to understand existing project structure before making changes.",
      inputSchema: z.object({
        includeContents: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include file contents for key files (up to 10 files)"),
      }),
      execute: async ({ includeContents }) => {
        const startTime = new Date();
        const context = ctx();
        const projectName = context.projectName || "project";
        const projectDir = getProjectDir();

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox();

          // Ensure project directory exists before scanning
          await executeCommand(sandbox, `mkdir -p "${projectDir}"`);

          // Get file tree - exclude node_modules, .next, and lockfiles
          const treeResult = await executeCommand(
            sandbox,
            `cd "${projectDir}" && find . -type f \\( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" -o -name "*.css" -o -name "*.json" \\) ! -name "package-lock.json" ! -name "pnpm-lock.yaml" ! -name "yarn.lock" ! -name "bun.lock" ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/.git/*" ! -path "*/.bun/*" ! -path "*/.cache/*" ! -path "*/.npm/*" ! -path "*/.local/*" ! -path "*/.pnpm-store/*" ! -path "*/.yarn/*" ! -path "*/.vercel/*" 2>/dev/null | sort | head -${MAX_PROJECT_FILES}`,
          );

          const files = treeResult.stdout
            .split("\n")
            .filter(Boolean)
            .map((f) => f.replace("./", ""));

          // Update context with project info
          setProjectInfo(projectId, { projectName, projectDir });

          let contents: Record<string, string> | undefined;

          // Files to never include full contents for (lockfiles are huge, waste tokens)
          const LOCKFILE_NAMES = new Set([
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
            "bun.lock",
          ]);
          const shouldExcludeContent = (file: string) =>
            LOCKFILE_NAMES.has(file) || file.endsWith(".lock");

          if (includeContents && files.length > 0) {
            contents = {};

            // Read contents in parallel for better performance.
            // Skip lockfiles and generated files — they waste tokens and add no value.
            const filesToRead = files
              .filter((f) => !shouldExcludeContent(f))
              .slice(0, MAX_FILE_CONTENTS);
            const readPromises = filesToRead.map(async (file) => {
              try {
                const { content } = await readFileFromSandbox(
                  sandbox,
                  `${projectDir}/${file}`,
                );
                updateFileInContext(projectId, file, content);
                return { file, content };
              } catch {
                return { file, content: null };
              }
            });

            const results = await Promise.all(readPromises);
            for (const { file, content } of results) {
              if (content) {
                contents[file] = content;
              }
            }
          }

          const result = {
            success: true as const,
            projectName,
            projectDir,
            files,
            fileCount: files.length,
            contents,
            filesByType: categorizeFiles(files),
          };

          recordToolExecution(
            projectId,
            "getProjectStructure",
            { projectName },
            { fileCount: files.length },
            true,
            undefined,
            startTime,
          );

          return result;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Failed to scan project";
          recordToolExecution(
            projectId,
            "getProjectStructure",
            { projectName },
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
