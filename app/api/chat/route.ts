import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  NoSuchToolError,
  InvalidToolInputError,
  type UIMessage,
} from "ai";
import {
  SYSTEM_PROMPT,
  MODEL_SETTINGS,
  type ModelProvider,
} from "@/lib/ai/agent";
import {
  getModel,
  getGatewayProviderOptions,
  type ModelKey,
} from "@/lib/ai/providers";
import {
  createContextAwareTools,
  generateAgenticSystemPrompt,
} from "@/lib/ai/web-builder-agent";
import { setProjectInfo, getAgentContext } from "@/lib/ai/agent-context";
import { withAuth } from "@/lib/auth";
import { checkChatRateLimit } from "@/lib/rate-limit";
import {
  getProjectService,
  getMessageService,
  getTokenUsageService,
} from "@/lib/services";
import { logger } from "@/lib/logger";
import {
  validateRequest,
  chatRequestSchema,
  ValidationError,
  createValidationErrorResponse,
} from "@/lib/validations";
import { withSandbox } from "@/lib/e2b/sandbox-provider";

export const maxDuration = 300;

// AI SDK v6: Define tool groups for dynamic activation
const PLANNING_TOOLS = [
  "planChanges",
  "markStepComplete",
  "analyzeProjectState",
] as const;
const FILE_TOOLS = [
  "writeFile",
  "readFile",
  "editFile",
  "getProjectStructure",
] as const;
const BUILD_TOOLS = [
  "runCommand",
  "installPackage",
  "getBuildStatus",
  "startDevServer",
] as const;
const CODE_TOOLS = ["executeCode"] as const;
const SUGGESTION_TOOLS = ["generateSuggestions"] as const; // Always available for contextual suggestions

type ToolName =
  | (typeof PLANNING_TOOLS)[number]
  | (typeof FILE_TOOLS)[number]
  | (typeof BUILD_TOOLS)[number]
  | (typeof CODE_TOOLS)[number]
  | (typeof SUGGESTION_TOOLS)[number];

// Default project ID for sandbox operations
const DEFAULT_PROJECT_ID = "default";

const DEFAULT_ACTIVE_TOOLS: ToolName[] = [
  ...PLANNING_TOOLS,
  ...FILE_TOOLS,
  ...BUILD_TOOLS,
  ...CODE_TOOLS,
  ...SUGGESTION_TOOLS,
];

// Export type for the chat messages
export type ChatMessage = UIMessage;

