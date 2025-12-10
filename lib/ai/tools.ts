import { tool } from "ai"
import { z } from "zod"
import { createSandbox, executeCode, executeCommand, writeFile, readFile } from "@/lib/sandbox/bun-sandbox"

// Tool to execute Python/JavaScript code in local Bun sandbox
export const executeCodeTool = tool({
  description:
    "Execute Python or JavaScript code in a local sandbox environment. Use this to run code, analyze data, or test implementations.",
  inputSchema: z.object({
    code: z.string().describe("The code to execute"),
    language: z.enum(["python", "javascript"]).describe("The programming language"),
  }),
  async *execute({ code, language }, { messages }) {
    yield { state: "running" as const, message: "Executing code..." }

    try {
      // Get or create sandbox for this session
      const sandbox = await createSandbox("default-project")

      const result = await executeCode(sandbox, code)

      yield {
        state: "complete" as const,
        logs: result.logs,
        results: result.results,
        error: result.error,
      }
    } catch (error) {
      yield {
        state: "error" as const,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  },
})

// Tool to run shell commands
export const runCommandTool = tool({
  description:
    "Run a shell command in the sandbox environment. Use this to install packages, run build commands, or manage files.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to run"),
  }),
  async *execute({ command }) {
    yield { state: "running" as const, message: `Running: ${command}` }

    try {
      const sandbox = await createSandbox("default-project")
      const result = await executeCommand(sandbox, command)

      yield {
        state: "complete" as const,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }
    } catch (error) {
      yield {
        state: "error" as const,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  },
})

// Tool to write files to the sandbox
export const writeFileTool = tool({
  description:
    "Write content to a file in the sandbox. Use this to create or update source code files, configuration files, etc.",
  inputSchema: z.object({
    path: z.string().describe("The file path (e.g., 'src/app.tsx')"),
    content: z.string().describe("The file content to write"),
  }),
  async *execute({ path, content }) {
    yield { state: "writing" as const, message: `Writing to ${path}...` }

    try {
      const sandbox = await createSandbox("default-project")
      await writeFile(sandbox, path, content)

      yield {
        state: "complete" as const,
        path,
        success: true,
      }
    } catch (error) {
      yield {
        state: "error" as const,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  },
})

// Tool to read files from the sandbox
export const readFileTool = tool({
  description: "Read the content of a file from the sandbox. Use this to inspect existing code or configuration.",
  inputSchema: z.object({
    path: z.string().describe("The file path to read"),
  }),
  async *execute({ path }) {
    yield { state: "reading" as const, message: `Reading ${path}...` }

    try {
      const sandbox = await createSandbox("default-project")
      const result = await readFile(sandbox, path)

      yield {
        state: "complete" as const,
        path,
        content: result.content,
      }
    } catch (error) {
      yield {
        state: "error" as const,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  },
})

// Tool to generate UI components
export const generateComponentTool = tool({
  description:
    "Generate a React/Next.js component based on the user's description. This creates the component code and writes it to the sandbox.",
  inputSchema: z.object({
    name: z.string().describe("The component name (e.g., 'Button', 'Header')"),
    description: z.string().describe("Description of what the component should do"),
    props: z
      .array(
        z.object({
          name: z.string(),
          type: z.string(),
          description: z.string().optional(),
        }),
      )
      .optional()
      .describe("Component props"),
  }),
  outputSchema: z.object({
    componentCode: z.string(),
    path: z.string(),
  }),
})

// All available tools
export const agentTools = {
  executeCode: executeCodeTool,
  runCommand: runCommandTool,
  writeFile: writeFileTool,
  readFile: readFileTool,
  generateComponent: generateComponentTool,
} as const
