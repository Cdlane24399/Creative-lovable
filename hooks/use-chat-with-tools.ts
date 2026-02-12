"use client";

import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatMessage } from "@/app/api/chat/route";
import type { Message, MessagePart } from "@/lib/db/types";
import type { ModelProvider } from "@/lib/ai/agent";

// Progress state for a single tool call (for future use with data streaming)
export interface ToolProgress {
  toolCallId: string;
  toolName: string;
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  timestamp: number;
  filesWritten: string[];
}

// Thinking time for a message (in seconds)
export interface ThinkingTime {
  messageId: string;
  durationSeconds: number;
}

interface UseChatWithToolsOptions {
  projectId?: string;
  model?: ModelProvider;
  onError?: (error: Error) => void;
  /** Initial messages to restore from database */
  initialMessages?: Message[];
  /** True once the initial messages fetch has completed for this projectId (even if it returns empty) */
  messagesLoaded?: boolean;
  /** Called when messages should be saved */
  onMessagesSaved?: () => void;
}

/**
 * Convert database messages to AI SDK message format.
 * Handles the parts field which may contain tool calls.
 */
function convertDbMessagesToAiMessages(dbMessages: Message[]): ChatMessage[] {
  return dbMessages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    parts: msg.parts || [{ type: "text", text: msg.content }],
    createdAt: new Date(msg.created_at),
  })) as ChatMessage[];
}

/**
 * Enhanced chat hook with context-aware tool support.
 *
 * In AI SDK v6, tools with execute functions run server-side and results
 * are streamed back automatically. This hook provides:
 * - Multi-model support (Anthropic, Google, OpenAI)
 * - Project context tracking via projectId
 * - Convenient status helpers for UI state management
 * - Initial message restoration from database
 * - Message persistence handled by API route's onFinish callback
 */
