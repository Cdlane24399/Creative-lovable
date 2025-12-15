import { streamText, type Message } from "ai"
import { z } from "zod"
import { SYSTEM_PROMPT, MODEL_OPTIONS, type ModelProvider } from "@/lib/ai/agent"

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, model = "anthropic" } = body as {
      messages: Message[]
      model?: ModelProvider
    }

    console.log("[v0] Chat API called with model:", model)
    console.log("[v0] Number of messages:", messages?.length)

    // Get selected model
    const selectedModel = MODEL_OPTIONS[model] || MODEL_OPTIONS.anthropic
    console.log("[v0] Using model:", selectedModel)

    // Stream the response with tools
    const result = streamText({
      model: selectedModel,
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        generateWebsite: {
          description:
            "Generate a complete HTML website with Tailwind CSS styling. Use this tool whenever the user asks for any visual UI, website, landing page, or component.",
          parameters: z.object({
            title: z.string().describe("The title of the website or component"),
            description: z.string().describe("Brief description of what was created"),
            html: z
              .string()
              .describe("Complete HTML code including DOCTYPE, head with Tailwind CDN, and body with all content"),
          }),
        },
      },
      maxSteps: 5,
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
