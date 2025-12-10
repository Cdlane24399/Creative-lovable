import { convertToModelMessages, streamText, type UIMessage, tool } from "ai"
import { z } from "zod"
import { SYSTEM_PROMPT, MODEL_OPTIONS, type ModelProvider } from "@/lib/ai/agent"
import { createServerClient } from "@/lib/supabase/server"
import {
  createSandbox,
  executeCode,
  writeFile as writeFileToSandbox,
  readFile as readFileFromSandbox,
  executeCommand,
} from "@/lib/sandbox/bun-sandbox"

export const maxDuration = 60

// Define tools inline for proper type inference
const tools = {
  generateComponent: tool({
    description: "Generate a React/Next.js component. Returns the component code to be displayed to the user.",
    parameters: z.object({
      name: z.string().describe("Component name in PascalCase"),
      description: z.string().describe("What the component should do"),
      styling: z.string().optional().describe("Styling approach: 'tailwind' or 'css'"),
    }),
    execute: async function* ({ name, description, styling = "tailwind" }) {
      yield { state: "generating" as const, message: `Creating ${name} component...` }
      yield {
        state: "complete" as const,
        componentName: name,
        description,
        styling,
      }
    },
  }),

  executeCode: tool({
    description:
      "Execute Python or JavaScript code in a local sandbox. Use for data processing, calculations, or testing logic.",
    parameters: z.object({
      code: z.string().describe("Code to execute"),
      language: z.enum(["python", "javascript"]).default("python"),
      projectId: z.string().optional().describe("Project ID for sandbox persistence"),
    }),
    execute: async function* ({ code, language, projectId }) {
      yield { state: "running" as const, message: `Executing ${language} code in sandbox...` }

      try {
        const sandbox = await createSandbox(projectId || "default")
        const result = await executeCode(sandbox, code)

        yield {
          state: "complete" as const,
          output: result.logs.stdout.join("\n") + result.logs.stderr.join("\n"),
          results: result.results,
          error: result.error?.message,
          code,
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Execution failed",
        }
      }
    },
  }),

  writeFile: tool({
    description: "Write content to a file in the project sandbox.",
    parameters: z.object({
      path: z.string().describe("File path relative to project root"),
      content: z.string().describe("File content"),
      projectId: z.string().optional().describe("Project ID for sandbox"),
    }),
    execute: async function* ({ path, content, projectId }) {
      yield { state: "writing" as const, path }

      try {
        const sandbox = await createSandbox(projectId || "default")
        await writeFileToSandbox(sandbox, path, content)
        yield { state: "complete" as const, path, success: true }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Write failed",
        }
      }
    },
  }),

  readFile: tool({
    description: "Read content from a file in the project sandbox.",
    parameters: z.object({
      path: z.string().describe("File path relative to project root"),
      projectId: z.string().optional().describe("Project ID for sandbox"),
    }),
    execute: async function* ({ path, projectId }) {
      yield { state: "reading" as const, path }

      try {
        const sandbox = await createSandbox(projectId || "default")
        const result = await readFileFromSandbox(sandbox, path)
        yield { state: "complete" as const, path, content: result.content }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Read failed",
        }
      }
    },
  }),

  runCommand: tool({
    description: "Run a shell command in the sandbox (e.g., npm install, git clone).",
    parameters: z.object({
      command: z.string().describe("Shell command to execute"),
      projectId: z.string().optional().describe("Project ID for sandbox"),
    }),
    execute: async function* ({ command, projectId }) {
      yield { state: "running" as const, message: `Running: ${command}` }

      try {
        const sandbox = await createSandbox(projectId || "default")
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
          error: error instanceof Error ? error.message : "Command failed",
        }
      }
    },
  }),

  searchWeb: tool({
    description: "Search the web for documentation, examples, or solutions.",
    parameters: z.object({
      query: z.string().describe("Search query"),
    }),
    execute: async function* ({ query }) {
      yield { state: "searching" as const, query }
      // Placeholder - would integrate with actual search API
      yield {
        state: "complete" as const,
        query,
        results: `Search results for: ${query}`,
      }
    },
  }),
}

export type ChatMessage = UIMessage<never, Record<string, unknown>, typeof tools>

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      messages,
      projectId,
      model = "anthropic",
    } = body as {
      messages: UIMessage[]
      projectId?: string
      model?: ModelProvider
    }

    // Get selected model
    const selectedModel = MODEL_OPTIONS[model] || MODEL_OPTIONS.anthropic

    // Convert messages for the model
    const modelMessages = convertToModelMessages(messages)

    // Stream the response
    const result = streamText({
      model: selectedModel,
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      maxSteps: 10, // Use maxSteps instead of stopWhen
      abortSignal: req.signal,
    })

    return result.toUIMessageStreamResponse({
      onFinish: async ({ response }) => {
        // Save message to database if projectId provided
        if (projectId) {
          try {
            const supabase = await createServerClient()

            // Save assistant response
            await supabase.from("messages").insert({
              project_id: projectId,
              role: "assistant",
              content: JSON.stringify(response.messages),
            })
          } catch (dbError) {
            console.error("Failed to save message:", dbError)
          }
        }
      },
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return new Response(JSON.stringify({ error: "Failed to process chat request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
