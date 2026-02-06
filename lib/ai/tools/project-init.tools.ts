/**
 * Project Initialization Tools - Scaffold new projects from templates
 *
 * This module provides focused tools for initializing new projects
 * without the complexity of the legacy createWebsite god tool.
 */

import { tool } from "ai";
import { z } from "zod";
import { projectNameSchema } from "../schemas/tool-schemas";
import { setProjectInfo, recordToolExecution } from "../agent-context";
import { directoryExists, executeCommand } from "@/lib/e2b/sandbox";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { hasConfiguredTemplate } from "@/lib/e2b/template-config";
import { scaffoldNextProject } from "../helpers";
import { SandboxError } from "../errors/web-builder-errors";

const projectDir = getProjectDir();

/**
 * Creates project initialization tools.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing the initializeProject tool
 */
export function createProjectInitTools(projectId: string) {
  return {
    /**
     * Initialize a new project from a template or scaffold fresh.
     * Creates the sandbox if needed and sets up the basic project structure.
     * Does NOT write any application files - use writeFile or batchWriteFiles for that.
     */
    initializeProject: tool({
      description:
        "Initialize a new Next.js project from a template or fresh scaffold. " +
        "Creates the basic project structure. " +
        "Does NOT create any pages or components - use writeFile or batchWriteFiles after this. " +
        "Use this once at the start of a new project.",
      inputSchema: z.object({
        name: projectNameSchema,
        description: z
          .string()
          .min(1)
          .max(500)
          .describe("Description of the project - used for metadata"),
        useTemplate: z
          .boolean()
          .optional()
          .default(true)
          .describe("Use E2B template for faster setup (recommended)"),
      }),

      execute: async ({ name, description, useTemplate }) => {
        const startTime = new Date();
        const hasTemplate = useTemplate && hasConfiguredTemplate();

        console.log(
          `[initializeProject] Starting: ${name}, template: ${hasTemplate}`,
        );

        try {
          // Get sandbox from infrastructure context (created by withSandbox)
          const sandbox = getCurrentSandbox();
          console.log(
            `[initializeProject] Using sandbox: ${sandbox.sandboxId}`,
          );

          // Check if project already exists
          const projectExists = await directoryExists(sandbox, projectDir);

          if (projectExists) {
            // Just update context for existing project
            setProjectInfo(projectId, {
              projectName: name,
              projectDir,
            });

            const result = {
              success: true as const,
              projectName: name,
              projectDir,
              isNewProject: false,
              message: `Project already exists at ${projectDir}`,
            };

            recordToolExecution(
              projectId,
              "initializeProject",
              { name },
              result,
              true,
              undefined,
              startTime,
            );
            return result;
          }

          // Scaffold new project (skip if using template - template already has structure)
          if (!hasTemplate) {
            console.log(
              `[initializeProject] Scaffolding fresh project (no template)`,
            );
            await scaffoldNextProject(sandbox, projectDir, name, description);
          } else {
            console.log(
              `[initializeProject] Using E2B template - no scaffold needed`,
            );
          }

          // Update context
          setProjectInfo(projectId, {
            projectName: name,
            projectDir: projectDir,
          });

          const totalTime = Date.now() - startTime.getTime();

          const result = {
            success: true as const,
            projectName: name,
            projectDir: projectDir,
            isNewProject: true,
            usedTemplate: hasTemplate,
            setupTimeMs: totalTime,
            filesReady: false, // Don't signal filesReady here — wait for batchWriteFiles/syncProject
            message: hasTemplate
              ? `Project initialized from template in ${(totalTime / 1000).toFixed(1)}s`
              : `Project scaffolded in ${(totalTime / 1000).toFixed(1)}s`,
          };

          recordToolExecution(
            projectId,
            "initializeProject",
            { name, useTemplate },
            result,
            true,
            undefined,
            startTime,
          );
          return result;
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Failed to initialize project";
          recordToolExecution(
            projectId,
            "initializeProject",
            { name },
            undefined,
            false,
            errorMsg,
            startTime,
          );

          return {
            success: false as const,
            error: errorMsg,
            message: "Failed to initialize project",
            filesReady: false,
          };
        }
      },
    }),
  };
}
