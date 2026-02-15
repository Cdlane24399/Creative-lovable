/**
 * Web Builder Agent - AI SDK v6 ToolLoopAgent
 *
 * Replaces the manual streamText orchestration in route.ts with a declarative
 * ToolLoopAgent that handles tool loops, step counting, and error recovery.
 *
 * This agent encapsulates:
 * - Model selection and Gateway routing
 * - Dynamic tool activation via prepareStep
 * - Token budget enforcement (soft/hard caps)
 * - Message pruning for long conversations
 * - Tool call repair for common input errors
 * - Step tracking and monitoring
 *
 * @see https://v6.ai-sdk.dev/docs/ai-sdk-core/agents
 */

import {
  ToolLoopAgent,
  stepCountIs,
  pruneMessages,
  NoSuchToolError,
  InvalidToolInputError,
} from "ai";
import { getModel, getGatewayProviderOptionsWithSearch } from "../providers";
import { SYSTEM_PROMPT, MODEL_SETTINGS, type ModelProvider } from "../agent";
import { generateAgenticSystemPrompt } from "../prompt-generator";
import { createContextAwareTools } from "../web-builder-agent";
import { getAgentContext } from "../agent-context";
import { logger } from "@/lib/logger";
import type { ModelKey } from "../providers";

// Tool group constants (mirrored from route.ts for consistency)
const PLANNING_TOOLS = ["planChanges", "analyzeProjectState"] as const;
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
const SEARCH_TOOLS = ["webSearch"] as const;
const SKILL_TOOLS = ["findSkills"] as const;
const RESEARCH_TOOLS = ["research"] as const;

type ToolName =
  | (typeof PLANNING_TOOLS)[number]
  | (typeof FILE_TOOLS)[number]
  | (typeof BUILD_TOOLS)[number]
  | (typeof SYNC_TOOLS)[number]
  | (typeof CODE_TOOLS)[number]
  | (typeof SEARCH_TOOLS)[number]
  | (typeof SKILL_TOOLS)[number]
  | (typeof RESEARCH_TOOLS)[number];

const DEFAULT_ACTIVE_TOOLS: ToolName[] = [
  ...PLANNING_TOOLS,
  ...FILE_TOOLS,
  ...BUILD_TOOLS,
  ...SYNC_TOOLS,
  ...CODE_TOOLS,
  ...SEARCH_TOOLS,
  ...SKILL_TOOLS,
  ...RESEARCH_TOOLS,
];

const BOOTSTRAP_ACTIVE_TOOLS: ToolName[] = [
  "analyzeProjectState",
  "planChanges",
  "getProjectStructure",
  "readFile",
  "writeFile",
  "editFile",
  "batchWriteFiles",
  "installPackage",
  "getBuildStatus",
  "syncProject",
  "webSearch",
  "findSkills",
  "research",
];

const FILE_MUTATION_TOOLS = new Set([
  "writeFile",
  "editFile",
  "batchWriteFiles",
  "initializeProject",
]);

/** Check if a tool output indicates success */
function getToolOutputSuccess(output: unknown): boolean | undefined {
  if (!output || typeof output !== "object") return undefined;
  const obj = output as Record<string, unknown>;
  if ("success" in obj) return Boolean(obj.success);
  if ("error" in obj && obj.error) return false;
  if ("filesReady" in obj) return Boolean(obj.filesReady);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceToDictionary(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }

      if (Array.isArray(parsed)) {
        return { items: parsed };
      }

      return { value: parsed };
    } catch {
      return { value: trimmed };
    }
  }

  if (Array.isArray(value)) {
    return { items: value };
  }

  if (value === null || value === undefined) {
    return {};
  }

  return { value };
}

function isToolCallPart(part: Record<string, unknown>): boolean {
  const partType = typeof part.type === "string" ? part.type : "";
  if (partType.includes("tool")) {
    return true;
  }

  return (
    "toolCallId" in part ||
    "toolName" in part ||
    ("name" in part && ("input" in part || "args" in part))
  );
}

/** Ensures tool-call parts have input/args as object (required by some providers) */
function ensureToolCallInputsAreObjects<
  T extends { role: string; content?: unknown },
>(messages: T[]): T[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) return msg;
    let changed = false;
    const newContent = msg.content.map((part: unknown) => {
      if (!isRecord(part) || !isToolCallPart(part)) {
        return part;
      }

      const updates: Record<string, unknown> = {};
      if ("input" in part && !isRecord(part.input)) {
        updates.input = coerceToDictionary(part.input);
      }
      if ("args" in part && !isRecord(part.args)) {
        updates.args = coerceToDictionary(part.args);
      }
      if (Object.keys(updates).length > 0) {
        changed = true;
        return { ...part, ...updates };
      }

      return part;
    });
    return (changed ? { ...msg, content: newContent } : msg) as T;
  });
}

export interface WebBuilderAgentOptions {
  projectId: string;
  model: ModelProvider;
  /** Callback when file mutation tools are called (for tracking unsynced changes) */
  onFileMutation?: () => void;
  /** Callback when syncProject succeeds (resets unsynced state) */
  onSyncComplete?: () => void;
  /** Callback for token usage per step */
  onTokenUsage?: (usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    stepNumber: number;
  }) => void;
}

