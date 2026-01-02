import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  NoSuchToolError,
  InvalidToolInputError,
  type UIMessage,
  type StopCondition,
} from "ai"
import { SYSTEM_PROMPT, MODEL_OPTIONS, MODEL_SETTINGS, type ModelProvider } from "@/lib/ai/agent"
import {
  createContextAwareTools,
  generateAgenticSystemPrompt,
} from "@/lib/ai/web-builder-agent"
import { setProjectInfo, getAgentContext } from "@/lib/ai/agent-context"
import { withAuth } from "@/lib/auth"
import { getProjectService, getMessageService } from "@/lib/services"

export const maxDuration = 60

// AI SDK v6: Define tool groups for dynamic activation
const PLANNING_TOOLS = ["planChanges", "markStepComplete", "analyzeProjectState"] as const
const FILE_TOOLS = ["writeFile", "readFile", "editFile", "getProjectStructure"] as const
const BUILD_TOOLS = ["runCommand", "installPackage", "getBuildStatus", "startDevServer"] as const
const CREATION_TOOLS = ["createWebsite"] as const
const CODE_TOOLS = ["executeCode"] as const

type ToolName = typeof PLANNING_TOOLS[number] | typeof FILE_TOOLS[number] | typeof BUILD_TOOLS[number] | typeof CREATION_TOOLS[number] | typeof CODE_TOOLS[number]

// Default project ID for sandbox operations
const DEFAULT_PROJECT_ID = "default"

// Export type for the chat messages
export type ChatMessage = UIMessage

export const POST = withAuth(async (req: Request) => {
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

    // Get services
    const projectService = getProjectService()
    const messageService = getMessageService()

    // Get selected model and its settings
    const selectedModel = MODEL_OPTIONS[model] || MODEL_OPTIONS.anthropic
    const modelSettings = MODEL_SETTINGS[model] || MODEL_SETTINGS.anthropic

    // Convert messages for the model
    const modelMessages = await convertToModelMessages(messages)

    // Create context-aware tools for this project
    const tools = createContextAwareTools(projectId)

    // Generate enhanced system prompt with context awareness
    const systemPrompt = generateAgenticSystemPrompt(projectId, SYSTEM_PROMPT)

    // Initialize project info if this is a new session
    setProjectInfo(projectId, { projectName: projectId })

    // Ensure project exists in database BEFORE any tool calls can trigger context saves
    // This prevents foreign key constraint violations
    if (projectId && projectId !== DEFAULT_PROJECT_ID) {
      try {
        await projectService.ensureProjectExists(projectId, "Untitled Project")
      } catch (dbError) {
        console.warn("Failed to ensure project exists:", dbError)
      }
    }

    // AI SDK v6 best practice: Track steps for debugging and monitoring
    let currentStepNumber = 0

    // Stream the response with context-aware tools
    // AI SDK v6 best practices: Use stopWhen, onStepFinish, prepareStep, and experimental_repairToolCall
    const result = streamText({
      model: selectedModel,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      abortSignal: req.signal,
      // AI SDK v6: Use stopWhen with stepCountIs for multi-step agentic behaviors
      stopWhen: stepCountIs(modelSettings.maxSteps || 50),
      // Model-specific token limits (important for Gemini)
      ...(modelSettings.maxTokens && { maxOutputTokens: modelSettings.maxTokens }),

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
      },

      // AI SDK v6: prepareStep for dynamic step configuration and activeTools
      prepareStep: async ({ stepNumber, messages: stepMessages }) => {
        const context = getAgentContext(projectId)
        const config: {
          messages?: typeof stepMessages
          activeTools?: ToolName[]
        } = {}

        // For longer agentic loops, compress conversation history
        if (stepMessages.length > 30) {
          console.log(`[Step ${stepNumber}] Compressing conversation history`)
          config.messages = [
            stepMessages[0], // system message
            ...stepMessages.slice(-20),
          ]
        }

        // AI SDK v6: Dynamic activeTools based on context
        // This optimizes token usage by only including relevant tools
        if (stepNumber === 0) {
          // First step: Focus on planning and creation
          config.activeTools = [...PLANNING_TOOLS, ...CREATION_TOOLS, "getProjectStructure"] as ToolName[]
        } else if (context.buildStatus?.hasErrors) {
          // Build errors: Focus on debugging and file operations
          config.activeTools = [...FILE_TOOLS, ...BUILD_TOOLS] as ToolName[]
          console.log(`[Step ${stepNumber}] Build errors detected, focusing on debugging tools`)
        } else if (context.serverState?.isRunning && context.taskGraph) {
          // Server running with active task graph: Focus on file operations
          config.activeTools = [...FILE_TOOLS, ...BUILD_TOOLS, "markStepComplete"] as ToolName[]
        }

        // Return empty object if no modifications needed
        return Object.keys(config).length > 0 ? config : {}
      },

      // AI SDK v6: Tool call repair for better error recovery
      experimental_repairToolCall: async ({ toolCall, error, messages: repairMessages }) => {
        // Don't try to repair unknown tools
        if (NoSuchToolError.isInstance(error)) {
          console.warn(`[Tool Repair] Unknown tool: ${toolCall.toolName}`)
          return null
        }

        // For invalid inputs, try to fix common issues
        if (InvalidToolInputError.isInstance(error)) {
          console.log(`[Tool Repair] Attempting to fix invalid input for: ${toolCall.toolName}`)

          // Common fixes for path-related issues
          if (typeof toolCall.input === "object" && toolCall.input !== null) {
            const input = toolCall.input as Record<string, unknown>

            // Fix common path issues
            if (typeof input.path === "string") {
              // Remove leading slashes if present
              input.path = (input.path as string).replace(/^\/+/, "")
            }

            // Fix projectName issues
            if (typeof input.projectName === "string") {
              // Convert to lowercase with hyphens
              input.projectName = (input.projectName as string)
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "")
            }

            return {
              ...toolCall,
              input: JSON.stringify(input),
            }
          }
        }

        // Return null if we can't repair
        return null
      },
    })

    // AI SDK v6: Enhanced response with better error handling
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      // AI SDK v6: Custom error messages for better UX
      onError: (error) => {
        if (NoSuchToolError.isInstance(error)) {
          return "I tried to use an unknown tool. Let me try a different approach."
        }
        if (InvalidToolInputError.isInstance(error)) {
          return "I provided invalid input to a tool. Let me fix that and try again."
        }
        // Generic error message
        return `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`
      },
      onFinish: async ({ messages: finishedMessages }) => {
        // Save messages to database if projectId provided
        if (projectId && projectId !== DEFAULT_PROJECT_ID) {
          try {
            // Convert UIMessage array to our format and save
            // AI SDK v6: UIMessage only has parts, no content property
            const messagesToSave = finishedMessages.map((msg: UIMessage) => ({
              id: msg.id,
              role: msg.role as "user" | "assistant" | "system",
              content: msg.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || "",
              parts: msg.parts as any[],
            }))

            await messageService.saveConversation(projectId, messagesToSave)
            
            console.log(`[Chat] Saved ${messagesToSave.length} messages for project ${projectId}`)
          } catch (dbError) {
            console.error("Failed to save messages:", dbError)
          }
        }

        // Log completion summary with context
        const context = getAgentContext(projectId)
        console.log(`[Chat Complete] Project: ${projectId}, Steps: ${currentStepNumber}, Server: ${context.serverState?.isRunning ? "Running" : "Stopped"}`)
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
})
