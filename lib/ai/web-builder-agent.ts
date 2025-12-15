/**
 * Web Builder Agent - AI SDK v6 Beta ToolLoopAgent Implementation
 *
 * Provides deep context awareness and intelligent agentic flow for
 * building and iterating on web applications in E2B sandboxes.
 */

import { tool } from "ai"
import { z } from "zod"
import path from "node:path"
import {
  getAgentContext,
  updateFileInContext,
  recordToolExecution,
  updateBuildStatus,
  updateServerState,
  setProjectInfo,
  addDependency,
  setCurrentPlan,
  completeStep,
  generateContextSummary,
  getContextRecommendations,
  type AgentContext,
} from "./agent-context"
import {
  createSandbox,
  getCodeInterpreterSandbox,
  executeCode,
  writeFile as writeFileToSandbox,
  writeFiles as writeFilesToSandbox,
  readFile as readFileFromSandbox,
  executeCommand,
  getHostUrl,
  startBackgroundProcess,
  getSandboxStats,
  type CodeLanguage,
} from "@/lib/e2b/sandbox"

// Types for step state tracking
export interface StepState {
  stepIndex: number
  lastToolName?: string
  lastToolSuccess?: boolean
  errorCount: number
  buildErrors: string[]
  serverRunning: boolean
}

// Default project ID for sandbox
const DEFAULT_PROJECT_ID = "default"

function normalizeSandboxRelativePath(rawPath: string, stripPrefix?: string) {
  const raw = rawPath.trim().replaceAll("\\", "/")
  let cleaned = raw.replace(/^\/+/, "").replace(/^\.\//, "")

  if (stripPrefix && cleaned.startsWith(stripPrefix)) {
    cleaned = cleaned.slice(stripPrefix.length)
  }

  // Agents sometimes send paths like "app/page.tsx" even though we already write into /app
  if (cleaned.startsWith("app/")) cleaned = cleaned.slice("app/".length)
  if (cleaned.startsWith("components/")) cleaned = cleaned.slice("components/".length)

  const normalized = path.posix.normalize(cleaned)
  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new Error(`Invalid file path: "${rawPath}"`)
  }

  return normalized
}

async function waitForNextDevServerFromLogs(
  sandbox: any,
  {
    maxWaitMs,
    fallbackPort,
  }: {
    maxWaitMs: number
    fallbackPort: number
  }
): Promise<{ port: number; logTail: string }> {
  const pollMs = 2_000
  const maxPolls = Math.ceil(maxWaitMs / pollMs)

  let lastLogTail = ""
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollMs))

    const log = await executeCommand(sandbox, `tail -n 120 /tmp/server.log 2>/dev/null || echo "no server log"`)
    lastLogTail = log.stdout || ""

    // Next.js prints something like:
    // - Local:         http://localhost:3000
    // Sometimes port changes automatically if 3000 is occupied.
    const match = lastLogTail.match(/http:\/\/localhost:(\d+)/)
    const detectedPort = match ? Number(match[1]) : fallbackPort

    // Check readiness by hitting the root URL.
    // 2xx/3xx indicates the server is reachable.
    const status = await executeCommand(
      sandbox,
      `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${detectedPort} || echo "000"`
    )
    const code = (status.stdout || "").trim()
    const ready = code.length === 3 && (code.startsWith("2") || code.startsWith("3"))
    if (ready) {
      return { port: detectedPort, logTail: lastLogTail }
    }
  }

  return { port: fallbackPort, logTail: lastLogTail }
}

/**
 * Create context-aware tools for the agent.
 * Each tool updates the AgentContext after execution.
 */
