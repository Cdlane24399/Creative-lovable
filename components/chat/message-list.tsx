"use client";

import React, { useMemo } from "react";
import { Message, type MessagePart } from "./message";
import type { UIMessage } from "ai";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { ChatError } from "./chat-error";

// Heuristic suggestion rules — moved from suggestion-chips.tsx during ai-elements migration
const HEURISTIC_RULES: Array<{ keywords: string[]; suggestions: string[] }> = [
  {
    keywords: ["auth", "login", "signup", "user"],
    suggestions: [
      "Add forgot-password flow",
      "Add social sign-in",
      "Add account settings page",
      "Add role-based access",
    ],
  },
  {
    keywords: ["dashboard", "analytics", "metrics", "chart"],
    suggestions: [
      "Add date-range filters",
      "Add export to CSV",
      "Add realtime metrics",
      "Add drill-down charts",
    ],
  },
  {
    keywords: ["ecommerce", "shop", "cart", "product", "checkout"],
    suggestions: [
      "Add product search",
      "Add saved favorites",
      "Add order history",
      "Add checkout validation",
    ],
  },
  {
    keywords: ["landing", "marketing", "hero", "homepage"],
    suggestions: [
      "Add testimonials section",
      "Add pricing comparison",
      "Add FAQ accordion",
      "Add conversion tracking",
    ],
  },
];

const defaultSuggestions = [
  "Add loading skeletons",
  "Add empty state UX",
  "Add keyboard shortcuts",
  "Add mobile polish",
];

function buildHeuristicSuggestions(contextText?: string): string[] {
  const normalized = (contextText || "").toLowerCase();
  for (const rule of HEURISTIC_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.suggestions;
    }
  }
  return defaultSuggestions;
}

// Hoisted static JSX — avoids recreating element tree on every render
const typingIndicator = (
  <div className="flex items-center gap-2 px-1 py-2 text-sm text-zinc-500">
    <div className="flex gap-1.5">
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500/50 [animation-delay:-0.3s]" />
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500/50 [animation-delay:-0.15s]" />
      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500/50" />
    </div>
  </div>
);

const toolCallingIndicator = (
  <div className="flex items-center gap-2 px-1 py-2 text-sm text-zinc-500">
    <div className="h-3 w-3 animate-spin rounded-full border border-emerald-500/50 border-t-emerald-400" />
    <span>Working on your request...</span>
  </div>
);

function getMessageText(message: UIMessage | undefined): string {
  if (!message || !message.parts) return "";
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? (part as { text: string }).text : ""))
    .join(" ")
    .trim();
}

interface MessageListProps {
  messages: UIMessage[];
  isWorking: boolean;
  isCallingTools: boolean;
  error: Error | null;
  onRetry: () => void;
  getThinkingTime?: (messageId: string) => number | undefined;
  onSelectSuggestion?: (suggestion: string) => void;
  onToolApprove?: (toolCallId: string) => void;
  onToolDeny?: (toolCallId: string) => void;
}

export const MessageList = React.memo(
  function MessageList({
    messages,
    isWorking,
    isCallingTools,
    error,
    onRetry,
    getThinkingTime,
    onSelectSuggestion,
    onToolApprove,
    onToolDeny,
  }: MessageListProps) {
    const uniqueMessages = useMemo(
      () => [
        ...new Map(messages.map((message) => [message.id, message])).values(),
      ],
      [messages],
    );

    const lastAssistantMessage = useMemo(
      () =>
        [...uniqueMessages]
          .reverse()
          .find((message) => message.role === "assistant"),
      [uniqueMessages],
    );

    if (uniqueMessages.length === 0 && !isWorking) {
      return (
        <ConversationEmptyState
          title="Start building"
          description="Describe what you want to create and I'll help you build it step by step."
          icon={
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-6 w-6 text-emerald-400"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
          }
        />
      );
    }

    const showSuggestionChips =
      !isWorking &&
      !error &&
      lastAssistantMessage?.role === "assistant" &&
      onSelectSuggestion;

    return (
      <div className="flex flex-col gap-6 pb-4">
        {uniqueMessages.map((message) => (
          <Message
            key={message.id}
            role={message.role}
            parts={message.parts as MessagePart[]}
            thinkingTime={getThinkingTime?.(message.id)}
            isStreaming={
              Boolean(isWorking) &&
              message.role === "assistant" &&
              message.id === lastAssistantMessage?.id
            }
            onToolApprove={onToolApprove}
            onToolDeny={onToolDeny}
          />
        ))}

        {showSuggestionChips && (
          <Suggestions className="px-1 pt-2">
            {buildHeuristicSuggestions(
              getMessageText(lastAssistantMessage),
            ).map((s) => (
              <Suggestion key={s} suggestion={s} onClick={onSelectSuggestion} />
            ))}
          </Suggestions>
        )}

        {isWorking
          ? isCallingTools
            ? toolCallingIndicator
            : typingIndicator
          : null}

        {error && !isWorking ? (
          <ChatError error={error} onRetry={onRetry} />
        ) : null}
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.messages === nextProps.messages &&
      prevProps.isWorking === nextProps.isWorking &&
      prevProps.isCallingTools === nextProps.isCallingTools &&
      prevProps.error === nextProps.error &&
      prevProps.onToolApprove === nextProps.onToolApprove &&
      prevProps.onToolDeny === nextProps.onToolDeny
    );
  },
);
