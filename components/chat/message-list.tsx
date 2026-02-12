"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Message, type MessagePart } from "./message";
import type { UIMessage } from "ai";
import { ChatEmptyState } from "./chat-error";
import { ChatError } from "./chat-error";
import { SuggestionChips, buildHeuristicSuggestions } from "./suggestion-chips";

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
  }: MessageListProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);

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

    useEffect(() => {
      const scrollContainer = messagesEndRef.current?.closest(
        "[data-chat-scroll-container='true']",
      ) as HTMLElement | null;
      if (!scrollContainer) return;

      const handleScroll = () => {
        const distanceFromBottom =
          scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight;
        shouldAutoScrollRef.current = distanceFromBottom < 120;
      };

      handleScroll();
      scrollContainer.addEventListener("scroll", handleScroll, {
        passive: true,
      });

      return () => {
        scrollContainer.removeEventListener("scroll", handleScroll);
      };
    }, []);

    useEffect(() => {
      if (!shouldAutoScrollRef.current) return;
      messagesEndRef.current?.scrollIntoView({
        behavior: isWorking ? "auto" : "smooth",
      });
    }, [uniqueMessages, isWorking]);

    if (uniqueMessages.length === 0 && !isWorking) {
      return <ChatEmptyState />;
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
          />
        ))}

        {showSuggestionChips && (
          <SuggestionChips
            suggestions={buildHeuristicSuggestions(
              getMessageText(lastAssistantMessage),
            )}
            onSelect={onSelectSuggestion}
          />
        )}

        {isWorking && !isCallingTools ? typingIndicator : null}

        {error && !isWorking ? (
          <ChatError error={error} onRetry={onRetry} />
        ) : null}

        <div ref={messagesEndRef} className="h-px w-full" />
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.messages === nextProps.messages &&
      prevProps.isWorking === nextProps.isWorking &&
      prevProps.isCallingTools === nextProps.isCallingTools &&
      prevProps.error === nextProps.error
    );
  },
);
