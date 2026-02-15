"use client";

import type React from "react";
import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  useMemo,
} from "react";
import { useChatWithTools } from "@/hooks/use-chat-with-tools";
import { type ModelProvider } from "@/lib/ai/agent";
import { MessageList } from "@/components/chat/message-list";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputStatus,
} from "@/components/chat/prompt-input";
import type { MessagePart } from "@/components/chat/message";
import { parseToolOutputs } from "@/lib/parsers/tool-outputs";
import {
  PlanProgress,
  extractPlanState,
} from "@/components/chat/plan-progress";
import {
  useEditorChatActions,
  useEditorMeta,
} from "@/components/contexts/editor-context";

const VALID_MODEL_KEYS = new Set<ModelProvider>([
  "anthropic",
  "opus",
  "google",
  "googlePro",
  "openai",
  "minimax",
  "moonshot",
  "glm",
]);

const FILE_WRITE_TOOL_TYPES = new Set([
  "tool-writeFile",
  "tool-editFile",
  "tool-batchWriteFiles",
  "tool-initializeProject",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOutputAvailableToolPart(
  part: unknown,
): part is Record<string, unknown> {
  if (!isRecord(part)) return false;
  return (
    typeof part.type === "string" &&
    part.type.startsWith("tool-") &&
    part.state === "output-available"
  );
}

function hasFileWriteOutput(part: unknown): boolean {
  return (
    isOutputAvailableToolPart(part) &&
    typeof part.type === "string" &&
    FILE_WRITE_TOOL_TYPES.has(part.type)
  );
}

function getProjectNameFromToolPart(part: unknown): string | undefined {
  if (!isOutputAvailableToolPart(part)) return undefined;
  if (!isRecord(part.output)) return undefined;
  const projectName = part.output.projectName;
  return typeof projectName === "string" && projectName.length > 0
    ? projectName
    : undefined;
}

function getFallbackProjectName(
  messages: Array<{ parts?: unknown[] }>,
): string {
  const projectNames = messages.flatMap((message) =>
    (message.parts || [])
      .map((part) => getProjectNameFromToolPart(part))
      .filter((projectName): projectName is string => Boolean(projectName)),
  );
  return projectNames.pop() || "project";
}

// Exported handle type for programmatic control
export interface ChatPanelHandle {
  sendMessage: (text: string) => void;
}

interface ChatPanelProps {
  ref?: React.Ref<ChatPanelHandle>;
}

export function ChatPanel({ ref }: ChatPanelProps) {
  const { handleSandboxUrlUpdate, handleFilesReady } = useEditorChatActions();
  const meta = useEditorMeta();
  const {
    projectId,
    initialPrompt,
    initialModel,
    savedMessages,
    messagesLoaded,
  } = meta;

  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelProvider>(
    initialModel || "anthropic",
  );
  const [lastError, setLastError] = useState<Error | null>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [showImproveEffect, setShowImproveEffect] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoSentRef = useRef(false);

  // Load saved model preference from localStorage
  useEffect(() => {
    if (!projectId) return;

    const savedModel = localStorage.getItem(`project-model-${projectId}`);
    if (!savedModel || !VALID_MODEL_KEYS.has(savedModel as ModelProvider))
      return;

    setSelectedModel((prev) => {
      const nextModel = savedModel as ModelProvider;
      return prev === nextModel ? prev : nextModel;
    });
  }, [projectId]);

  const handleChatError = useCallback((error: Error) => {
    console.error("Chat error:", error);
    setLastError(error);
  }, []);

  const {
    messages,
    sendMessage,
    isWorking,
    isCallingTools,
    getThinkingTime,
    stop,
    addToolApprovalResponse,
  } = useChatWithTools({
    projectId,
    model: selectedModel,
    initialMessages: savedMessages,
    messagesLoaded,
    onError: handleChatError,
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim()) return;

      const content = inputValue.trim();
      setInputValue("");
      setLastError(null); // Clear error on new submission

      await sendMessage({ text: content });
    },
    [inputValue, sendMessage],
  );

  const handleRetry = useCallback(() => {
    setLastError(null); // Clear error on retry
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMessage) {
      const textPart = (lastUserMessage.parts as MessagePart[]).find(
        (p) => p.type === "text",
      );
      if (textPart && textPart.type === "text") {
        sendMessage({
          text: (textPart as { type: "text"; text: string }).text,
        });
      }
    }
  }, [messages, sendMessage]);

  const typewriterEffect = useCallback(async (text: string) => {
    setShowImproveEffect(true);
    setInputValue("");

    await new Promise((r) => setTimeout(r, 200));

    for (let i = 0; i <= text.length; i++) {
      setInputValue(text.slice(0, i));
      const delay = Math.random() * 20 + 10;
      await new Promise((r) => setTimeout(r, delay));
    }

    setShowImproveEffect(false);
  }, []);

  const handleImprovePrompt = useCallback(async () => {
    if (!inputValue.trim() || isImproving || isWorking) return;

    setIsImproving(true);

    try {
      const response = await fetch("/api/improve-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: inputValue }),
      });

      if (!response.ok) throw new Error("Failed to improve prompt");

      const { improvedPrompt } = await response.json();

      await typewriterEffect(improvedPrompt);
      textareaRef.current?.focus();
    } catch (error) {
      console.error("Failed to improve prompt:", error);
    } finally {
      setIsImproving(false);
    }
  }, [inputValue, isImproving, isWorking, typewriterEffect]);

  const handleSelectSuggestion = useCallback(
    (suggestion: string) => {
      if (isWorking) return;
      sendMessage({ text: suggestion });
    },
    [isWorking, sendMessage],
  );

  // Save model preference when it changes
  useEffect(() => {
    if (projectId && selectedModel) {
      localStorage.setItem(`project-model-${projectId}`, selectedModel);
    }
  }, [projectId, selectedModel]);

  // Expose sendMessage via ref for programmatic control
  useImperativeHandle(
    ref,
    () => ({
      sendMessage: (text: string) => {
        sendMessage({ text });
      },
    }),
    [sendMessage],
  );

  // Auto-send initial prompt from landing page
  useEffect(() => {
    if (initialPrompt && !hasAutoSentRef.current && messages.length === 0) {
      hasAutoSentRef.current = true;
      sendMessage({ text: initialPrompt });
    }
  }, [initialPrompt, messages.length, sendMessage]);

  // Track which tool outputs we've already processed
  const processedToolOutputsRef = useRef<Set<string>>(new Set());
  const filesReadyTriggeredRef = useRef(false);

  // Extract tool outputs -- notify EditorContext via actions (no callback props)
  useEffect(() => {
    const { latestPreviewUrl, filesReadyInfo } = parseToolOutputs(
      messages,
      processedToolOutputsRef.current,
    );

    if (latestPreviewUrl) {
      if (process.env.NODE_ENV === "development")
        console.log("[ChatPanel] Got previewUrl from tool:", latestPreviewUrl);
      handleSandboxUrlUpdate(latestPreviewUrl);
    }

    if (filesReadyInfo) {
      console.log(
        "[ChatPanel] Files ready, project:",
        filesReadyInfo.projectName,
        "sandboxId:",
        filesReadyInfo.sandboxId,
      );
      filesReadyTriggeredRef.current = true;
      handleFilesReady(filesReadyInfo.projectName, filesReadyInfo.sandboxId);
    }
  }, [messages, handleSandboxUrlUpdate, handleFilesReady]);

  // Safety net when tools wrote files without emitting filesReady.
  const wasWorkingRef = useRef(false);
  useEffect(() => {
    if (isWorking) {
      if (!wasWorkingRef.current) {
        filesReadyTriggeredRef.current = false;
      }
      wasWorkingRef.current = true;
      return;
    }

    if (!wasWorkingRef.current) {
      return;
    }

    wasWorkingRef.current = false;
    if (filesReadyTriggeredRef.current) {
      return;
    }

    const { filesReadyInfo } = parseToolOutputs(messages, new Set());
    const hasFileWrites = messages.some(
      (m) =>
        m.role === "assistant" &&
        m.parts?.some((part) => hasFileWriteOutput(part)),
    );

    if (hasFileWrites && !filesReadyInfo) {
      console.log(
        "[ChatPanel] Chat completed with file writes but no filesReady signal, triggering fallback dev server start",
      );
      const projectName = getFallbackProjectName(messages);
      handleFilesReady(projectName);
    }
  }, [isWorking, messages, handleFilesReady]);

  // Extract plan state from messages for the floating checklist
  // Cast needed: AI SDK UIMessagePart includes types (e.g. ReasoningUIPart) not
  // in our local MessagePart union, but extractPlanState only inspects tool-* parts.
  const planState = useMemo(
    () =>
      extractPlanState(
        messages as Array<{ role: string; parts?: MessagePart[] }>,
      ),
    [messages],
  );

  return (
    <div className="flex h-full flex-col bg-[#111111]">
      {/* Messages Area */}
      <Conversation className="px-4 py-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          <MessageList
            messages={messages}
            isWorking={isWorking}
            isCallingTools={isCallingTools}
            error={lastError}
            onRetry={handleRetry}
            getThinkingTime={getThinkingTime}
            onSelectSuggestion={handleSelectSuggestion}
            onToolApprove={(toolCallId) =>
              addToolApprovalResponse({ id: toolCallId, approved: true })
            }
            onToolDeny={(toolCallId) =>
              addToolApprovalResponse({ id: toolCallId, approved: false })
            }
          />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input Area */}
      <div className="p-4 pt-2">
        {planState && <PlanProgress plan={planState} isWorking={isWorking} />}
        <PromptInput
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSubmit={handleSubmit}
          onStop={stop}
          status={
            isWorking
              ? "working"
              : isImproving
                ? "improving"
                : ("idle" as PromptInputStatus)
          }
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          onImprovePrompt={handleImprovePrompt}
          showImproveEffect={showImproveEffect}
          inputRef={textareaRef}
        />
      </div>
    </div>
  );
}
