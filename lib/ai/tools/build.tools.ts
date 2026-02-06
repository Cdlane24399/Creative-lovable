import { tool } from "ai"
import { z } from "zod"
import {
  getAgentContext,
  addDependency,
  updateBuildStatus,
  setProjectInfo,
  recordToolExecution,
} from "../agent-context"
import {
  executeCommand,
  killBackgroundProcess,
  startBackgroundProcess,
} from "@/lib/e2b/sandbox"
import { getCurrentSandbox } from "@/lib/e2b/sandbox-provider"
import { createErrorResult, formatDuration } from "../utils"

/**
 * Factory function to create build and server management tools.
 * These tools handle command execution, package installation, and build status monitoring.
 *
 * @param projectId - The unique identifier for the project
 * @returns Object containing build and server tools
 */
export function createBuildTools(projectId: string) {
  const ctx = () => getAgentContext(projectId)

  return {
    /**
     * Runs a shell command in the sandbox.
     * Automatically tracks pnpm installs for dependency awareness.
     */
    runCommand: tool({
      description:
        "Run a shell command in the sandbox (e.g., pnpm add, pnpm run build). " +
        "Use for any command-line operations. Uses pnpm (not npm) for package management.",
      inputSchema: z.object({
        command: z
          .string()
          .min(1)
          .max(1000)
          .describe("Shell command to execute"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to /home/user/ (defaults to project directory)"),
        timeout: z
          .number()
          .optional()
          .default(60000)
          .describe("Command timeout in milliseconds (default: 60000)"),
      }),
      execute: async ({ command, cwd, timeout }) => {
        const startTime = new Date()
        const projectDir = "/home/user/project"
        const workDir = cwd ? `/home/user/${cwd}` : projectDir
        const fullCommand = `cd "${workDir}" && ${command}`

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox()
          const result = await executeCommand(sandbox, fullCommand, { timeoutMs: timeout })

          // Track pnpm add for dependency awareness
          if ((command.includes("pnpm add") || command.includes("pnpm install")) && result.exitCode === 0) {
            const packageMatch = command.match(/pnpm (?:add|install)\s+(?:-D\s+)?(.+)$/)
            if (packageMatch) {
              const packages = packageMatch[1].split(/\s+/).filter((pkg) => pkg && !pkg.startsWith("-"))
              packages.forEach((pkg) => addDependency(projectId, pkg, "latest"))
            }
          }

          const success = result.exitCode === 0

          recordToolExecution(
            projectId,
            "runCommand",
            { command, cwd },
            { exitCode: result.exitCode },
            success,
            success ? undefined : result.stderr,
            startTime
          )

          return {
            success,
            command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            duration: formatDuration(startTime),
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Command failed"
          recordToolExecution(projectId, "runCommand", { command }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { command })
        }
      },
    }),

    /**
     * Installs npm packages in the current project.
     * Tracks installed packages in context.
     */
    installPackage: tool({
      description:
        "Install npm packages in the current project. Automatically tracks " +
        "installed packages for context awareness.",
      inputSchema: z.object({
        packages: z
          .array(z.string().min(1))
          .min(1)
          .describe("Package names to install (e.g., ['lodash', 'axios'])"),
        dev: z
          .boolean()
          .optional()
          .default(false)
          .describe("Install as dev dependency (--save-dev)"),
      }),
      execute: async ({ packages, dev }) => {
        const startTime = new Date()
        const projectDir = "/home/user/project"
        const pnpmFlag = dev ? "-D" : ""

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox()

          // Stop dev server to release lock on pnpm-lock.yaml
          // Turbopack holds the lockfile while running, causing pnpm add to fail
          const wasRunning = await killBackgroundProcess(projectId)
          if (wasRunning) {
            console.log("[installPackage] Stopped dev server for package install")
          }

          const packageList = packages.join(" ")
          const result = await executeCommand(
            sandbox,
            `cd "${projectDir}" && pnpm add ${pnpmFlag} ${packageList}`.trim(),
            { timeoutMs: 120_000 } // 2 minutes for package install
          )

          const success = result.exitCode === 0

          // Restart dev server if it was running
          if (wasRunning) {
            await startBackgroundProcess(sandbox, "pnpm run dev > /tmp/server.log 2>&1", {
              workingDir: projectDir,
              projectId,
            })
            console.log("[installPackage] Restarted dev server after package install")
          }

          if (success) {
            packages.forEach((pkg) => addDependency(projectId, pkg, "latest"))
          }

          recordToolExecution(
            projectId,
            "installPackage",
            { packages, dev },
            { success },
            success,
            success ? undefined : result.stderr,
            startTime
          )

          return {
            success,
            packages,
            dev,
            message: success ? `Installed: ${packages.join(", ")}` : `Failed: ${result.stderr}`,
            duration: formatDuration(startTime),
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Installation failed"
          recordToolExecution(projectId, "installPackage", { packages }, undefined, false, errorMsg, startTime)
          return createErrorResult(error, { packages })
        }
      },
    }),

    /**
     * Checks build/compile status and retrieves errors from dev server logs.
     * Use to diagnose build issues.
     */
    getBuildStatus: tool({
      description:
        "Check build/compile status and get errors from dev server logs. " +
        "Use this to diagnose issues after making changes or when the preview shows errors.",
      inputSchema: z.object({
        logLines: z
          .number()
          .optional()
          .default(100)
          .describe("Number of log lines to retrieve (default: 100)"),
      }),
      execute: async ({ logLines }) => {
        const startTime = new Date()

        try {
          // Get sandbox from infrastructure context
          const sandbox = getCurrentSandbox()
          const logsResult = await executeCommand(
            sandbox,
            `tail -n ${logLines} /tmp/server.log 2>/dev/null || echo "No server logs found"`
          )
          const logs = logsResult.stdout

          // Parse for errors and warnings with better regex
          const errorPatterns = [/Error:/i, /\berror\b/i, /ERROR/, /Failed to compile/i, /Module not found/i]
          const warningPatterns = [/\bwarn(ing)?\b/i, /Warning:/i]

          const lines = logs.split("\n")

          const errorLines = lines.filter((line) => errorPatterns.some((pattern) => pattern.test(line)))
          const warningLines = lines.filter(
            (line) => warningPatterns.some((pattern) => pattern.test(line)) && !errorPatterns.some((p) => p.test(line))
          )

          const hasErrors = errorLines.length > 0
          const hasWarnings = warningLines.length > 0

          // Update context
          updateBuildStatus(projectId, {
            hasErrors,
            hasWarnings,
            errors: errorLines.slice(0, 5),
            warnings: warningLines.slice(0, 3),
          })

          const result = {
            success: true,
            hasErrors,
            hasWarnings,
            errorCount: errorLines.length,
            warningCount: warningLines.length,
            errors: errorLines.slice(0, 5),
            warnings: warningLines.slice(0, 3),
            recentLogs: logs.slice(-2000),
            recommendation: hasErrors
              ? "PRIORITY: Fix build errors before proceeding. Check the error messages above."
              : hasWarnings
                ? "Consider addressing warnings, but they won't block the build."
                : "Build looks healthy. Ready to proceed.",
          }

          recordToolExecution(projectId, "getBuildStatus", {}, { hasErrors, hasWarnings }, true, undefined, startTime)

          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Status check failed"
          recordToolExecution(projectId, "getBuildStatus", {}, undefined, false, errorMsg, startTime)
          return createErrorResult(error)
        }
      },
    }),

    /**
     * @deprecated Dev server is now managed automatically by the frontend.
     * Kept for backward compatibility but should not be called.
     */
    startDevServer: tool({
      description:
        "DEPRECATED: Do not use this tool. The dev server is started automatically " +
        "by the application. Use createWebsite to write files instead.",
      inputSchema: z.object({
        port: z.number().optional().describe("Port number (ignored - server managed automatically)"),
      }),
      execute: async () => {
        const context = ctx()
        const projectName = context.projectName || "project"

        // Just update context - the frontend handles server management
        setProjectInfo(projectId, { projectName, projectDir: `/home/user/${projectName}` })

        return {
          success: true,
          message:
            "Dev server is managed automatically by the application. " +
            "Files are ready - the preview will appear shortly.",
          deprecated: true,
          note: "This tool is deprecated. Use createWebsite to write files instead.",
        }
      },
    }),
  }
}
