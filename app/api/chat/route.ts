/**
 * Chat API Route - AI SDK v6 Implementation
 *
 * Key v6 Patterns Used:
 * - ToolLoopAgent with createAgentUIStreamResponse for declarative agent orchestration
 * - createWebBuilderAgent encapsulates prepareStep, error recovery, token budgets
 * - toUIMessageStreamResponse() for streaming to frontend
 * - convertToModelMessages (v6 renamed from convertToCoreMessages)
 * - validateUIMessages for message validation
 * - NoSuchToolError, InvalidToolInputError for type-safe error handling
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-core/agents
 * @see https://ai-sdk.dev/docs/ai-sdk-core/streaming
 */
import { NextResponse } from "next/server";
import {
  validateUIMessages,
  createAgentUIStreamResponse,
  type UIMessage,
} from "ai";
import { MODEL_SETTINGS, type ModelProvider } from "@/lib/ai/agent";
import { createWebBuilderAgent } from "@/lib/ai/agents/web-builder";
import {
  deriveProjectNameFromMessages,
  isPlaceholderProjectName,
} from "@/lib/ai/project-naming";
import { ensureAssistantText } from "@/lib/ai/chat-optimizations";
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
import { withSandbox, getCurrentSandbox } from "@/lib/e2b/sandbox-provider";
import { getProjectDir } from "@/lib/e2b/project-dir";
import { quickSyncToDatabaseWithRetry } from "@/lib/e2b/sync-manager";

export const maxDuration = 300;

// Default project ID for sandbox operations
const DEFAULT_PROJECT_ID = "default";

// Export type for the chat messages
export type ChatMessage = UIMessage;