export function useChatWithTools({
  projectId,
  model = "anthropic",
  onError,
  initialMessages,
  messagesLoaded,
  onMessagesSaved,
}: UseChatWithToolsOptions = {}) {
  // Track last saved message count for reference
  // Initialize to the count of initial messages
  // Note: Auto-save is handled by API route's onFinish callback to avoid race conditions
  const lastSavedCountRef = useRef(initialMessages?.length || 0);

  // Track thinking time for each message
  const [thinkingTimes, setThinkingTimes] = useState<Map<string, number>>(
    new Map(),
  );
  const thinkingStartRef = useRef<number | null>(null);

  // Convert initial messages to AI SDK format
  const convertedInitialMessages = useMemo(() => {
    if (!initialMessages || initialMessages.length === 0) return undefined;
    return convertDbMessagesToAiMessages(initialMessages);
  }, [initialMessages]);

  // Track the last projectId we restored for
  const lastRestoredProjectIdRef = useRef<string | null>(null);

  // Recreate transport when model or projectId changes to ensure correct model is used
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { projectId, model },
      }),
    [projectId, model],
  );

  const chat = useChat<ChatMessage>({
    transport,
    messages: convertedInitialMessages,
    experimental_throttle: 50,
    onError: (error) => {
      console.error("Chat error:", error);
      onError?.(error);
    },
  });

  // Restore messages when project changes
  useEffect(() => {
    if (!projectId) return;

    // Skip if we already restored for this project
    if (lastRestoredProjectIdRef.current === projectId) return;

    // If messages haven't finished loading yet, don't make any decisions.
    // This prevents a race where we clear messages + mark the project as restored
    // before the async fetch returns the real history.
    if (
      !messagesLoaded &&
      (!convertedInitialMessages || convertedInitialMessages.length === 0)
    ) {
      return;
    }

    if (convertedInitialMessages && convertedInitialMessages.length > 0) {
      console.log(
        "[useChatWithTools] Restoring",
        convertedInitialMessages.length,
        "messages for project",
        projectId,
      );
      chat.setMessages(convertedInitialMessages);
      lastRestoredProjectIdRef.current = projectId;
      lastSavedCountRef.current = convertedInitialMessages.length;
    } else {
      // Clear messages when switching to a new project with no history
      chat.setMessages([]);
      lastRestoredProjectIdRef.current = projectId;
      lastSavedCountRef.current = 0;
    }
  }, [projectId, messagesLoaded, convertedInitialMessages, chat.setMessages]);

  // Helper to get progress for a specific tool call (placeholder for future data streaming)
  const getToolProgress = useCallback(
    (_toolCallId: string): ToolProgress | undefined => {
      // In a future version with data streaming, this would return real-time progress
      return undefined;
    },
    [],
  );

  // Extract useful state from messages
  const lastMessage = chat.messages[chat.messages.length - 1];
  const isAssistantMessage = lastMessage?.role === "assistant";

  // Check if the last message has active tool calls (for showing progress)
  const hasActiveToolCalls =
    isAssistantMessage &&
    lastMessage?.parts?.some(
      (part: { type: string; state?: string }) =>
        part.type.startsWith("tool-") &&
        (part.state === "input-streaming" || part.state === "input-available"),
    );

  // Manual save function (kept for compatibility but not used for auto-save)
  // Note: Auto-save is handled by API route's onFinish to avoid race conditions
  const saveMessages = useCallback(async () => {
    if (!projectId || chat.messages.length === 0) return;
    if (chat.messages.length === lastSavedCountRef.current) return;

    try {
      // Convert messages to the format expected by the API
      const messagesToSave = chat.messages.map((msg) => {
        // Extract text content from parts
        const textContent =
          msg.parts
            ?.filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .join("") || "";

        return {
          id: msg.id,
          role: msg.role as "user" | "assistant" | "system",
          content: textContent,
          parts: msg.parts as MessagePart[],
        };
      });

      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messagesToSave),
      });

      if (response.ok) {
        lastSavedCountRef.current = chat.messages.length;
        console.log(
          `[useChatWithTools] Manually saved ${messagesToSave.length} messages for project ${projectId}`,
        );
        onMessagesSaved?.();
      } else {
        console.error(
          "[useChatWithTools] Failed to save messages:",
          await response.text(),
        );
      }
    } catch (error) {
      console.error("[useChatWithTools] Error saving messages:", error);
    }
  }, [projectId, chat.messages, onMessagesSaved]);

  // Track thinking time (submitted -> streaming transition)
  useEffect(() => {
    // Start timer when entering "submitted" state
    if (chat.status === "submitted" && thinkingStartRef.current === null) {
      thinkingStartRef.current = Date.now();
    }

    // Record duration when transitioning to "streaming" or "ready"
    if (
      (chat.status === "streaming" || chat.status === "ready") &&
      thinkingStartRef.current !== null
    ) {
      const duration = Math.round(
        (Date.now() - thinkingStartRef.current) / 1000,
      );
      thinkingStartRef.current = null;

      // Find the current assistant message and record thinking time
      const lastAssistantMsg = [...chat.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (lastAssistantMsg && duration > 0) {
        setThinkingTimes((prev) => {
          const next = new Map(prev);
          // Only set if not already recorded for this message
          if (!next.has(lastAssistantMsg.id)) {
            next.set(lastAssistantMsg.id, duration);
          }
          return next;
        });
      }
    }
  }, [chat.status, chat.messages]);

  // Helper to get thinking time for a message
  const getThinkingTime = useCallback(
    (messageId: string): number | undefined => {
      return thinkingTimes.get(messageId);
    },
    [thinkingTimes],
  );

  return {
    ...chat,
    // Helper to check if AI is currently working
    // Status can be 'submitted', 'streaming', 'ready', or 'error'
    isWorking: chat.status === "submitted" || chat.status === "streaming",
    // More granular: is the model actively calling tools?
    isCallingTools: hasActiveToolCalls,
    // Helper to get the last message
    lastMessage,
    // Helper to get only assistant messages (for tool result extraction)
    assistantMessages: chat.messages.filter((m) => m.role === "assistant"),
    // Placeholder for future real-time progress
    getToolProgress,
    // Flag to check if chat was restored from history
    hasRestoredHistory:
      convertedInitialMessages !== undefined &&
      convertedInitialMessages.length > 0,
    // Manual save function (for explicit saves only - auto-save handled by API route)
    saveMessages,
    // Get thinking time for a message (in seconds)
    getThinkingTime,
    // Stop the current streaming response
    stop: chat.stop,
  };
}
