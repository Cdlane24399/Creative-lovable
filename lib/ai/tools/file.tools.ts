/**
 * File Tools - File operation tools for the web builder agent
 *
 * This module contains tools for reading, writing, and editing files
 * in the E2B sandbox environment. These tools provide the foundation
 * for file manipulation during project development.
 *
 * @see {@link ../web-builder-agent.ts} for additional tool implementations
 */

import { tool } from "ai"
import { z } from "zod"
import { filePathSchema } from "../schemas/tool-schemas"
import {
  getAgentContext,
  updateFileInContext,
  recordToolExecution,
} from "../agent-context"
import {
  createSandbox,
  executeCommand,
  writeFile as writeFileToSandbox,
  readFile as readFileFromSandbox,
} from "@/lib/e2b/sandbox"
import { createErrorResult } from "../utils"

/**
 * Creates file operation tools for managing files in the project sandbox.
 * These tools enable reading, writing, and editing files during development.
 *
 * @param projectId - The unique identifier for the project
 * @returns Object containing writeFile, readFile, and editFile tools
 */
export function createFileTools(projectId: string) {
  const ctx = () => getAgentContext(projectId)

  return {
    /**
     * Writes content to a file in the project sandbox.
     * Creates parent directories automatically.
     */
    writeFile: tool({
      description:
        "Write content to a file in the project sandbox. Creates parent directories " +
        "if they don't exist. Use for creating new files or completely replacing existing ones.",
      inputSchema: z.object({
        path: filePathSchema,
        content: z.string().describe("Complete file content to write"),
      }),
      execute: async ({ path: filePath, content }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${context.projectName || "project"}`
        const fullPath = `${projectDir}/${filePath}`

        try {
          const sandbox = await createSandbox(projectId)

          // Ensure parent directory exists
          const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
          await executeCommand(sandbox, `mkdir -p "${dir}"`)

          await writeFileToSandbox(sandbox, fullPath, content)

          // Track file state
          const isNew = !context.files.has(filePath)
          updateFileInContext(projectId, filePath, content, isNew ? "created" : "updated")

          const result = {
            success: true as const,
            path: filePath,
            action: isNew ? ("created" as const) : ("updated" as const),
            bytes: content.length,
            message: `File ${isNew ? "created" : "updated"}: ${filePath}`,
          }

          recordToolExecution(projectId, "writeFile", { path: filePath }, result, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Write failed"
          recordToolExecution(projectId, "writeFile", { path: filePath }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { path: filePath })
        }
      },
    }),

    /**
     * Reads content from a file in the project sandbox.
     * Caches content in context for future reference.
     */
    readFile: tool({
      description:
        "Read content from a file in the project sandbox. Use to examine existing " +
        "code before making edits or to understand project structure.",
      inputSchema: z.object({
        path: filePathSchema,
      }),
      execute: async ({ path: filePath }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${context.projectName || "project"}`
        const fullPath = `${projectDir}/${filePath}`

        try {
          const sandbox = await createSandbox(projectId)
          const result = await readFileFromSandbox(sandbox, fullPath)

          // Cache in context
          updateFileInContext(projectId, filePath, result.content)

          const successResult = {
            success: true as const,
            path: filePath,
            content: result.content,
            length: result.content.length,
            lines: result.content.split("\n").length,
          }

          recordToolExecution(
            projectId,
            "readFile",
            { path: filePath },
            { success: true, length: result.content.length },
            true,
            undefined,
            startTime
          )

          return successResult
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Read failed"
          recordToolExecution(projectId, "readFile", { path: filePath }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { path: filePath })
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
          .describe("Exact text to find in the file - must be unique within the file"),
        replace: z.string().describe("New text to replace the search text with"),
      }),
      execute: async ({ path: filePath, search, replace }) => {
        const startTime = new Date()
        const context = ctx()
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID
        const projectDir = hasTemplate ? "/home/user/project" : `/home/user/${context.projectName || "project"}`
        const fullPath = `${projectDir}/${filePath}`

        try {
          const sandbox = await createSandbox(projectId)

          // Read current content
          const { content } = await readFileFromSandbox(sandbox, fullPath)

          // Validate search text exists and is unique
          const occurrences = content.split(search).length - 1

          if (occurrences === 0) {
            const error = `Search text not found in ${filePath}`
            recordToolExecution(projectId, "editFile", { path: filePath, search }, undefined, false, error, startTime)
            return { success: false, error, path: filePath }
          }

          if (occurrences > 1) {
            const error = `Search text appears ${occurrences} times in ${filePath}. It must be unique. Add more context to your search string.`
            recordToolExecution(projectId, "editFile", { path: filePath, search }, undefined, false, error, startTime)
            return { success: false, error, path: filePath }
          }

          // Perform replacement
          const newContent = content.replace(search, replace)
          await writeFileToSandbox(sandbox, fullPath, newContent)

          // Update context
          updateFileInContext(projectId, filePath, newContent, "updated")

          const result = {
            success: true as const,
            path: filePath,
            linesChanged: Math.abs(search.split("\n").length - replace.split("\n").length) || 1,
            message: `Successfully edited ${filePath}`,
          }

          recordToolExecution(projectId, "editFile", { path: filePath, search }, result, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Edit failed"
          recordToolExecution(projectId, "editFile", { path: filePath, search }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { path: filePath })
        }
      },
    }),
  }
}
