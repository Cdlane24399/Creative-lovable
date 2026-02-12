import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  pruneMessages,
  validateUIMessages,
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
  getOpenRouterModel,
  hasOpenRouterFallback,
  type ModelKey,
} from "@/lib/ai/providers";
import {
  createContextAwareTools,
  generateAgenticSystemPrompt,
} from "@/lib/ai/web-builder-agent";
import {
  deriveProjectNameFromMessages,
  isPlaceholderProjectName,
} from "@/lib/ai/project-naming";
import {
  ensureAssistantText,
} from "@/lib/ai/chat-optimizations";
import {
  setProjectInfo,
  getAgentContext,
  flushContext,
} from "@/lib/ai/agent-context";
import { withAuth } from "@/lib/auth";
import { checkChatRateLimit } from "@/lib/rate-limit";
import {
  getProjectService,
  getMessageService,
  getTokenUsageService,
  type MessageToSave,
} from "@/lib/services";
import { logger } from "@/lib/logger";
import {
  validateRequest,
  chatRequestSchema,
  ValidationError,
  createValidationErrorResponse,
} from "@/lib/validations";
import { withSandbox } from "@/lib/e2b/sandbox-provider";
import { getProjectDir } from "@/lib/e2b/project-dir";

export const maxDuration = 300;

// AI SDK v6: Define tool groups for dynamic activation
const PLANNING_TOOLS = [
  "planChanges",
  "analyzeProjectState",
] as const;
const FILE_TOOLS = [
  "writeFile",
  "readFile",
  "editFile",
  "getProjectStructure",
  "batchWriteFiles",
] as const;
const BUILD_TOOLS = ["runCommand", "installPackage", "getBuildStatus"] as const;
const SYNC_TOOLS = ["syncProject"] as const;
const CODE_TOOLS = ["executeCode"] as const;

type ToolName =
  | (typeof PLANNING_TOOLS)[number]
  | (typeof FILE_TOOLS)[number]
  | (typeof BUILD_TOOLS)[number]
  | (typeof SYNC_TOOLS)[number]
  | (typeof CODE_TOOLS)[number];

// Default project ID for sandbox operations
const DEFAULT_PROJECT_ID = "default";

const DEFAULT_ACTIVE_TOOLS: ToolName[] = [
  ...PLANNING_TOOLS,
  ...FILE_TOOLS,
  ...BUILD_TOOLS,
  ...SYNC_TOOLS,
  ...CODE_TOOLS,
];

// New-system bootstrap: keep first step focused on planning + project scan + batch writes.
const BOOTSTRAP_ACTIVE_TOOLS: ToolName[] = [
  "analyzeProjectState",
  "planChanges",
  "getProjectStructure",
  "readFile",
  "batchWriteFiles",
  "installPackage",
  "getBuildStatus",
  "syncProject",
];

const FILE_MUTATION_TOOLS = new Set([
  "writeFile",
  "editFile",
  "batchWriteFiles",
  "initializeProject",
]);

