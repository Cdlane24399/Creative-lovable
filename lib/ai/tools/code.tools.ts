/**
 * Code Tools - Code execution tools for the web builder agent
 *
 * This module contains tools for executing code in secure sandbox environments.
 * Supports Python, JavaScript, and TypeScript execution with optimized handling
 * for different languages and execution modes.
 *
 * @see {@link ../web-builder-agent.ts} for additional tool implementations
 */

import { tool } from "ai";
import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "../schemas/tool-schemas";
import { recordToolExecution } from "../agent-context";
import {
  getCodeInterpreterSandbox,
  executeCode as executeCodeInSandbox,
  type CodeLanguage,
} from "@/lib/e2b/sandbox";
import { getSandboxLazy } from "@/lib/e2b/sandbox-provider";
import { createErrorResult, formatDuration } from "../utils";

/**
 * Creates code execution tools for running code in the project sandbox.
 * These tools enable executing Python, JavaScript, and TypeScript code
 * in a secure sandbox environment.
 *
 * @param projectId - The unique identifier for the project
 * @returns Object containing executeCode tool
 */
export function createCodeTools(projectId: string) {
  return {
    /**
     * Executes Python, JavaScript, or TypeScript code in a secure sandbox.
     * Python code uses optimized Code Interpreter for better output handling.
     */
    executeCode: tool({
      description:
        "Execute Python, JavaScript, or TypeScript code in a secure environment. " +
        "Python code uses optimized Code Interpreter for better output handling.",
      inputSchema: z.object({
        code: z.string().min(1).describe("Code to execute"),
        language: z
          .enum(SUPPORTED_LANGUAGES)
          .optional()
          .default("python")
          .describe("Programming language (default: python)"),
        useCodeInterpreter: z
          .boolean()
          .optional()
          .default(true)
          .describe("Use Code Interpreter for Python (better output handling)"),
      }),
      execute: async ({
        code,
        language = "python",
        useCodeInterpreter = true,
      }) => {
        const startTime = new Date();

        try {
          // Use Code Interpreter for Python if available and enabled
          // For non-Python or when CodeInterpreter is disabled, use the shared sandbox context
          const sandbox =
            useCodeInterpreter && language === "python"
              ? await getCodeInterpreterSandbox(projectId)
              : await getSandboxLazy(projectId);

          const result = await executeCodeInSandbox(
            sandbox,
            code,
            language as CodeLanguage,
          );

          const output = [...result.logs.stdout, ...result.logs.stderr].join(
            "\n",
          );
          const success = !result.error;
          const usedCodeInterpreter =
            useCodeInterpreter && language === "python" && "runCode" in sandbox;

          recordToolExecution(
            projectId,
            "executeCode",
            { language, useCodeInterpreter },
            { output, success, usedCodeInterpreter },
            success,
            result.error?.message,
            startTime,
          );

          return {
            success,
            output,
            error: result.error?.message,
            language,
            usedCodeInterpreter,
            results: result.results ?? [],
            duration: formatDuration(startTime),
          };
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Execution failed";
          recordToolExecution(
            projectId,
            "executeCode",
            { language },
            undefined,
            false,
            errorMsg,
            startTime,
          );
          return createErrorResult(error, { language });
        }
      },
    }),
  };
}
