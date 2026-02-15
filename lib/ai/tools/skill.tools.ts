/**
 * Skill Tools - Dynamic Skill Loading for AI Agent
 *
 * This module provides tools for loading and executing Vercel Skills.
 * Skills are npm packages that provide specialized capabilities to agents.
 *
 * Vercel Skills:
 * - npm packages that extend agent capabilities
 * - Loaded dynamically at runtime
 * - Can be used for refactoring, code analysis, UI generation, etc.
 *
 * @see https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem
 */

import { tool } from "ai";
import { z } from "zod";
import { recordToolExecution } from "../agent-context";
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider";

/**
 * Skill configuration type
 */
export interface SkillConfig {
  name: string;
  description: string;
  package?: string;
  command?: string;
  enabled: boolean;
}

/**
 * Pre-configured skills available to the agent
 * These enhance the agent's capabilities for web development
 */
export const AVAILABLE_SKILLS: SkillConfig[] = [
  {
    name: "refactor",
    description: "Refactor code to improve maintainability, readability, and performance",
    command: "npx @agentic/refactor",
    enabled: true,
  },
  {
    name: "dead-code-removal",
    description: "Detect and safely remove unused code across the project",
    command: "npx @agentic/dead-code-removal",
    enabled: true,
  },
];

/**
 * Skill execution result type
 */
export interface SkillResult {
  success: boolean;
  skillName: string;
  output?: string;
  error?: string;
}

/**
 * Creates skill management tools for the web builder agent
 *
 * These tools allow the agent to:
 * - List available skills
 * - Execute skills on the project
 * - Get skill status
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing skill management tools
 */
export function createSkillTools(projectId: string) {
  /**
   * List Available Skills
   *
   * Returns a list of skills that can be used with this agent
   */
  const listSkills = tool({
    description: `List all available skills that can be used to enhance the agent's capabilities.
Skills provide specialized functionality like refactoring, dead code removal, code analysis, etc.`,
    inputSchema: z.object({}),
    execute: async () => {
      recordToolExecution(
        projectId,
        "listSkills",
        {},
        undefined,
        true,
      );

      const skills = AVAILABLE_SKILLS.filter((s) => s.enabled);

      return {
        success: true,
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
        })),
        count: skills.length,
      };
    },
  });

  /**
   * Execute a Skill
   *
   * Runs a specific skill on the current project
   */
  const executeSkill = tool({
    description: `Execute a skill (npm package) to perform specialized operations on the project.
Use this to:
- Run refactoring tools on the codebase
- Execute dead code detection and removal
- Perform code analysis or transformations

The skill will run in the context of the current project.`,
    inputSchema: z.object({
      skillName: z
        .string()
        .describe("The name of the skill to execute"),
      args: z
        .string()
        .optional()
        .describe("Additional arguments to pass to the skill"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Whether to run in dry-run mode (no changes)"),
    }),
    execute: async ({ skillName, args, dryRun }) => {
      recordToolExecution(
        projectId,
        "executeSkill",
        { skillName, args, dryRun },
        undefined,
        true,
      );

      // Find the skill configuration
      const skill = AVAILABLE_SKILLS.find(
        (s) => s.name.toLowerCase() === skillName.toLowerCase() && s.enabled,
      );

      if (!skill) {
        return {
          success: false,
          error: `Skill "${skillName}" not found or not enabled`,
          availableSkills: AVAILABLE_SKILLS.filter((s) => s.enabled).map(
            (s) => s.name,
          ),
        };
      }

      // Get the current sandbox to execute the skill
      const sandbox = getCurrentSandbox();

      if (!sandbox) {
        return {
          success: false,
          error: "No sandbox available to execute skill",
        };
      }

      try {
        // Build the command
        let command = skill.command || `npx @agentic/${skillName}`;
        if (args) {
          command += ` ${args}`;
        }
        if (dryRun) {
          command += " --dry-run";
        }

        // Execute the skill command in the sandbox
        const result = await sandbox.commands.run(command, {
          timeoutMs: 120000, // 2 minute timeout for skill execution
        });

        return {
          success: result.exitCode === 0,
          skillName: skill.name,
          output: result.stdout,
          error: result.stderr || undefined,
          exitCode: result.exitCode,
        };
      } catch (error) {
        return {
          success: false,
          skillName: skill.name,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  /**
   * Refactor Code
   *
   * Convenience tool for running the refactor skill
   */
  const refactorCode = tool({
    description: `Refactor code in the project to improve:
- Code readability and maintainability
- Performance optimizations
- Best practices adherence
- Design pattern usage

This is a convenience wrapper around the refactor skill.`,
    inputSchema: z.object({
      target: z
        .string()
        .optional()
        .describe("Specific file or directory to refactor"),
      pattern: z
        .string()
        .optional()
        .describe("Refactoring pattern to apply (e.g., 'extract-function', 'rename')"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Whether to run in dry-run mode"),
    }),
    execute: async ({ target, pattern, dryRun }) => {
      recordToolExecution(
        projectId,
        "refactorCode",
        { target, pattern, dryRun },
        undefined,
        true,
      );

      const sandbox = getCurrentSandbox();

      if (!sandbox) {
        return {
          success: false,
          error: "No sandbox available to execute refactoring",
        };
      }

      try {
        let command = "npx @agentic/refactor";
        if (target) {
          command += ` ${target}`;
        }
        if (pattern) {
          command += ` --pattern ${pattern}`;
        }
        if (dryRun) {
          command += " --dry-run";
        }

        const result = await sandbox.commands.run(command, {
          timeoutMs: 120000,
        });

        return {
          success: result.exitCode === 0,
          output: result.stdout,
          error: result.stderr || undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  /**
   * Remove Dead Code
   *
   * Convenience tool for running the dead-code-removal skill
   */
  const removeDeadCode = tool({
    description: `Detect and remove dead code from the project:
- Unused imports
- Unused functions and variables
- Unreachable code
- Unused files

This helps keep the codebase clean and reduces bundle size.`,
    inputSchema: z.object({
      target: z
        .string()
        .optional()
        .describe("Specific directory or file to analyze"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Whether to run in dry-run mode (show only)"),
      force: z
        .boolean()
        .optional()
        .describe("Whether to automatically remove without confirmation"),
    }),
    execute: async ({ target, dryRun, force }) => {
      recordToolExecution(
        projectId,
        "removeDeadCode",
        { target, dryRun, force },
        undefined,
        true,
      );

      const sandbox = getCurrentSandbox();

      if (!sandbox) {
        return {
          success: false,
          error: "No sandbox available to execute dead code removal",
        };
      }

      try {
        let command = "npx @agentic/dead-code-removal";
        if (target) {
          command += ` ${target}`;
        }
        if (dryRun) {
          command += " --dry-run";
        }
        if (force) {
          command += " --force";
        }

        const result = await sandbox.commands.run(command, {
          timeoutMs: 120000,
        });

        return {
          success: result.exitCode === 0,
          output: result.stdout,
          error: result.stderr || undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

  return {
    listSkills,
    executeSkill,
    refactorCode,
    removeDeadCode,
  };
}