// Chat route uses its own checkChatRateLimit, skip the general rate limit in withAuth
export const POST = withAuth(
  async (req: Request) => {
    const requestId = req.headers.get("x-request-id") ?? "unknown";
    const log = logger.child({ requestId, operation: "chat" });

    // Check rate limit for chat endpoint
    const rateLimit = await checkChatRateLimit(req);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      log.warn("Rate limit exceeded", { retryAfter });
      return NextResponse.json(
        {
          error:
            "Rate limit exceeded. Please wait before sending more messages.",
          retryAfter,
        },
        {
          status: 429,
          headers: {
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

      // Validate requested model exists, fallback to anthropic
      const requestedModel = (
        model in MODEL_SETTINGS ? model : "anthropic"
      ) as ModelProvider;

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

      const executionModel = requestedModel;

      log.info("Chat request received", {
        projectId,
        requestedModel: model,
        executionModel,
        defaultProjectName,
        messageCount: rawMessages.length,
      });

      // Ensure project exists in database BEFORE any tool calls can trigger context saves
      if (projectId && projectId !== DEFAULT_PROJECT_ID) {
        await projectService
          .ensureProjectExists(projectId, defaultProjectName)
          .catch((dbError) => {
            log.warn("Failed to ensure project exists", { projectId }, dbError);
          });
      }

      // Initialize project info if this is a new session
      if (!isPlaceholderProjectName(defaultProjectName, projectId)) {
        setProjectInfo(projectId, { projectName: defaultProjectName });
      }

      // Track file mutation state and token usage for onFinish
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

      // Create the ToolLoopAgent with lifecycle callbacks.
      // The agent encapsulates: model selection, system prompt, tools,
      // prepareStep (token budgets, pruning, activeTools), onStepFinish,
      // and experimental_repairToolCall.
      const agent = createWebBuilderAgent({
        projectId,
        model: executionModel,
        onFileMutation: () => {
          hasUnsyncedChanges = true;
        },
        onSyncComplete: () => {
          hasUnsyncedChanges = false;
        },
        onTokenUsage: (usage) => {
          if (projectId && projectId !== DEFAULT_PROJECT_ID) {
            pendingTokenUsage.push({
              project_id: projectId,
              model: executionModel,
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
              total_tokens: usage.totalTokens,
              step_number: usage.stepNumber,
              timestamp: new Date().toISOString(),
            });
          }
        },
      });

      // Wrap streaming in sandbox context for shared sandbox instance.
      // initProject: true auto-initializes the project structure before the agent starts.
      return withSandbox(
        projectId,
        async () => {
          // Capture sandbox reference for onFinish callback (which runs after
          // AsyncLocalStorage context has exited)
          const sandboxRef = getCurrentSandbox();

          // AI SDK v6: createAgentUIStreamResponse drives the ToolLoopAgent,
          // streams UIMessageStreamParts to the client, and calls onFinish
          // when the stream completes.
          return createAgentUIStreamResponse({
            agent,
            uiMessages: messages,
            abortSignal: req.signal,
            originalMessages: messages as never[],
            onFinish: async ({ messages: finishedMessages }) => {
              const messagesWithFallbackText =
                ensureAssistantText(finishedMessages);

              // Save messages to database
              if (projectId && projectId !== DEFAULT_PROJECT_ID) {
                try {
                  // AI SDK v6: UIMessage only has parts, no content property
                  const messagesToSave = messagesWithFallbackText.map(
                    (msg) => ({
                      id: msg.id,
                      role: msg.role as "user" | "assistant" | "system",
                      content:
                        msg.parts
                          ?.filter((p) => p.type === "text")
                          .map((p) =>
                            "text" in p ? (p as { text: string }).text : "",
                          )
                          .join("") || "",
                      parts: msg.parts as MessageToSave["parts"],
                    }),
                  );

                  await messageService.saveConversation(
                    projectId,
                    messagesToSave,
                  );
                  log.info("Messages saved", {
                    projectId,
                    count: messagesToSave.length,
                  });
                } catch (dbError) {
                  log.error("Failed to save messages", { projectId }, dbError);
                }

                // Flush token usage as a single batch write
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
                      log.error("Failed to record token usage batch", {
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      });
                    });
                }

                // Auto-heal placeholder project names
                if (!isPlaceholderProjectName(defaultProjectName, projectId)) {
                  projectService
                    .getProject(projectId)
                    .then((projectRecord) => {
                      if (
                        isPlaceholderProjectName(projectRecord.name, projectId)
                      ) {
                        return projectService.updateProject(projectId, {
                          name: defaultProjectName,
                        });
                      }
                      return null;
                    })
                    .catch((error) => {
                      log.warn("Failed to auto-heal placeholder project name", {
                        projectId,
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      });
                    });
                }

                // Auto-sync project files to database (safety net)
                if (sandboxRef && hasUnsyncedChanges) {
                  quickSyncToDatabaseWithRetry(sandboxRef, projectId)
                    .then(() => {
                      hasUnsyncedChanges = false;
                      log.info("Auto-synced project files", { projectId });
                    })
                    .catch((syncError) =>
                      log.warn(
                        "Session-end sync failed",
                        { projectId },
                        syncError,
                      ),
                    );
                } else if (!hasUnsyncedChanges) {
                  log.debug("Skipped final sync (no unsynced changes)", {
                    projectId,
                  });
                }

                try {
                  await flushContext(projectId);
                } catch (flushError) {
                  log.warn(
                    "Failed to flush agent context",
                    { projectId },
                    flushError,
                  );
                }
              }

              // Log completion summary
              const context = getAgentContext(projectId);
              log.info("Chat complete", {
                projectId,
                steps: pendingTokenUsage.length,
                serverRunning: !!context.serverState?.isRunning,
              });
            },
          });
        },
        {
          projectDir: getProjectDir(),
          autoPause: true,
          initProject: true,
        },
      );
    } catch (error) {
      log.error("Chat API error", { projectId: "unknown" }, error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to process chat request";

      return NextResponse.json(
        { error: errorMessage, timestamp: new Date().toISOString() },
        { status: 500 },
      );
    }
  },
  { skipRateLimit: true },
);
