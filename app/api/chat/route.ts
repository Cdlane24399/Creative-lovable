import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  stepCountIs,
  NoSuchToolError,
  InvalidToolInputError,
} from "ai"
import { SYSTEM_PROMPT, MODEL_OPTIONS, type ModelProvider } from "@/lib/ai/agent"
import { agentTools } from "@/lib/ai/agent-tools"

export const maxDuration = 120

// Type for the chat request body
interface ChatRequestBody {
  messages: UIMessage[]
  projectId?: string
  model?: ModelProvider
  context?: {
    currentHtml?: string
    previousDesigns?: string[]
  }
}

// Step tracking for debugging and analytics
interface StepInfo {
  stepNumber: number
  toolCalls: string[]
  timestamp: number
}

export async function POST(req: Request) {
  const stepHistory: StepInfo[] = []

  try {
    const body: ChatRequestBody = await req.json()
    const { messages, projectId, model = "anthropic", context } = body

    console.log("[Agent] Request received:", {
      model,
      messageCount: messages?.length,
      hasContext: !!context,
      messagesType: typeof messages,
      isPromise: messages && typeof (messages as any).then === 'function',
      messages: messages ? JSON.stringify(messages).slice(0, 200) : 'undefined',
    })

    // Get selected model instance
    const selectedModel = MODEL_OPTIONS[model] || MODEL_OPTIONS.anthropic

    // Build enhanced system prompt with context awareness
    let enhancedSystemPrompt = SYSTEM_PROMPT

    // Add context about current state if available
    if (context?.currentHtml) {
      enhancedSystemPrompt += `\n\n## Current Design Context
You are working on an existing design. The user may reference "the current design" or ask for modifications.
When editing, use the editWebsite or addComponent tools instead of generateWebsite.
Use analyzeDesign if the user asks for feedback.`
    }

    // Add multi-tool awareness
    enhancedSystemPrompt += `\n\n## Available Tools
You have access to multiple specialized tools:
- **generateWebsite**: Create new websites from scratch
- **editWebsite**: Modify existing designs with targeted changes
- **addComponent**: Add specific sections/components to existing pages
- **analyzeDesign**: Provide feedback and critique (doesn't modify)
- **thinkStep**: Plan complex multi-step solutions (internal reasoning)

Choose the most appropriate tool for each request. For complex requests, use thinkStep first to plan your approach, then execute with the appropriate action tools.`

    // Convert messages for the model
    const modelMessages = convertToModelMessages(messages)

    // Stream the response with enhanced configuration
    const result = streamText({
      model: selectedModel,
      system: enhancedSystemPrompt,
      messages: modelMessages,
      tools: agentTools,

      // Multi-step execution: allow up to 5 tool calls for complex workflows
      // Using stopWhen for controlled multi-step execution
      stopWhen: stepCountIs(5),

      // Abort handling
      abortSignal: req.signal,

      // Step completion callback for tracking and debugging
      onStepFinish: ({ stepType, toolCalls, text, finishReason }) => {
        const stepInfo: StepInfo = {
          stepNumber: stepHistory.length + 1,
          toolCalls: toolCalls?.map((tc) => tc.toolName) || [],
          timestamp: Date.now(),
        }
        stepHistory.push(stepInfo)

        console.log("[Agent] Step completed:", {
          step: stepInfo.stepNumber,
          type: stepType,
          tools: stepInfo.toolCalls,
          finishReason,
          hasText: !!text,
        })
      },

      // Chunk callback for streaming progress
      onChunk: ({ chunk }) => {
        if (chunk.type === "tool-call-streaming-start") {
          console.log("[Agent] Tool streaming started:", chunk.toolName)
        }
      },

      // Completion callback
      onFinish: ({ steps, usage, finishReason }) => {
        console.log("[Agent] Generation complete:", {
          totalSteps: steps.length,
          finishReason,
          usage: {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
          },
        })
      },
    })

    // Return stream with enhanced error handling
    return result.toUIMessageStreamResponse({
      // Custom error handling for graceful degradation
      onError: (error: unknown) => {
        console.error("[Agent] Stream error:", error)

        // Handle specific error types with user-friendly messages
        if (NoSuchToolError.isInstance(error)) {
          return "I tried to use a tool that doesn't exist. Let me try a different approach."
        }

        if (InvalidToolInputError.isInstance(error)) {
          return "I had trouble with the tool parameters. Let me try again with corrected inputs."
        }

        // Handle rate limiting
        if (error instanceof Error && error.message.includes("rate")) {
          return "I'm being rate limited. Please wait a moment and try again."
        }

        // Handle context length errors
        if (error instanceof Error && error.message.includes("context")) {
          return "The conversation is too long. Try starting a new chat or being more concise."
        }

        // Generic fallback
        return "An error occurred while generating. Please try again."
      },
    })
  } catch (error) {
    console.error("[Agent] Request error:", error)

    // Structured error response
    const errorResponse = {
      error: "Failed to process chat request",
      code: "AGENT_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
      recoverable: true,
      suggestion: "Please try again or rephrase your request.",
    }

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
