import { convertToModelMessages, streamText, type UIMessage, tool } from "ai"
import { z } from "zod"
import { SYSTEM_PROMPT, MODEL_OPTIONS, type ModelProvider } from "@/lib/ai/agent"

export const maxDuration = 60

const tools = {
  generateComponent: tool({
    description: "Generate a React/Next.js component. Returns the component code to be displayed to the user.",
    inputSchema: z.object({
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

  searchWeb: tool({
    description: "Search the web for documentation, examples, or solutions.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
    }),
    execute: async function* ({ query }) {
      yield { state: "searching" as const, query }
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

    console.log("[v0] Chat API called with model:", model)
    console.log("[v0] Number of messages:", messages?.length)

    // Get selected model
    const selectedModel = MODEL_OPTIONS[model] || MODEL_OPTIONS.anthropic
    console.log("[v0] Using model:", selectedModel)

    const modelMessages = convertToModelMessages(messages)
    console.log("[v0] Converted messages count:", modelMessages.length)

    // Stream the response
    const result = streamText({
      model: selectedModel,
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      maxSteps: 10,
      abortSignal: req.signal,
    })

    console.log("[v0] Stream started successfully")

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return new Response(
      JSON.stringify({
        error: "Failed to process chat request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
