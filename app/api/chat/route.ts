import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai"
import { SYSTEM_PROMPT, MODEL_OPTIONS, type ModelProvider } from "@/lib/ai/agent"
import { createServerClient } from "@/lib/supabase/server"
import {
  createContextAwareTools,
  generateAgenticSystemPrompt,
} from "@/lib/ai/web-builder-agent"
import { setProjectInfo } from "@/lib/ai/agent-context"

export const maxDuration = 60

// Default project ID for sandbox operations
const DEFAULT_PROJECT_ID = "default"

// Export type for the chat messages
export type ChatMessage = UIMessage

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      messages,
      projectId = DEFAULT_PROJECT_ID,
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

    // Create context-aware tools for this project
    const tools = createContextAwareTools(projectId)

    // Generate enhanced system prompt with context awareness
    const systemPrompt = generateAgenticSystemPrompt(projectId, SYSTEM_PROMPT)

    // Initialize project info if this is a new session
    setProjectInfo(projectId, { projectName: projectId })

    // AI SDK v6 best practice: Track steps for debugging and monitoring
    let currentStepNumber = 0

    // Stream the response with context-aware tools
    // AI SDK v6 best practices: Use stopWhen, onStepFinish, and prepareStep
    const result = streamText({
      model: selectedModel,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      abortSignal: req.signal,
      stopWhen: stepCountIs(15), // Max steps for agentic workflows

      // AI SDK v6: onStepFinish callback for step tracking
      onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
        currentStepNumber++

        // Log step completion for debugging
        console.log(`[Step ${currentStepNumber}] Finished:`, {
          finishReason,
          toolCallsCount: toolCalls?.length || 0,
          toolResultsCount: toolResults?.length || 0,
          textLength: text?.length || 0,
          tokensUsed: usage?.totalTokens,
        })

        // Optional: Save step data to context or database for audit trail
        if (projectId && projectId !== DEFAULT_PROJECT_ID) {
          try {
            const supabase = await createServerClient()
            await supabase.from("agent_steps").insert({
              project_id: projectId,
              step_number: currentStepNumber,
              finish_reason: finishReason,
              tool_calls_count: toolCalls?.length || 0,
              tokens_used: usage?.totalTokens,
              created_at: new Date().toISOString(),
            })
          } catch (dbError) {
            // Don't fail the request if step logging fails
            console.warn("Failed to log step:", dbError)
          }
        }
      },

      // AI SDK v6: prepareStep for dynamic step configuration
      prepareStep: async ({ stepNumber, steps, messages: stepMessages }) => {
        // For longer agentic loops, compress conversation history
        if (stepMessages.length > 30) {
          console.log(`[Step ${stepNumber}] Compressing conversation history`)
          return {
            // Keep system message + last 20 messages
            messages: [
              stepMessages[0], // system message
              ...stepMessages.slice(-20),
            ],
          }
        }

        // No modifications needed for normal length conversations
        return {}
      },
    })

    // Pass originalMessages to prevent duplicate message IDs
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ messages: finishedMessages }) => {
        // Save message to database if projectId provided
        if (projectId && projectId !== DEFAULT_PROJECT_ID) {
          try {
            const supabase = await createServerClient()

            // Save assistant response
            await supabase.from("messages").insert({
              project_id: projectId,
              role: "assistant",
              content: JSON.stringify(finishedMessages),
            })
          } catch (dbError) {
            console.error("Failed to save message:", dbError)
          }
        }

        // Log completion summary
        console.log(`[Chat Complete] Project: ${projectId}, Steps: ${currentStepNumber}`)
      },
    })
  } catch (error) {
    console.error("Chat API error:", error)

    // AI SDK v6 best practice: Provide detailed error responses
    const errorMessage = error instanceof Error ? error.message : "Failed to process chat request"
    const errorDetails = {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }

    return new Response(JSON.stringify(errorDetails), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