/**
 * Create a ToolLoopAgent for the web builder.
 *
 * Encapsulates all the logic from route.ts's createResult/streamText/prepareStep
 * into a declarative agent definition.
 */
export function createWebBuilderAgent({
  projectId,
  model,
  onFileMutation,
  onSyncComplete,
  onTokenUsage,
}: WebBuilderAgentOptions) {
  const tools = createContextAwareTools(projectId);
  const systemPrompt = generateAgenticSystemPrompt(projectId, SYSTEM_PROMPT);
  const modelKey = model as ModelKey;
  const modelSettings = MODEL_SETTINGS[model];
  const maxSteps = modelSettings.maxSteps || 50;
  const log = logger.child({ projectId, operation: "web-builder-agent" });

  let currentStepNumber = 0;
  let cumulativeTokens = 0;

  const needsToolInputTransform =
    model === "minimax" || model === "moonshot" || model === "glm";

  return new ToolLoopAgent({
    model: getModel(modelKey),
    providerOptions: getGatewayProviderOptionsWithSearch(modelKey),
    instructions: systemPrompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    ...(modelSettings.maxOutputTokens && {
      maxOutputTokens: modelSettings.maxOutputTokens,
    }),

    onStepFinish: async ({
      toolCalls,
      toolResults,
      usage,
      finishReason,
      text,
    }) => {
      currentStepNumber++;

      log.debug("Step finished", {
        step: currentStepNumber,
        finishReason,
        toolCallsCount: toolCalls?.length || 0,
        toolResultsCount: toolResults?.length || 0,
        textLength: text?.length || 0,
        tokensUsed: usage?.totalTokens,
      });

      // Track file mutations for sync state
      for (const toolCall of toolCalls || []) {
        const toolName = (toolCall as { toolName?: string }).toolName;
        if (toolName && FILE_MUTATION_TOOLS.has(toolName)) {
          onFileMutation?.();
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
            onFileMutation?.();
          }
        }

        if (toolName === "syncProject") {
          const success = getToolOutputSuccess(result.output);
          if (success !== false) {
            onSyncComplete?.();
          }
        }
      }

      // Track cumulative token usage
      const stepTokens = usage?.totalTokens || 0;
      cumulativeTokens += stepTokens;

      if (cumulativeTokens > 500_000) {
        log.warn("Approaching token budget", {
          step: currentStepNumber,
          cumulativeTokens,
        });
      }

      // Report token usage
      if (usage) {
        const promptTokens = usage.inputTokens || 0;
        const completionTokens = usage.outputTokens || 0;
        const totalTokens =
          usage.totalTokens || promptTokens + completionTokens;

        if (totalTokens > 0) {
          onTokenUsage?.({
            promptTokens,
            completionTokens,
            totalTokens,
            stepNumber: currentStepNumber,
          });
        }
      }
    },

    prepareStep: async ({ stepNumber, messages: stepMessages }) => {
      const context = getAgentContext(projectId);
      const config: {
        messages?: typeof stepMessages;
        activeTools?: ToolName[];
      } = {};

      // Token budget enforcement: force graceful completion at hard cap
      const TOKEN_HARD_CAP = 600_000;
      if (cumulativeTokens > TOKEN_HARD_CAP) {
        config.activeTools = [];
        log.warn(
          "Token hard cap reached, disabling tools for graceful completion",
          { stepNumber, cumulativeTokens, cap: TOKEN_HARD_CAP },
        );
        if (needsToolInputTransform && stepMessages.length > 0) {
          config.messages = ensureToolCallInputsAreObjects(stepMessages);
        }
        return config;
      }

      // Model-aware compression thresholds
      const isGeminiModel = model === "google" || model === "googlePro";
      const compressionThreshold = isGeminiModel ? 30 : 24;
      const keepCount = isGeminiModel ? 18 : 14;

      // Compress conversation history for long agentic loops
      if (stepMessages.length >= compressionThreshold) {
        const keepWindow =
          `before-last-${keepCount}-messages` as `before-last-${number}-messages`;

        const prunedMessages = pruneMessages({
          messages: stepMessages,
          toolCalls: keepWindow,
          reasoning: "before-last-message",
          emptyMessages: "remove",
        });

        config.messages =
          stepMessages[0]?.role === "system" &&
          !prunedMessages.includes(stepMessages[0])
            ? [stepMessages[0], ...prunedMessages]
            : prunedMessages;

        log.debug("Message pruning", {
          stepNumber,
          originalCount: stepMessages.length,
          prunedCount: config.messages.length,
          keepWindow,
          model,
        });
      }

      // Force final text response near the loop limit
      if (stepNumber >= Math.max(1, maxSteps - 2)) {
        config.activeTools = [];
        log.debug("prepareStep: near step limit, disabling tools", {
          stepNumber,
          maxSteps,
          reason: "step_limit",
        });
        if (needsToolInputTransform && stepMessages.length > 0) {
          config.messages = ensureToolCallInputsAreObjects(stepMessages);
        }
        return config;
      }

      // Soft token budget: restrict to essential tools
      const TOKEN_SOFT_CAP = 500_000;
      const isTokenConstrained = cumulativeTokens > TOKEN_SOFT_CAP;
      let toolSelectionReason = "default";

      if (isTokenConstrained) {
        config.activeTools = [
          ...FILE_TOOLS,
          ...BUILD_TOOLS,
          ...SYNC_TOOLS,
        ] as ToolName[];
        toolSelectionReason = "token_constrained";
      } else if (stepNumber === 0) {
        // Force research first for new projects (no existing files in context)
        const isNewProject = !context.files || context.files.size === 0;
        if (isNewProject) {
          config.activeTools = BOOTSTRAP_ACTIVE_TOOLS;
          // Force the model to call research before anything else
          (config as Record<string, unknown>).toolChoice = {
            type: "tool",
            toolName: "research",
          };
          toolSelectionReason = "forced_research_new_project";
        } else {
          config.activeTools = BOOTSTRAP_ACTIVE_TOOLS;
          toolSelectionReason = "bootstrap";
        }
      } else if (context.buildStatus?.hasErrors) {
        config.activeTools = [...FILE_TOOLS, ...BUILD_TOOLS] as ToolName[];
        toolSelectionReason = "build_errors";
      } else if (context.serverState?.isRunning && context.taskGraph) {
        config.activeTools = [...FILE_TOOLS, ...BUILD_TOOLS] as ToolName[];
        toolSelectionReason = "active_task_graph";
      } else {
        config.activeTools = DEFAULT_ACTIVE_TOOLS;
      }

      log.debug("prepareStep: tool selection", {
        stepNumber,
        maxSteps,
        activeToolCount: config.activeTools?.length ?? 0,
        reason: toolSelectionReason,
        hasErrors: !!context.buildStatus?.hasErrors,
        serverRunning: !!context.serverState?.isRunning,
        hasTaskGraph: !!context.taskGraph,
      });

      // Apply tool-input transform for providers that need object inputs
      if (needsToolInputTransform) {
        const baseMessages = config.messages ?? stepMessages;
        if (baseMessages.length > 0) {
          config.messages = ensureToolCallInputsAreObjects(baseMessages);
        }
      }

      return config;
    },

    // AI SDK v6: Tool call repair for better error recovery
    experimental_repairToolCall: async ({ toolCall, error }) => {
      if (NoSuchToolError.isInstance(error)) {
        log.warn("Tool repair: unknown tool", { tool: toolCall.toolName });
        return null;
      }

      if (InvalidToolInputError.isInstance(error)) {
        log.debug("Tool repair: fixing invalid input", {
          tool: toolCall.toolName,
        });

        try {
          const repairedInput = { ...coerceToDictionary(toolCall.input) };

          // Fix common path issues
          if (typeof repairedInput.path === "string") {
            repairedInput.path = repairedInput.path.replace(/^\/+/, "");
          }

          // Recover common aliases the model may use for writeFile/editFile
          if (typeof repairedInput.path !== "string") {
            const pathAlias =
              typeof repairedInput.filePath === "string"
                ? repairedInput.filePath
                : typeof repairedInput.filename === "string"
                  ? repairedInput.filename
                  : typeof repairedInput.file === "string"
                    ? repairedInput.file
                    : undefined;
            if (pathAlias) {
              repairedInput.path = pathAlias.replace(/^\/+/, "");
            }
          }

          if (typeof repairedInput.content !== "string") {
            const contentAlias =
              typeof repairedInput.contents === "string"
                ? repairedInput.contents
                : typeof repairedInput.text === "string"
                  ? repairedInput.text
                  : typeof repairedInput.code === "string"
                    ? repairedInput.code
                    : undefined;
            if (contentAlias) {
              repairedInput.content = contentAlias;
            }
          }

          // Fix projectName issues
          if (typeof repairedInput.projectName === "string") {
            repairedInput.projectName = repairedInput.projectName
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "");
          }

          // Normalize malformed files payloads
          if (
            repairedInput.files &&
            !Array.isArray(repairedInput.files) &&
            isRecord(repairedInput.files)
          ) {
            repairedInput.files = Object.entries(repairedInput.files).map(
              ([path, value]) => {
                if (isRecord(value)) {
                  const normalized = { ...value };
                  if (typeof normalized.path !== "string") {
                    normalized.path = path;
                  }
                  if (
                    typeof normalized.content !== "string" &&
                    typeof normalized.contents === "string"
                  ) {
                    normalized.content = normalized.contents;
                  }
                  if (
                    typeof normalized.content !== "string" &&
                    typeof normalized.text === "string"
                  ) {
                    normalized.content = normalized.text;
                  }
                  return normalized;
                }

                return {
                  path,
                  content: typeof value === "string" ? value : String(value),
                };
              },
            );
          }

          return {
            ...toolCall,
            input: JSON.stringify(repairedInput),
          };
        } catch {
          return null;
        }
      }

      return null;
    },
  });
}
