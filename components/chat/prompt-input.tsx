"use client";

import * as React from "react";
import { useRef, useCallback } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PromptInput as AiPromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MODEL_DISPLAY_NAMES, type ModelProvider } from "@/lib/ai/agent";
import { MiniMaxIcon, MoonshotIcon, GLMIcon } from "@/components/shared/icons";
import type { ChatStatus } from "ai";

// Icons (reusing from existing chat-panel or definition here for portability)
const AnthropicIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
      fill="#D97757"
      fillRule="nonzero"
    ></path>
  </svg>
);

const OpenAIIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"></path>
  </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
      fill="#3186FF"
    ></path>
    <path
      d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
      fill="url(#lobe-icons-gemini-fill-0)"
    ></path>
    <path
      d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
      fill="url(#lobe-icons-gemini-fill-2)"
    ></path>
    <defs>
      <linearGradient
        gradientUnits="userSpaceOnUse"
        id="lobe-icons-gemini-fill-0"
        x1="7"
        x2="11"
        y1="15.5"
        y2="12"
      >
        <stop stopColor="#08B962"></stop>
        <stop offset="1" stopColor="#08B962" stopOpacity="0"></stop>
      </linearGradient>
      <linearGradient
        gradientUnits="userSpaceOnUse"
        id="lobe-icons-gemini-fill-1"
        x1="8"
        x2="11.5"
        y1="5.5"
        y2="11"
      >
        <stop stopColor="#F94543"></stop>
        <stop offset="1" stopColor="#F94543" stopOpacity="0"></stop>
      </linearGradient>
      <linearGradient
        gradientUnits="userSpaceOnUse"
        id="lobe-icons-gemini-fill-2"
        x1="3.5"
        x2="17.5"
        y1="13.5"
        y2="12"
      >
        <stop stopColor="#FABC12"></stop>
        <stop offset=".46" stopColor="#FABC12" stopOpacity="0"></stop>
      </linearGradient>
    </defs>
  </svg>
);

export type PromptInputStatus = "idle" | "disabled" | "working" | "improving";

interface PromptInputProps {
  inputValue: string;
  setInputValue: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop?: () => void;
  status: PromptInputStatus;
  selectedModel: ModelProvider;
  setSelectedModel: (model: ModelProvider) => void;
  onImprovePrompt: () => void;
  showImproveEffect: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function PromptInput({
  inputValue,
  setInputValue,
  onSubmit,
  onStop,
  status,
  selectedModel,
  setSelectedModel,
  onImprovePrompt,
  showImproveEffect,
  inputRef,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Merge refs
  React.useImperativeHandle(inputRef, () => textareaRef.current!);

  // Precompute random sparkle positions (lazy useState init is pure per React Compiler)
  const [sparklePositions] = React.useState(() =>
    Array.from({ length: 6 }, () => ({
      left: `${10 + Math.random() * 80}%`,
      top: `${10 + Math.random() * 80}%`,
    })),
  );

  const isIdle = status === "idle";
  const isWorking = status === "working";
  const isImproving = status === "improving";

  // Map our custom status to AI SDK ChatStatus
  const chatStatus: ChatStatus = isWorking
    ? "streaming"
    : isImproving
      ? "submitted"
      : "ready";

  // Bridge between ai-elements onSubmit (PromptInputMessage) and parent's onSubmit (FormEvent)
  const handleAiSubmit = useCallback(
    (_message: PromptInputMessage, event: React.FormEvent<HTMLFormElement>) => {
      onSubmit(event);
    },
    [onSubmit],
  );

  return (
    <AiPromptInput
      onSubmit={handleAiSubmit}
      className={cn(
        "relative z-10 mx-auto w-full max-w-3xl",
        "[&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:bg-[#1A1A1A]/90 [&_[data-slot=input-group]]:border-white/5 [&_[data-slot=input-group]]:shadow-2xl [&_[data-slot=input-group]]:backdrop-blur-xl [&_[data-slot=input-group]]:transition-all [&_[data-slot=input-group]]:duration-300",
        showImproveEffect
          ? "[&_[data-slot=input-group]]:border-violet-500/50 [&_[data-slot=input-group]]:ring-1 [&_[data-slot=input-group]]:ring-violet-500/20"
          : "[&_[data-slot=input-group]]:focus-within:border-zinc-700 [&_[data-slot=input-group]]:hover:border-zinc-800",
      )}
    >
      <PromptInputBody>
        <PromptInputTextarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && isWorking && onStop) {
              e.preventDefault();
              onStop();
            }
          }}
          placeholder="Build something wonderful..."
          disabled={!isIdle}
          className={cn(showImproveEffect && "text-violet-300")}
        />

        {/* Sparkle effect overlay - positioned relative to InputGroup */}
        <AnimatePresence>
          {showImproveEffect && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none z-10"
            >
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
                  transition={{
                    duration: 2,
                    delay: i * 0.15,
                    repeat: Infinity,
                  }}
                  className="absolute w-1 h-1 bg-violet-400 rounded-full"
                  style={{
                    left: sparklePositions[i].left,
                    top: sparklePositions[i].top,
                    boxShadow: "0 0 10px 2px rgba(167, 139, 250, 0.6)",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </PromptInputBody>

      <PromptInputFooter>
        <PromptInputTools>
          {/* Model Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <PromptInputButton
                disabled={!isIdle}
                size="sm"
              >
                <ModelIcon model={selectedModel} className="h-3.5 w-3.5" />
                <span>{MODEL_DISPLAY_NAMES[selectedModel]}</span>
              </PromptInputButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[200px] bg-[#1A1A1A] border-zinc-800 p-1"
            >
              {Object.entries(MODEL_DISPLAY_NAMES).map(([key, name]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setSelectedModel(key as ModelProvider)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-400 rounded-sm cursor-pointer hover:bg-zinc-800 hover:text-zinc-100",
                    selectedModel === key && "bg-zinc-800 text-zinc-100",
                  )}
                >
                  <ModelIcon
                    model={key as ModelProvider}
                    className="h-3.5 w-3.5"
                  />
                  {name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Improve Prompt - only visible when there's text */}
          {inputValue.trim() && (
            <PromptInputButton
              onClick={onImprovePrompt}
              disabled={isImproving || isWorking}
              tooltip={{ content: "Improve prompt", shortcut: "⌘I" }}
              className={cn(
                "transition-all group",
                !isImproving && !isWorking
                  ? "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                  : "text-zinc-600 cursor-not-allowed",
              )}
              size="sm"
            >
              {isImproving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="h-3 w-3 transition-transform group-hover:rotate-12" />
              )}
              <span>Improve</span>
            </PromptInputButton>
          )}
        </PromptInputTools>

        <PromptInputSubmit
          status={chatStatus}
          onStop={isWorking ? onStop : undefined}
          disabled={!isWorking && (isImproving || !inputValue.trim())}
        />
      </PromptInputFooter>
    </AiPromptInput>
  );
}

function ModelIcon({
  model,
  className,
}: {
  model: ModelProvider;
  className?: string;
}) {
  if (model.includes("anthropic") || model === "opus")
    return <AnthropicIcon className={className} />;
  if (model.includes("google")) return <GoogleIcon className={className} />;
  if (model.includes("openai")) return <OpenAIIcon className={className} />;
  if (model === "minimax") return <MiniMaxIcon className={className} />;
  if (model === "moonshot") return <MoonshotIcon className={className} />;
  if (model === "glm") return <GLMIcon className={className} />;
  return <Loader2 className={className} />;
}