export function createContextAwareTools(projectId: string) {
  const ctx = () => getAgentContext(projectId)

  return {
    // ==================== PLANNING TOOLS ====================

    planChanges: tool({
      description: "Create a detailed plan for implementing a feature or making changes. Use this FIRST before starting complex tasks to break them into steps.",
      inputSchema: z.object({
        goal: z.string().describe("The overall goal or feature to implement"),
        steps: z.array(z.string()).describe("Ordered list of steps to accomplish the goal"),
      }),
      execute: async ({ goal, steps }) => {
        const startTime = new Date()
        try {
          setCurrentPlan(projectId, steps)
          setProjectInfo(projectId, { projectName: goal })

          recordToolExecution(projectId, "planChanges", { goal, steps }, { success: true }, true, undefined, startTime)

          return {
            success: true,
            goal,
            totalSteps: steps.length,
            steps,
            message: `Plan created with ${steps.length} steps. Starting execution.`,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Planning failed"
          recordToolExecution(projectId, "planChanges", { goal, steps }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg }
        }
      },
    }),

    markStepComplete: tool({
      description: "Mark a planned step as complete. Use this after finishing each step in the plan.",
      inputSchema: z.object({
        step: z.string().describe("Description of the completed step"),
        notes: z.string().optional().describe("Optional notes about what was done"),
      }),
      execute: async ({ step, notes }) => {
        completeStep(projectId, step)
        const context = ctx()
        const progress = context.currentPlan
          ? `${context.completedSteps.length}/${context.currentPlan.length}`
          : "N/A"

        return {
          success: true,
          completedStep: step,
          progress,
          remainingSteps: context.currentPlan?.slice(context.completedSteps.length) || [],
          notes,
        }
      },
    }),

    // ==================== STATE AWARENESS TOOLS ====================

    analyzeProjectState: tool({
      description: "Analyze the current state of the project including files, build status, server state, and recent errors. Use this to understand what's happening before making decisions.",
      inputSchema: z.object({
        includeFileContents: z.boolean().optional().describe("Include content of recently modified files"),
      }),
      execute: async ({ includeFileContents }) => {
        const startTime = new Date()
        try {
          const context = ctx()
          const summary = generateContextSummary(projectId)
          const recommendations = getContextRecommendations(projectId)

          const result: Record<string, unknown> = {
            summary,
            recommendations,
            filesTracked: context.files.size,
            dependenciesTracked: context.dependencies.size,
            buildStatus: context.buildStatus,
            serverState: context.serverState,
            recentErrors: context.errorHistory.slice(-5),
            planProgress: context.currentPlan ? {
              total: context.currentPlan.length,
              completed: context.completedSteps.length,
              nextStep: context.currentPlan[context.completedSteps.length],
            } : null,
          }

          if (includeFileContents && context.files.size > 0) {
            const recentFiles: Record<string, string> = {}
            const entries = Array.from(context.files.entries()).slice(-5)
            for (const [path, info] of entries) {
              if (info.content) {
                recentFiles[path] = info.content.slice(0, 1000) // First 1KB
              }
            }
            result.recentFileContents = recentFiles
          }

          recordToolExecution(projectId, "analyzeProjectState", { includeFileContents }, result, true, undefined, startTime)
          return result
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Analysis failed"
          recordToolExecution(projectId, "analyzeProjectState", { includeFileContents }, undefined, false, errorMsg, startTime)
          return { error: errorMsg }
        }
      },
    }),

    // ==================== FILE OPERATIONS ====================

    writeFile: tool({
      description: "Write content to a file in the project sandbox. Automatically tracks the file in context.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to project root (e.g., 'app/page.tsx')"),
        content: z.string().describe("File content to write"),
        projectName: z.string().optional().describe("Project name in /home/user/. Defaults to current project."),
      }),
      execute: async ({ path, content, projectName }) => {
        const startTime = new Date()
        const context = ctx()
        const actualProjectName = projectName || context.projectName || "project"
        const fullPath = `/home/user/${actualProjectName}/${path}`

        try {
          const sandbox = await createSandbox(projectId)

          // Ensure directory exists
          const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
          await executeCommand(sandbox, `mkdir -p ${dir}`)

          await writeFileToSandbox(sandbox, fullPath, content)

          // Track in context
          const isNew = !context.files.has(path)
          updateFileInContext(projectId, path, content, isNew ? "created" : "updated")

          recordToolExecution(projectId, "writeFile", { path, projectName }, { success: true, path }, true, undefined, startTime)

          return {
            success: true,
            path,
            action: isNew ? "created" : "updated",
            message: `File ${isNew ? "created" : "updated"}: ${path}`,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Write failed"
          recordToolExecution(projectId, "writeFile", { path, projectName }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg, path }
        }
      },
    }),

    readFile: tool({
      description: "Read content from a file in the project sandbox.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to project root"),
        projectName: z.string().optional().describe("Project name in /home/user/"),
      }),
      execute: async ({ path, projectName }) => {
        const startTime = new Date()
        const context = ctx()
        const actualProjectName = projectName || context.projectName || "project"
        const fullPath = `/home/user/${actualProjectName}/${path}`

        try {
          const sandbox = await createSandbox(projectId)
          const result = await readFileFromSandbox(sandbox, fullPath)

          // Cache in context
          updateFileInContext(projectId, path, result.content)

          recordToolExecution(projectId, "readFile", { path }, { success: true, length: result.content.length }, true, undefined, startTime)

          return {
            success: true,
            path,
            content: result.content,
            length: result.content.length,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Read failed"
          recordToolExecution(projectId, "readFile", { path }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg, path }
        }
      },
    }),

    editFile: tool({
      description: "Edit specific content in a file using search and replace. Use this for targeted updates instead of rewriting entire files.",
      inputSchema: z.object({
        path: z.string().describe("File path relative to project root"),
        search: z.string().describe("Exact text to find in the file"),
        replace: z.string().describe("New text to replace with"),
        projectName: z.string().optional().describe("Project name in /home/user/"),
      }),
      execute: async ({ path, search, replace, projectName }) => {
        const startTime = new Date()
        const context = ctx()
        const actualProjectName = projectName || context.projectName || "project"
        const fullPath = `/home/user/${actualProjectName}/${path}`

        try {
          const sandbox = await createSandbox(projectId)

          // Read current content
          const { content } = await readFileFromSandbox(sandbox, fullPath)

          if (!content.includes(search)) {
            const error = `Search text not found in ${path}`
            recordToolExecution(projectId, "editFile", { path, search }, undefined, false, error, startTime)
            return { success: false, error }
          }

          const newContent = content.replace(search, replace)
          await writeFileToSandbox(sandbox, fullPath, newContent)

          // Update context
          updateFileInContext(projectId, path, newContent, "updated")

          recordToolExecution(projectId, "editFile", { path, search }, { success: true }, true, undefined, startTime)

          return {
            success: true,
            path,
            linesChanged: search.split("\n").length,
            message: `Successfully edited ${path}`,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Edit failed"
          recordToolExecution(projectId, "editFile", { path, search }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg }
        }
      },
    }),

    // ==================== PROJECT MANAGEMENT ====================

    getProjectStructure: tool({
      description: "Get the file tree and optionally key file contents of a project. Use this to understand existing project structure.",
      inputSchema: z.object({
        projectName: z.string().describe("Project name in /home/user/"),
        includeContents: z.boolean().optional().describe("Include file contents for key files"),
      }),
      execute: async ({ projectName, includeContents }) => {
        const startTime = new Date()
        const projectDir = `/home/user/${projectName}`

        try {
          const sandbox = await createSandbox(projectId)

          // Get file tree
          const treeResult = await executeCommand(sandbox,
            `cd ${projectDir} && find . -type f \\( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" -o -name "*.css" -o -name "*.json" \\) ! -path "*/node_modules/*" ! -path "*/.next/*" | head -50`
          )
          const files = treeResult.stdout.split("\n").filter(Boolean).map(f => f.replace("./", ""))

          // Update context with project info
          setProjectInfo(projectId, { projectName, projectDir })

          let contents: Record<string, string> = {}
          if (includeContents) {
            for (const file of files.slice(0, 10)) {
              try {
                const { content } = await readFileFromSandbox(sandbox, `${projectDir}/${file}`)
                contents[file] = content
                updateFileInContext(projectId, file, content)
              } catch {
                // Skip unreadable files
              }
            }
          }

          recordToolExecution(projectId, "getProjectStructure", { projectName }, { fileCount: files.length }, true, undefined, startTime)

          return {
            success: true,
            projectName,
            files,
            fileCount: files.length,
            contents: includeContents ? contents : undefined,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to scan project"
          recordToolExecution(projectId, "getProjectStructure", { projectName }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg }
        }
      },
    }),

    // ==================== BUILD & SERVER ====================

    runCommand: tool({
      description: "Run a shell command in the sandbox (e.g., npm install, npm run build).",
      inputSchema: z.object({
        command: z.string().describe("Shell command to execute"),
        cwd: z.string().optional().describe("Working directory (relative to /home/user/)"),
      }),
      execute: async ({ command, cwd }) => {
        const startTime = new Date()
        const context = ctx()
        const workDir = cwd ? `/home/user/${cwd}` : (context.projectDir || "/home/user")
        const fullCommand = `cd ${workDir} && ${command}`

        try {
          const sandbox = await createSandbox(projectId)
          const result = await executeCommand(sandbox, fullCommand)

          // Track npm install for dependency awareness
          if (command.includes("npm install") && result.exitCode === 0) {
            const packageMatch = command.match(/npm install\s+(?:--save-dev\s+)?(.+)$/)
            if (packageMatch) {
              const packages = packageMatch[1].split(/\s+/)
              packages.forEach(pkg => {
                if (pkg && !pkg.startsWith("-")) {
                  addDependency(projectId, pkg, "latest")
                }
              })
            }
          }

          const success = result.exitCode === 0
          recordToolExecution(projectId, "runCommand", { command, cwd }, { exitCode: result.exitCode }, success, result.stderr || undefined, startTime)

          return {
            success,
            command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Command failed"
          recordToolExecution(projectId, "runCommand", { command }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg, command }
        }
      },
    }),

    installPackage: tool({
      description: "Install npm packages in the project.",
      inputSchema: z.object({
        packages: z.array(z.string()).describe("Package names to install"),
        projectName: z.string().describe("Project name in /home/user/"),
        dev: z.boolean().optional().describe("Install as dev dependency"),
      }),
      execute: async ({ packages, projectName, dev }) => {
        const startTime = new Date()
        const projectDir = `/home/user/${projectName}`
        const flag = dev ? "--save-dev" : "--save"

        try {
          const sandbox = await createSandbox(projectId)
          const result = await executeCommand(sandbox, `cd ${projectDir} && npm install ${flag} ${packages.join(" ")}`)

          if (result.exitCode === 0) {
            packages.forEach(pkg => addDependency(projectId, pkg, "latest"))
          }

          const success = result.exitCode === 0
          recordToolExecution(projectId, "installPackage", { packages, projectName, dev }, { success }, success, result.stderr || undefined, startTime)

          return {
            success,
            packages,
            message: success ? `Installed: ${packages.join(", ")}` : `Failed: ${result.stderr}`,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Installation failed"
          recordToolExecution(projectId, "installPackage", { packages }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg }
        }
      },
    }),

    getBuildStatus: tool({
      description: "Check build/compile status and get errors from dev server logs. Use this to diagnose issues.",
      inputSchema: z.object({}),
      execute: async () => {
        const startTime = new Date()

        try {
          const sandbox = await createSandbox(projectId)
          const logsResult = await executeCommand(sandbox, 'tail -n 100 /tmp/server.log 2>/dev/null || echo "No logs found"')
          const logs = logsResult.stdout

          // Parse for errors
          const errorLines = logs.split("\n").filter(line =>
            line.includes("Error:") || line.includes("error ") || line.includes("ERROR")
          )
          const warningLines = logs.split("\n").filter(line =>
            line.includes("warn") || line.includes("Warning")
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

          recordToolExecution(projectId, "getBuildStatus", {}, { hasErrors, hasWarnings }, true, undefined, startTime)

          return {
            hasErrors,
            hasWarnings,
            errors: errorLines.slice(0, 5),
            warnings: warningLines.slice(0, 3),
            recentLogs: logs.slice(-2000),
            recommendation: hasErrors
              ? "PRIORITY: Fix build errors before proceeding"
              : hasWarnings
                ? "Consider addressing warnings"
                : "Build looks healthy",
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Status check failed"
          recordToolExecution(projectId, "getBuildStatus", {}, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg }
        }
      },
    }),

    startDevServer: tool({
      description: "Start the Next.js development server. Returns the preview URL when ready.",
      inputSchema: z.object({
        projectName: z.string().describe("Project name in /home/user/"),
        port: z.number().optional().describe("Port number (default: 3000)"),
      }),
      execute: async ({ projectName, port = 3000 }) => {
        const startTime = new Date()
        const projectDir = `/home/user/${projectName}`

        try {
          const sandbox = await createSandbox(projectId)

          await executeCommand(sandbox, `rm -f /tmp/server.log 2>/dev/null || true`)

          // Start server
          await startBackgroundProcess(sandbox, `PORT=${port} npm run dev`, projectDir)

          // Wait for server
          const { port: detectedPort, logTail } = await waitForNextDevServerFromLogs(sandbox, {
            maxWaitMs: 30_000,
            fallbackPort: port,
          })
          // If we never saw a successful curl response, treat it as a failure.
          const statusCheck = await executeCommand(
            sandbox,
            `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${detectedPort} || echo "000"`
          )
          const code = (statusCheck.stdout || "").trim()
          if (!(code.length === 3 && (code.startsWith("2") || code.startsWith("3")))) {
            throw new Error(`Dev server failed to start (expected port ${port}, detected ${detectedPort}). Logs:\n${logTail}`)
          }

          const previewUrl = getHostUrl(sandbox, detectedPort)
          updateServerState(projectId, { isRunning: true, port: detectedPort, url: previewUrl })
          setProjectInfo(projectId, { projectName, projectDir })

          recordToolExecution(projectId, "startDevServer", { projectName, requestedPort: port, detectedPort }, { previewUrl }, true, undefined, startTime)

          return {
            success: true,
            alreadyRunning: false,
            previewUrl,
            port: detectedPort,
            message: `Development server started at ${previewUrl}`,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to start server"
          recordToolExecution(projectId, "startDevServer", { projectName, port }, undefined, false, errorMsg, startTime)
          updateServerState(projectId, { isRunning: false })
          return { success: false, error: errorMsg }
        }
      },
    }),

    // ==================== WEBSITE CREATION ====================

    createWebsite: tool({
      description: "Create or update a complete website with live preview. Use this for building full web applications. Optimized for E2B custom templates.",
      inputSchema: z.object({
        name: z.string().describe("Project name in lowercase with hyphens"),
        description: z.string().describe("Description of the website"),
        pages: z.array(z.object({
          path: z.string().describe("Page path (e.g., 'page.tsx', 'about/page.tsx')"),
          content: z.string().describe("Full React/Next.js page component code"),
          action: z.enum(["create", "update", "delete"]).optional(),
        })).describe("Pages to create/update in the app directory"),
        components: z.array(z.object({
          name: z.string().describe("Component file name"),
          content: z.string().describe("React component code"),
          action: z.enum(["create", "update", "delete"]).optional(),
        })).optional().describe("Optional reusable components"),
      }),
      execute: async ({ name, description, pages, components }) => {
        const startTime = new Date()
        const projectDir = `/home/user/${name}`
        const hasTemplate = !!process.env.E2B_TEMPLATE_ID

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:entry',message:'createWebsite called',data:{name,projectDir,pagesCount:pages.length,hasTemplate,templateId:process.env.E2B_TEMPLATE_ID},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
        // #endregion

        try {
          const sandbox = await createSandbox(projectId)

          const resolveAppDir = async () => {
            // Support both template styles:
            // - app router at /app
            // - app router at /src/app
            const check = await executeCommand(
              sandbox,
              `test -d ${projectDir}/src/app && echo "src/app" || echo "app"`
            )
            const dir = check.stdout.trim()
            return dir === "src/app" ? "src/app" : "app"
          }

          // Check if project exists
          const checkResult = await executeCommand(sandbox, `test -d ${projectDir} && echo "exists"`)
          const projectExists = checkResult.stdout.trim() === "exists"

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:projectCheck',message:'Project existence check',data:{projectDir,projectExists,hasTemplate,checkStdout:checkResult.stdout,checkStderr:checkResult.stderr,checkExitCode:checkResult.exitCode},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
          // #endregion

          // Scaffold new project
          if (!projectExists) {
            if (hasTemplate) {
              // OPTIMIZED: Copy pre-built project from template (60x faster!)
              // Template has a fully configured Next.js project at /home/user/project
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:copyTemplate',message:'Copying pre-built project from template',data:{templateProjectPath:'/home/user/project',targetPath:projectDir},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
              // #endregion

              // Copy the entire pre-built Next.js project from template
              await executeCommand(sandbox, `cp -r /home/user/project ${projectDir}`)

              // Update package.json with project name and description
              const updatePkgCmd = `cd ${projectDir} && node -e "const pkg=require('./package.json');pkg.name='${name}';require('fs').writeFileSync('package.json',JSON.stringify(pkg,null,2))"`
              await executeCommand(sandbox, updatePkgCmd)

              // Update layout.tsx with project metadata
              const appDir = await resolveAppDir()
              const layoutContent = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${name}",
  description: "${description}",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`
              await writeFileToSandbox(sandbox, `${projectDir}/${appDir}/layout.tsx`, layoutContent)

              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:templateCopied',message:'Template project copied and configured',data:{projectDir,copyDuration:Date.now()-startTime.getTime()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
              // #endregion
            } else {
              // FALLBACK: Manual scaffolding (slower, for non-template usage)
              await executeCommand(sandbox, `mkdir -p ${projectDir}/app ${projectDir}/components ${projectDir}/public`)

              // package.json
              const packageJson = {
              name,
              version: "0.1.0",
              private: true,
              scripts: {
                dev: "next dev -p 3000",
                build: "next build",
                start: "next start",
              },
                dependencies: {
                  next: "15.0.0",
                  react: "18.3.1",
                  "react-dom": "18.3.1",
                },
                devDependencies: {
                  autoprefixer: "^10.4.19",
                  postcss: "^8.4.38",
                  tailwindcss: "^3.4.3",
                  typescript: "^5.4.5",
                  "@types/node": "^20.12.7",
                  "@types/react": "^18.2.79",
                  "@types/react-dom": "^18.2.25",
                },
              }
              await writeFileToSandbox(sandbox, `${projectDir}/package.json`, JSON.stringify(packageJson, null, 2))

              // Config files
              await writeFileToSandbox(sandbox, `${projectDir}/tsconfig.json`, JSON.stringify({
                compilerOptions: {
                  target: "ES2017",
                  lib: ["dom", "dom.iterable", "esnext"],
                  allowJs: true,
                  skipLibCheck: true,
                  strict: true,
                  noEmit: true,
                  esModuleInterop: true,
                  module: "esnext",
                  moduleResolution: "bundler",
                  resolveJsonModule: true,
                  isolatedModules: true,
                  jsx: "preserve",
                  incremental: true,
                  plugins: [{ name: "next" }],
                  paths: { "@/*": ["./*"] },
                },
                include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
                exclude: ["node_modules"],
              }, null, 2))

              await writeFileToSandbox(sandbox, `${projectDir}/next.config.mjs`,
                `/** @type {import('next').NextConfig} */\nconst nextConfig = { reactStrictMode: true };\nexport default nextConfig;\n`)

              await writeFileToSandbox(sandbox, `${projectDir}/tailwind.config.ts`,
                `import type { Config } from "tailwindcss";\n\nconst config: Config = {\n  content: [\n    "./pages/**/*.{js,ts,jsx,tsx,mdx}",\n    "./components/**/*.{js,ts,jsx,tsx,mdx}",\n    "./app/**/*.{js,ts,jsx,tsx,mdx}",\n  ],\n  theme: { extend: {} },\n  plugins: [],\n};\n\nexport default config;\n`)

              await writeFileToSandbox(sandbox, `${projectDir}/postcss.config.js`,
                `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`)

              await writeFileToSandbox(sandbox, `${projectDir}/app/globals.css`,
                `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody {\n  font-family: system-ui, -apple-system, sans-serif;\n}\n`)

              await writeFileToSandbox(sandbox, `${projectDir}/app/layout.tsx`,
                `import type { Metadata } from "next";\nimport "./globals.css";\n\nexport const metadata: Metadata = {\n  title: "${name}",\n  description: "${description}",\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`)
            }
          }

          const appDir = await resolveAppDir()

          // Write pages
          for (const page of pages) {
            const action = page.action || "create"
            const normalizedPagePath = normalizeSandboxRelativePath(page.path, "app/")
            const pagePath = `${projectDir}/${appDir}/${normalizedPagePath}`

            if (action === "delete") {
              await executeCommand(sandbox, `rm -f ${pagePath}`)
              updateFileInContext(projectId, `${appDir}/${normalizedPagePath}`, undefined, "deleted")
            } else {
              const pageDir = pagePath.substring(0, pagePath.lastIndexOf("/"))
              if (pageDir !== `${projectDir}/${appDir}`) {
                await executeCommand(sandbox, `mkdir -p ${pageDir}`)
              }
              await writeFileToSandbox(sandbox, pagePath, page.content)
              updateFileInContext(projectId, `${appDir}/${normalizedPagePath}`, page.content, action === "create" ? "created" : "updated")
            }
          }

          // Write components
          if (components && components.length > 0) {
            for (const component of components) {
              const action = component.action || "create"
              const normalizedComponentName = normalizeSandboxRelativePath(component.name, "components/")
              const componentPath = `${projectDir}/components/${normalizedComponentName}`

              if (action === "delete") {
                await executeCommand(sandbox, `rm -f ${componentPath}`)
                updateFileInContext(projectId, `components/${normalizedComponentName}`, undefined, "deleted")
              } else {
                await writeFileToSandbox(sandbox, componentPath, component.content)
                updateFileInContext(projectId, `components/${normalizedComponentName}`, component.content, action === "create" ? "created" : "updated")
              }
            }
          }

          // Install deps for new projects (only if not using template)
          if (!projectExists && !hasTemplate) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:npmInstall:start',message:'Starting npm install (no template)',data:{projectDir},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2,H5'})}).catch(()=>{});
            // #endregion
            const installResult = await executeCommand(sandbox, `cd ${projectDir} && npm install`)
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:npmInstall:done',message:'npm install completed',data:{exitCode:installResult.exitCode,stderr:installResult.stderr?.slice(0,500),stdout:installResult.stdout?.slice(-500)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2,H5'})}).catch(()=>{});
            // #endregion
            if (installResult.exitCode !== 0) {
              throw new Error(`npm install failed: ${installResult.stderr}`)
            }
          } else if (!projectExists && hasTemplate) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:npmInstall:SKIPPED',message:'npm install SKIPPED - using template with pre-installed dependencies',data:{projectDir,templateId:process.env.E2B_TEMPLATE_ID,timeSaved:'~180-300s'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2'})}).catch(()=>{});
            // #endregion
          }

          // Ensure the correct dev server is running.
          // Sandboxes are reused per projectId and may have a different Next.js app already listening on 3000.
          // Restarting guarantees the preview shows THIS project (and avoids showing the default Next page).
          const waitTime = hasTemplate ? 6_000 : 12_000

          // FIX: Delete stale .next cache from template to ensure fresh build
          if (hasTemplate) {
            await executeCommand(sandbox, `rm -rf ${projectDir}/.next 2>/dev/null || true`)
          }

          await executeCommand(sandbox, `rm -f /tmp/server.log 2>/dev/null || true`)

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:startServer',message:'Starting dev server',data:{projectDir,hasTemplate,waitTime},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3,H4'})}).catch(()=>{});
          // #endregion

          await startBackgroundProcess(sandbox, "npm run dev", projectDir)

          // Give Next a head start to write its initial logs
          await new Promise((resolve) => setTimeout(resolve, waitTime))

          const { port: detectedPort, logTail } = await waitForNextDevServerFromLogs(sandbox, {
            maxWaitMs: hasTemplate ? 30_000 : 45_000,
            fallbackPort: 3000,
          })

          const statusCheck = await executeCommand(
            sandbox,
            `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:${detectedPort} || echo "000"`
          )
          const code = (statusCheck.stdout || "").trim()
          const serverReady = code.length === 3 && (code.startsWith("2") || code.startsWith("3"))

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:afterWait',message:`After wait - checking server status`,data:{hasTemplate,serverReady,detectedPort,httpStatus:code,serverLogTail:logTail?.slice(-1200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3,H4,H5'})}).catch(()=>{});
          // #endregion

          if (!serverReady) {
            throw new Error(`Dev server did not become reachable (detected port ${detectedPort}, status ${code}). Logs:\n${logTail}`)
          }

          const previewUrl = getHostUrl(sandbox, detectedPort)

          // Update context
          setProjectInfo(projectId, { projectName: name, projectDir, sandboxId: sandbox.sandboxId })
          updateServerState(projectId, { isRunning: true, port: detectedPort, url: previewUrl })

          recordToolExecution(projectId, "createWebsite", { name, description }, { previewUrl }, true, undefined, startTime)

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:success',message:'createWebsite completed successfully',data:{previewUrl,projectName:name,isNewProject:!projectExists},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H3,H4,H5'})}).catch(()=>{});
          // #endregion

          const totalTime = Date.now() - startTime.getTime()
          const performanceNote = hasTemplate && !projectExists
            ? ` (⚡ Template-optimized: ${(totalTime / 1000).toFixed(1)}s vs ~180s without template)`
            : ""

          return {
            success: true,
            projectName: name,
            previewUrl,
            port: detectedPort,
            pagesCreated: pages.map(p => p.path),
            componentsCreated: components?.map(c => c.name) || [],
            isNewProject: !projectExists,
            usedTemplate: hasTemplate && !projectExists,
            totalTimeMs: totalTime,
            message: `Website ${projectExists ? "updated" : "created"}! Preview: ${previewUrl}${performanceNote}`,
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to create website"
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/6f9641da-88fd-44cb-82e6-8ceca14f2c00',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'web-builder-agent.ts:createWebsite:error',message:'createWebsite failed',data:{error:errorMsg},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H3,H4,H5'})}).catch(()=>{});
          // #endregion
          recordToolExecution(projectId, "createWebsite", { name, description }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg }
        }
      },
    }),

    // ==================== CODE EXECUTION ====================

    executeCode: tool({
      description: "Execute Python, JavaScript, or TypeScript code in a secure sandbox. Python code uses optimized Code Interpreter for better output handling.",
      inputSchema: z.object({
        code: z.string().describe("Code to execute"),
        language: z.enum(["python", "javascript", "typescript", "js", "ts"]).optional().describe("Language (default: python)"),
        useCodeInterpreter: z.boolean().optional().describe("Force use of Code Interpreter for Python (default: true)"),
      }),
      execute: async ({ code, language = "python", useCodeInterpreter = true }) => {
        const startTime = new Date()

        try {
          // Use Code Interpreter for Python if available and enabled
          const sandbox = useCodeInterpreter && language === "python"
            ? await getCodeInterpreterSandbox(projectId)
            : await createSandbox(projectId)

          const result = await executeCode(sandbox, code, language as CodeLanguage)

          const output = result.logs.stdout.join("\n") + result.logs.stderr.join("\n")
          const success = !result.error
          const usedCodeInterpreter = useCodeInterpreter && language === "python" && "runCode" in sandbox

          recordToolExecution(projectId, "executeCode", { language, useCodeInterpreter }, { output, success, usedCodeInterpreter }, success, result.error?.message, startTime)

          return {
            success,
            output,
            error: result.error?.message,
            language,
            usedCodeInterpreter,
            results: result.results || [],
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Execution failed"
          recordToolExecution(projectId, "executeCode", { language }, undefined, false, errorMsg, startTime)
          return { success: false, error: errorMsg }
        }
      },
    }),
  }
}

/**
 * Generate enhanced system prompt with context awareness
 */
export function generateAgenticSystemPrompt(projectId: string, basePrompt: string): string {
  const context = getAgentContext(projectId)
  const summary = generateContextSummary(projectId)
  const recommendations = getContextRecommendations(projectId)

  const contextSection = summary !== "No context available yet."
    ? `\n\n## Current Project State\n${summary}`
    : ""

  const recommendationSection = recommendations.length > 0
    ? `\n\n## Recommendations\n${recommendations.map(r => `- ${r}`).join("\n")}`
    : ""

  const agenticAddendum = `

## Agentic Workflow Guidelines

You are an autonomous agent with deep awareness of project state. Follow these principles:

1. **Plan First**: For complex tasks, use \`planChanges\` to break work into steps
2. **Check State**: Use \`analyzeProjectState\` to understand current situation before acting
3. **Track Progress**: Use \`markStepComplete\` after finishing each planned step
4. **Fix Errors**: Always check \`getBuildStatus\` after changes and fix any errors
5. **Iterate**: If something fails, analyze the error, adjust, and retry
6. **Communicate**: Explain what you're doing and why at each step

### Error Recovery Pattern
When a tool fails:
1. Use \`getBuildStatus\` to see the error
2. Use \`analyzeProjectState\` for broader context
3. Use \`readFile\` to check the problematic file
4. Use \`editFile\` or \`writeFile\` to fix the issue
5. Verify the fix with \`getBuildStatus\` again

### Progress Tracking
- Your completed steps are tracked automatically
- Check recommendations for what to do next
- Build errors take priority over new features
`

  return basePrompt + contextSection + recommendationSection + agenticAddendum
}

/**
 * Get step state for prepareStep callback
 */
export function createStepState(): StepState {
  return {
    stepIndex: 0,
    errorCount: 0,
    buildErrors: [],
    serverRunning: false,
  }
}

/**
 * Update step state after each tool execution
 */
export function updateStepState(
  state: StepState,
  toolName: string,
  success: boolean,
  output?: Record<string, unknown>
): StepState {
  return {
    ...state,
    stepIndex: state.stepIndex + 1,
    lastToolName: toolName,
    lastToolSuccess: success,
    errorCount: success ? state.errorCount : state.errorCount + 1,
    buildErrors: toolName === "getBuildStatus" && output?.errors
      ? (output.errors as string[])
      : state.buildErrors,
    serverRunning: toolName === "startDevServer" && success
      ? true
      : state.serverRunning,
  }
}

// Export types
export type WebBuilderTools = ReturnType<typeof createContextAwareTools>