function getToolOutputSuccess(output: unknown): boolean | undefined {
  if (!output || typeof output !== "object") return undefined;
  const obj = output as Record<string, unknown>;

  // Explicit success field takes priority
  if ("success" in obj) return Boolean(obj.success);

  // Treat an 'error' field as failure
  if ("error" in obj && obj.error) return false;

  // 'filesReady' signals a successful file operation
  if ("filesReady" in obj) return Boolean(obj.filesReady);

  return undefined;
}

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

    const rawMessages = validatedRequest.messages;
    const projectId = validatedRequest.projectId || DEFAULT_PROJECT_ID;
    const model = validatedRequest.model;

    // Get services
    const projectService = getProjectService();
    const messageService = getMessageService();
    const tokenUsageService = getTokenUsageService();

    // Validate requested model exists, fallback to anthropic.
    const requestedModel = (
      model in MODEL_SETTINGS ? model : "anthropic"
    ) as ModelProvider;

    // Create context-aware tools for this project
    const tools = createContextAwareTools(projectId);

    let messages: UIMessage[];
    try {
      messages = await validateUIMessages<UIMessage>({
        messages: rawMessages,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid UI message format";
      return createValidationErrorResponse(
        new ValidationError(`Invalid UI messages: ${message}`, []),
      );
    }

    const derivedProjectName = deriveProjectNameFromMessages(
      messages,
      "Untitled Project",
    );
    const defaultProjectName = isPlaceholderProjectName(
      derivedProjectName,
      projectId,
    )
      ? "Untitled Project"
      : derivedProjectName;

    // Always respect the model selected by the user in the UI.
    const executionModel = requestedModel;
    const modelKey = executionModel as ModelKey;
    const modelSettings = MODEL_SETTINGS[executionModel];

    log.info("Chat request received", {
      projectId,
      requestedModel: model,
      executionModel,
      defaultProjectName,
      messageCount: rawMessages.length,
    });

    // Start independent async work early to reduce route-level waterfalls
    const modelMessagesPromise = convertToModelMessages(
      messages.map(({ id: _id, ...message }) => message),
      { tools },
    );
    const ensureProjectExistsPromise: Promise<void> =
      projectId && projectId !== DEFAULT_PROJECT_ID
        ? projectService
            .ensureProjectExists(projectId, defaultProjectName)
            .then(() => undefined)
            .catch((dbError) => {
              console.warn("Failed to ensure project exists:", dbError);
            })
        : Promise.resolve();

    // Convert messages for the model
    const modelMessages = await modelMessagesPromise;

    // Generate enhanced system prompt with context awareness
    const systemPrompt = generateAgenticSystemPrompt(projectId, SYSTEM_PROMPT);

    // Initialize project info if this is a new session
    if (!isPlaceholderProjectName(defaultProjectName, projectId)) {
      setProjectInfo(projectId, { projectName: defaultProjectName });
    }

    // Ensure project exists in database BEFORE any tool calls can trigger context saves
    // This prevents foreign key constraint violations
    await ensureProjectExistsPromise;

    // AI SDK v6 best practice: Track steps for debugging and monitoring
    let currentStepNumber = 0;
    let cumulativeTokens = 0;

    // Wrap streaming in sandbox context for infrastructure-level lifecycle management
    // This ensures all tools share the same sandbox instance
    // initProject: true auto-initializes the project structure before the agent starts
    return withSandbox(
      projectId,
      async () => {
        // Capture sandbox reference for onFinish callback (which runs after
        // AsyncLocalStorage context has exited)
        const { getCurrentSandbox } =
          await import("@/lib/e2b/sandbox-provider");
        const sandboxRef = getCurrentSandbox();
        let hasUnsyncedChanges = false;
        const pendingTokenUsage: Array<{
          project_id: string;
          model: string;
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          step_number: number;
          timestamp: string;
        }> = [];

        const openRouterEnabled = hasOpenRouterFallback();

        const streamErrorHandler = (error: unknown) => {
          if (NoSuchToolError.isInstance(error)) {
            return "I tried to use an unknown tool. Let me try a different approach.";
          }
          if (InvalidToolInputError.isInstance(error)) {
            return "I provided invalid input to a tool. Let me fix that and try again.";
          }
          return `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`;
        };

        const streamFinishHandler = async ({
          messages: finishedMessages,
        }: {
          messages: UIMessage[];
        }) => {
          const messagesWithFallbackText = ensureAssistantText(finishedMessages);

          // Save messages to database if projectId provided
          if (projectId && projectId !== DEFAULT_PROJECT_ID) {
            try {
              // Convert UIMessage array to our format and save
              // AI SDK v6: UIMessage only has parts, no content property
              // Cast parts across generic boundary (UIMessagePart<UIDataTypes, UITools> → UIMessagePart)
              const messagesToSave = messagesWithFallbackText.map((msg) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant" | "system",
                content:
                  msg.parts
                    ?.filter((p) => p.type === "text")
                    .map((p) => ("text" in p ? (p as { text: string }).text : ""))
                    .join("") || "",
                parts: msg.parts as MessageToSave["parts"],
              }));

              await messageService.saveConversation(projectId, messagesToSave);

              console.log(
                `[Chat] Saved ${messagesToSave.length} messages for project ${projectId}`,
              );
            } catch (dbError) {
              console.error("Failed to save messages:", dbError);
            }

            // Flush token usage as a single batch write to reduce DB write pressure.
            if (pendingTokenUsage.length > 0) {
              tokenUsageService
                .recordTokenUsageBatch(pendingTokenUsage)
                .then(() => {
                  log.debug("Token usage batch recorded", {
                    projectId,
                    records: pendingTokenUsage.length,
                  });
                })
                .catch((error) => {
                  log.error("Failed to record token usage batch:", {
                    error: error instanceof Error ? error.message : String(error),
                  });
                });
            }

            // Auto-heal placeholder project names from the active prompt-derived title.
            if (!isPlaceholderProjectName(defaultProjectName, projectId)) {
              projectService
                .getProject(projectId)
                .then((projectRecord) => {
                  if (isPlaceholderProjectName(projectRecord.name, projectId)) {
                    return projectService.updateProject(projectId, {
                      name: defaultProjectName,
                    });
                  }
                  return null;
                })
                .catch((error) => {
                  log.warn("Failed to auto-heal placeholder project name", {
                    projectId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                });
            }

            // Auto-sync project files to database at session end (safety net),
            // but skip if no unsynced file mutations were detected.
            if (sandboxRef && hasUnsyncedChanges) {
              try {
                const { quickSyncToDatabaseWithRetry } = await import(
                  "@/lib/e2b/sync-manager"
                );
                quickSyncToDatabaseWithRetry(sandboxRef, projectId)
                  .then(() => {
                    hasUnsyncedChanges = false;
                    console.log(`[Chat] Auto-synced project files for ${projectId}`);
                  })
                  .catch((syncError) =>
                    console.warn("[Chat] Session-end sync failed:", syncError),
                  );
              } catch (syncError) {
                console.warn("[Chat] Session-end sync failed:", syncError);
              }
            } else if (!hasUnsyncedChanges) {
              console.log(`[Chat] Skipped final sync for ${projectId} (no unsynced changes)`);
            }

            try {
              await flushContext(projectId);
            } catch (flushError) {
              console.warn("[Chat] Failed to flush agent context:", flushError);
            }
          }

          // Log completion summary with context
          const context = getAgentContext(projectId);
          console.log(
            `[Chat Complete] Project: ${projectId}, Steps: ${currentStepNumber}, Server: ${context.serverState?.isRunning ? "Running" : "Stopped"}`,
          );
        };

        const streamResponseOptions = {
          originalMessages: messages,
          onError: streamErrorHandler,
          onFinish: streamFinishHandler,
        };

        const createResult = (provider: "gateway" | "openrouter") => {
          const usingOpenRouter = provider === "openrouter";

          return streamText({
            model: usingOpenRouter
              ? getOpenRouterModel(modelKey)
              : getModel(modelKey),
            ...(!usingOpenRouter && {
              providerOptions: getGatewayProviderOptions(modelKey),
            }),
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

            // AI SDK v6: onError for stream-level error logging
            onError: ({ error }) => {
              log.error("streamText error", {
                projectId,
                provider,
                model: executionModel,
                step: currentStepNumber,
                error: error instanceof Error ? error.message : String(error),
              });
            },

            // AI SDK v6: onStepFinish callback for step tracking
            onStepFinish: async ({
              text,
              toolCalls,
              toolResults,
              finishReason,
              usage,
            }) => {
              currentStepNumber++;

              // Log step completion for debugging
              console.log(`[Step ${currentStepNumber}] Finished:`, {
                provider,
                finishReason,
                toolCallsCount: toolCalls?.length || 0,
                toolResultsCount: toolResults?.length || 0,
                textLength: text?.length || 0,
                tokensUsed: usage?.totalTokens,
              });

              for (const toolCall of toolCalls || []) {
                const toolName = (toolCall as { toolName?: string }).toolName;
                if (toolName && FILE_MUTATION_TOOLS.has(toolName)) {
                  hasUnsyncedChanges = true;
                }
              }

              for (const toolResult of toolResults || []) {
                const result = toolResult as {
                  toolName?: string;
                  toolCall?: { toolName?: string };
                  output?: unknown;
                };
                const toolName = result.toolName ?? result.toolCall?.toolName;
                if (!toolName) continue;

                if (FILE_MUTATION_TOOLS.has(toolName)) {
                  const success = getToolOutputSuccess(result.output);
                  if (success !== false) {
                    hasUnsyncedChanges = true;
                  }
                }

                if (toolName === "syncProject") {
                  const success = getToolOutputSuccess(result.output);
                  if (success !== false) {
                    hasUnsyncedChanges = false;
                  }
                }
              }

              // Track cumulative token usage and warn when approaching budget
              const stepTokens = usage?.totalTokens || 0;
              cumulativeTokens += stepTokens;
              const maxSteps = modelSettings.maxSteps || 50;
              const TOKEN_WARNING_THRESHOLD = 800_000;

              if (cumulativeTokens > TOKEN_WARNING_THRESHOLD) {
                log.warn("Approaching token budget", {
                  projectId,
                  step: currentStepNumber,
                  maxSteps,
                  cumulativeTokens,
                  threshold: TOKEN_WARNING_THRESHOLD,
                });
              }

              // Collect token usage and flush in batch on finish.
              if (usage && projectId && projectId !== DEFAULT_PROJECT_ID) {
                const promptTokens = usage.inputTokens || 0;
                const completionTokens = usage.outputTokens || 0;
                const totalTokens =
                  usage.totalTokens || promptTokens + completionTokens;

                if (totalTokens > 0) {
                  pendingTokenUsage.push({
                      project_id: projectId,
                      model: executionModel,
                      prompt_tokens: promptTokens,
                      completion_tokens: completionTokens,
                      total_tokens: totalTokens,
                      step_number: currentStepNumber,
                      timestamp: new Date().toISOString(),
                  });
                }
              }
            },

            // AI SDK v6: prepareStep for dynamic step configuration and activeTools
            prepareStep: async ({ stepNumber, messages: stepMessages }) => {
              const context = getAgentContext(projectId);
              const maxSteps = modelSettings.maxSteps || 50;
              const config: {
                messages?: typeof stepMessages;
                activeTools?: ToolName[];
              } = {};
              config.activeTools = DEFAULT_ACTIVE_TOOLS;

              // Model-aware compression thresholds
              // Keep multi-step loops cost-bounded even on large-context models.
              const isGeminiModel =
                executionModel === "google" || executionModel === "googlePro";
              const compressionThreshold = isGeminiModel ? 30 : 24;
              const keepCount = isGeminiModel ? 18 : 14;

              // For longer agentic loops, compress conversation history
              // CRITICAL: Must preserve tool_use/tool_result pairs to avoid API errors
              if (stepMessages.length >= compressionThreshold) {
                const keepWindow =
                  `before-last-${keepCount}-messages` as `before-last-${number}-messages`;

                const prunedMessages = pruneMessages({
                  messages: stepMessages,
                  toolCalls: keepWindow,
                  reasoning: "before-last-message",
                  emptyMessages: "remove",
                });

                // Preserve system context if pruning removes the leading system message.
                config.messages =
                  stepMessages[0]?.role === "system" &&
                  !prunedMessages.includes(stepMessages[0])
                    ? [stepMessages[0], ...prunedMessages]
                    : prunedMessages;

                console.log(
                  `[Step ${stepNumber}] Pruned from ${stepMessages.length} to ${config.messages.length} messages (window: ${keepWindow}, model: ${executionModel})`,
                );
              }

              // Force the model to synthesize a final response near the loop limit.
              if (stepNumber >= Math.max(1, maxSteps - 2)) {
                config.activeTools = [];
                log.debug("prepareStep: near step limit, disabling tools", {
                  stepNumber,
                  maxSteps,
                  activeTools: [],
                  reason: "step_limit",
                });
                return config;
              }

              // AI SDK v6: Dynamic activeTools based on context
              // This optimizes token usage by only including relevant tools
              let toolSelectionReason = "default";
              if (stepNumber === 0) {
                // First step: keep scope tight for reliable bootstrap behavior.
                // Prioritize batch writes to reduce tool-call count and latency.
                config.activeTools = BOOTSTRAP_ACTIVE_TOOLS;
                toolSelectionReason = "bootstrap";
              } else if (context.buildStatus?.hasErrors) {
                // Build errors: Focus on debugging and file operations
                config.activeTools = [
                  ...FILE_TOOLS,
                  ...BUILD_TOOLS,
                ] as ToolName[];
                toolSelectionReason = "build_errors";
              } else if (context.serverState?.isRunning && context.taskGraph) {
                // Server running with active task graph: Focus on file operations
                config.activeTools = [
                  ...FILE_TOOLS,
                  ...BUILD_TOOLS,
                ] as ToolName[];
                toolSelectionReason = "active_task_graph";
              }

              log.debug("prepareStep: tool selection", {
                stepNumber,
                maxSteps,
                activeToolCount: config.activeTools?.length ?? 0,
                activeTools: config.activeTools,
                reason: toolSelectionReason,
                hasErrors: !!context.buildStatus?.hasErrors,
                serverRunning: !!context.serverState?.isRunning,
                hasTaskGraph: !!context.taskGraph,
              });

              // Return empty object if no modifications needed
              return Object.keys(config).length > 0 ? config : {};
            },

            // AI SDK v6: Tool call repair for better error recovery
            experimental_repairToolCall: async ({ toolCall, error }) => {
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

                // LanguageModelV3ToolCall.input is a JSON string
                try {
                  const parsedInput = JSON.parse(toolCall.input) as Record<
                    string,
                    unknown
                  >;
                  const repairedInput = { ...parsedInput };

                  // Fix common path issues
                  if (typeof repairedInput.path === "string") {
                    // Remove leading slashes if present
                    repairedInput.path = repairedInput.path.replace(/^\/+/, "");
                  }

                  // Fix projectName issues
                  if (typeof repairedInput.projectName === "string") {
                    // Convert to lowercase with hyphens
                    repairedInput.projectName = repairedInput.projectName
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
                    input: JSON.stringify(repairedInput),
                  };
                } catch {
                  // If input can't be parsed, we can't repair
                  return null;
                }
              }

              // Return null if we can't repair
              return null;
            },
          });
        };

        try {
          return createResult("gateway").toUIMessageStreamResponse(
            streamResponseOptions,
          );
        } catch (gatewayError) {
          if (!openRouterEnabled) {
            throw gatewayError;
          }

          log.warn("Gateway stream initialization failed, using OpenRouter", {
            projectId,
            model: executionModel,
            error:
              gatewayError instanceof Error
                ? gatewayError.message
                : String(gatewayError),
          });

          return createResult("openrouter").toUIMessageStreamResponse(
            streamResponseOptions,
          );
        }
      },
      {
        projectDir: getProjectDir(),
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