export const POST = withAuth(async (req: Request) => {
  const requestId = req.headers.get("x-request-id") ?? "unknown";
  const log = logger.child({ requestId, operation: "chat" });

  // Check rate limit for chat endpoint
  const rateLimit = checkChatRateLimit(req);
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
    log.warn("Rate limit exceeded", { retryAfter });
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded. Please wait before sending more messages.",
        retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Remaining": rateLimit.remaining.toString(),
          "X-RateLimit-Reset": rateLimit.resetTime.toString(),
        },
      },
    );
  }

  try {
    const body = await req.json();

    // Validate request body using Zod schema (AI SDK v6 UIMessage format)
    let validatedRequest: {
      messages: unknown[];
      projectId: string;
      model: ModelProvider;
    };
    try {
      validatedRequest = validateRequest(chatRequestSchema, body);
    } catch (error) {
      if (error instanceof ValidationError) {
        return createValidationErrorResponse(error);
      }
      throw error;
    }

    const messages = validatedRequest.messages as UIMessage[];
    const projectId = validatedRequest.projectId || DEFAULT_PROJECT_ID;
    const model = validatedRequest.model;

    log.info("Chat request received", {
      projectId,
      model,
      messageCount: messages.length,
    });

    // Get services
    const projectService = getProjectService();
    const messageService = getMessageService();
    const tokenUsageService = getTokenUsageService();

    // Get model settings (model instances handled by providers.ts)
    // Validate model exists in our settings, fallback to anthropic
    const validModel = (
      model in MODEL_SETTINGS ? model : "anthropic"
    ) as ModelProvider;
    const modelKey = validModel as ModelKey; // All ModelProvider values are valid ModelKey values
    const modelSettings = MODEL_SETTINGS[validModel];

    // Start independent async work early to reduce route-level waterfalls
    const modelMessagesPromise = convertToModelMessages(messages);
    const ensureProjectExistsPromise: Promise<void> =
      projectId && projectId !== DEFAULT_PROJECT_ID
        ? projectService
            .ensureProjectExists(projectId, "Untitled Project")
            .then(() => undefined)
            .catch((dbError) => {
              console.warn("Failed to ensure project exists:", dbError);
            })
        : Promise.resolve();

    // Convert messages for the model
    const modelMessages = await modelMessagesPromise;

    // Create context-aware tools for this project
    const tools = createContextAwareTools(projectId);

    // Generate enhanced system prompt with context awareness
    const systemPrompt = generateAgenticSystemPrompt(projectId, SYSTEM_PROMPT);

    // Initialize project info if this is a new session
    setProjectInfo(projectId, { projectName: projectId });

    // Ensure project exists in database BEFORE any tool calls can trigger context saves
    // This prevents foreign key constraint violations
    await ensureProjectExistsPromise;

    // AI SDK v6 best practice: Track steps for debugging and monitoring
    let currentStepNumber = 0;

    // Shared streamText configuration
    const streamConfig = {
      system: systemPrompt,
      messages: modelMessages,
      tools,
      abortSignal: req.signal,
      // AI SDK v6: Use stopWhen with stepCountIs for multi-step agentic behaviors
      stopWhen: stepCountIs(modelSettings.maxSteps || 50),
      // Model-specific token limits (important for Gemini)
      ...(modelSettings.maxTokens && {
        maxOutputTokens: modelSettings.maxTokens,
      }),

      // AI SDK v6: onStepFinish callback for step tracking
      onStepFinish: async ({
        text,
        toolCalls,
        toolResults,
        finishReason,
        usage,
      }: any) => {
        currentStepNumber++;

        // Log step completion for debugging
        console.log(`[Step ${currentStepNumber}] Finished:`, {
          finishReason,
          toolCallsCount: toolCalls?.length || 0,
          toolResultsCount: toolResults?.length || 0,
          textLength: text?.length || 0,
          tokensUsed: usage?.totalTokens,
        });

        // Persist token usage to database
        if (usage && projectId && projectId !== DEFAULT_PROJECT_ID) {
          try {
            const promptTokens = usage.promptTokens || 0;
            const completionTokens = usage.completionTokens || 0;
            const totalTokens =
              usage.totalTokens || promptTokens + completionTokens;

            if (totalTokens > 0) {
              await tokenUsageService.recordTokenUsage({
                project_id: projectId,
                model: validModel,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                step_number: currentStepNumber,
              });

              log.debug(`Token usage recorded for step ${currentStepNumber}`, {
                projectId,
                model: validModel,
                tokens: totalTokens,
              });
            }
          } catch (error) {
            // Log error but don't fail the chat request
            log.error("Failed to record token usage:", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      },

      // AI SDK v6: prepareStep for dynamic step configuration and activeTools
      prepareStep: async ({ stepNumber, messages: stepMessages }: any) => {
        const context = getAgentContext(projectId);
        const config: {
          messages?: typeof stepMessages;
          activeTools?: ToolName[];
        } = {};
        config.activeTools = DEFAULT_ACTIVE_TOOLS;

        // Model-aware compression thresholds
        // Gemini models have 1M+ token context windows, so we can be much more generous
        const isGeminiModel =
          validModel === "google" || validModel === "googlePro";
        const compressionThreshold = isGeminiModel ? 200 : 50; // 200 for Gemini, 50 for others
        const keepCount = isGeminiModel ? 150 : 30; // Keep more messages for Gemini

        // For longer agentic loops, compress conversation history
        // CRITICAL: Must preserve tool_use/tool_result pairs to avoid API errors
        if (stepMessages.length > compressionThreshold) {
          console.log(
            `[Step ${stepNumber}] Compressing conversation history (threshold: ${compressionThreshold}, model: ${validModel})`,
          );

          // Find a safe cut point that doesn't split tool pairs
          let startIndex = stepMessages.length - keepCount;

          // Check if the message at startIndex contains tool_results without their tool_use
          // Tool results reference tool_use IDs from the previous assistant message
          // We need to ensure we don't orphan tool_results from their tool_use
          const firstKeptMessage = stepMessages[startIndex];

          // If first kept message has tool results, we need to include the assistant message before it
          if (
            firstKeptMessage?.role === "tool" ||
            (firstKeptMessage?.content &&
              Array.isArray(firstKeptMessage.content) &&
              firstKeptMessage.content.some(
                (c: any) =>
                  c.type === "tool-result" || c.type === "tool_result",
              ))
          ) {
            // Walk backwards to find the assistant message with the tool_use
            for (let i = startIndex - 1; i > 0; i--) {
              const msg = stepMessages[i];
              if (msg?.role === "assistant") {
                startIndex = i;
                break;
              }
            }
          }

          // Also check for orphaned tool_use at the end (assistant called tool but no result yet)
          // This shouldn't happen in prepareStep, but be safe
          const lastMessage = stepMessages[stepMessages.length - 1];
          if (
            lastMessage?.role === "assistant" &&
            lastMessage?.content &&
            Array.isArray(lastMessage.content) &&
            lastMessage.content.some(
              (c: any) => c.type === "tool-use" || c.type === "tool_use",
            )
          ) {
            // Keep this as-is, the result will come in the next message
          }

          config.messages = [
            stepMessages[0], // system message
            ...stepMessages.slice(startIndex),
          ];

          console.log(
            `[Step ${stepNumber}] Compressed from ${stepMessages.length} to ${config.messages.length} messages (safe cut at index ${startIndex})`,
          );
        }

        // AI SDK v6: Dynamic activeTools based on context
        // This optimizes token usage by only including relevant tools
        // SUGGESTION_TOOLS always included for contextual follow-up suggestions
        if (stepNumber === 0) {
          // First step: keep scope tight for reliable bootstrap behavior.
          config.activeTools = DEFAULT_ACTIVE_TOOLS;
        } else if (context.buildStatus?.hasErrors) {
          // Build errors: Focus on debugging and file operations
          config.activeTools = [
            ...FILE_TOOLS,
            ...BUILD_TOOLS,
            ...SUGGESTION_TOOLS,
          ] as ToolName[];
          console.log(
            `[Step ${stepNumber}] Build errors detected, focusing on debugging tools`,
          );
        } else if (context.serverState?.isRunning && context.taskGraph) {
          // Server running with active task graph: Focus on file operations
          config.activeTools = [
            ...FILE_TOOLS,
            ...BUILD_TOOLS,
            "markStepComplete",
            ...SUGGESTION_TOOLS,
          ] as ToolName[];
        }

        // Return empty object if no modifications needed
        return Object.keys(config).length > 0 ? config : {};
      },

      // AI SDK v6: Tool call repair for better error recovery
      experimental_repairToolCall: async ({ toolCall, error }: any) => {
        // Don't try to repair unknown tools
        if (NoSuchToolError.isInstance(error)) {
          console.warn(`[Tool Repair] Unknown tool: ${toolCall.toolName}`);
          return null;
        }

        // For invalid inputs, try to fix common issues
        if (InvalidToolInputError.isInstance(error)) {
          console.log(
            `[Tool Repair] Attempting to fix invalid input for: ${toolCall.toolName}`,
          );

          // Common fixes for path-related issues
          if (typeof toolCall.input === "object" && toolCall.input !== null) {
            const input = toolCall.input as Record<string, unknown>;
            const repairedInput = { ...input };

            // Fix common path issues
            if (typeof repairedInput.path === "string") {
              // Remove leading slashes if present
              repairedInput.path = (repairedInput.path as string).replace(
                /^\/+/,
                "",
              );
            }

            // Fix projectName issues
            if (typeof repairedInput.projectName === "string") {
              // Convert to lowercase with hyphens
              repairedInput.projectName = (repairedInput.projectName as string)
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "");
            }

            // Normalize malformed files payloads sent as an object map.
            if (
              repairedInput.files &&
              !Array.isArray(repairedInput.files) &&
              typeof repairedInput.files === "object"
            ) {
              repairedInput.files = Object.values(
                repairedInput.files as Record<string, unknown>,
              );
            }

            return {
              ...toolCall,
              input: repairedInput,
            };
          }
        }

        // Return null if we can't repair
        return null;
      },
    };

    // Response handler - takes sandbox reference for onFinish sync
    const createResponse = (result: any, sandboxRef: any) => {
      return result.toUIMessageStreamResponse({
        originalMessages: messages,
        // AI SDK v6: Custom error messages for better UX
        onError: (error: unknown) => {
          if (NoSuchToolError.isInstance(error)) {
            return "I tried to use an unknown tool. Let me try a different approach.";
          }
          if (InvalidToolInputError.isInstance(error)) {
            return "I provided invalid input to a tool. Let me fix that and try again.";
          }
          // Generic error message
          return `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`;
        },
        onFinish: async ({ messages: finishedMessages }: any) => {
          // Save messages to database if projectId provided
          if (projectId && projectId !== DEFAULT_PROJECT_ID) {
            try {
              // Convert UIMessage array to our format and save
              // AI SDK v6: UIMessage only has parts, no content property
              const messagesToSave = finishedMessages.map((msg: UIMessage) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant" | "system",
                content:
                  msg.parts
                    ?.filter((p: any) => p.type === "text")
                    .map((p: any) => p.text)
                    .join("") || "",
                parts: msg.parts as any[],
              }));

              await messageService.saveConversation(projectId, messagesToSave);

              console.log(
                `[Chat] Saved ${messagesToSave.length} messages for project ${projectId}`,
              );
            } catch (dbError) {
              console.error("Failed to save messages:", dbError);
            }

            // Auto-sync project files to database at session end (safety net)
            // Uses sandbox reference captured in closure (AsyncLocalStorage context
            // may have exited by the time onFinish runs)
            if (sandboxRef) {
              try {
                const { quickSyncToDatabaseWithRetry } = await import("@/lib/e2b/sync-manager");
                await quickSyncToDatabaseWithRetry(sandboxRef, projectId);
                console.log(`[Chat] Auto-synced project files for ${projectId}`);
              } catch (syncError) {
                console.warn("[Chat] Session-end sync failed:", syncError);
              }
            }
          }

          // Log completion summary with context
          const context = getAgentContext(projectId);
          console.log(
            `[Chat Complete] Project: ${projectId}, Steps: ${currentStepNumber}, Server: ${context.serverState?.isRunning ? "Running" : "Stopped"}`,
          );
        },
      });
    };

    // Wrap streaming in sandbox context for infrastructure-level lifecycle management
    // This ensures all tools share the same sandbox instance
    // initProject: true auto-initializes the project structure before the agent starts
    return withSandbox(
      projectId,
      async () => {
        // Capture sandbox reference for onFinish callback (which runs after
        // AsyncLocalStorage context has exited)
        const { getCurrentSandbox } = await import("@/lib/e2b/sandbox-provider");
        const sandboxRef = getCurrentSandbox();

        // Stream the response with Gateway (provider failover handled by Gateway's order option)
        const result = streamText({
          model: getModel(modelKey),
          providerOptions: getGatewayProviderOptions(modelKey),
          ...streamConfig,
        });

        return createResponse(result, sandboxRef);
      },
      {
        projectDir: "/home/user/project",
        autoPause: true,
        initProject: true,
      },
    );
  } catch (error) {
    console.error("Chat API error:", error);

    // AI SDK v6 best practice: Provide detailed error responses
    const errorMessage =
      error instanceof Error ? error.message : "Failed to process chat request";
    const errorDetails = {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(errorDetails), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
