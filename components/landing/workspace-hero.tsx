"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelSelector } from "@/components/shared/model-selector";
import { type ModelProvider } from "@/lib/ai/agent";
import { Button } from "@/components/ui/button";

interface WorkspaceHeroProps {
  onSubmit: (prompt: string, model: ModelProvider) => void;
  userName?: string | null;
}

export function WorkspaceHero({ onSubmit, userName }: WorkspaceHeroProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] =
    useState<ModelProvider>("anthropic");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const handleSubmit = () => {
    if (inputValue.trim()) {
      onSubmit(inputValue.trim(), selectedModel);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  const glowVariants = {
    initial: { opacity: 0.5, scale: 0.8 },
    hover: {
      opacity: 1,
      scale: 1.1,
      transition: { duration: 0.5 },
    },
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 py-12 md:py-20 flex flex-col items-center justify-center min-h-[40vh]">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full flex flex-col items-center"
      >
        {/* Greeting / Heading */}
        <h1 className="text-3xl md:text-4xl font-medium text-white mb-8 text-center tracking-tight">
          {userName ? (
            <>
              Welcome back, <span className="text-emerald-400">{userName}</span>
              .
            </>
          ) : (
            "What would you like to build?"
          )}
        </h1>

        {/* Input Container */}
        <motion.div
          className={cn(
            "relative w-full max-w-3xl group transition-all duration-300",
            isFocused ? "scale-[1.01]" : "scale-100",
          )}
        >
          {/* Glassmorphism Border/Glow */}
          <div
            className={cn(
              "absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-emerald-500/20 rounded-2xl opacity-0 transition-opacity duration-500 blur-md",
              isFocused && "opacity-100",
            )}
          />

          <div
            className={cn(
              "relative bg-[#121214] border border-white/10 rounded-2xl shadow-xl transition-all duration-300 overflow-hidden ring-1 ring-white/5",
              isFocused
                ? "border-emerald-500/30 shadow-emerald-500/10 ring-emerald-500/20"
                : "hover:border-white/20",
            )}
          >
            <div className="p-6">
              <textarea
                id="workspace-prompt-input"
                name="workspacePrompt"
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Describe your app ideas..."
                className="w-full bg-transparent text-xl text-white placeholder-zinc-500 resize-none focus:outline-none min-h-[80px] max-h-[300px] scrollbar-hide font-sans"
                style={{ lineHeight: "1.5" }}
              />

              <div className="flex items-center justify-between mt-6">
                <div className="flex items-center gap-2">
                  <ModelSelector
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 hidden sm:flex items-center gap-1">
                    <Command className="w-3 h-3" />
                    <span>Enter to submit</span>
                  </span>

                  <Button
                    onClick={handleSubmit}
                    disabled={!inputValue.trim()}
                    size="sm"
                    className={cn(
                      "rounded-lg px-4 transition-all duration-300 bg-white/10 hover:bg-white/20 text-white border-0",
                      inputValue.trim() &&
                        "bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_-3px_rgba(16,185,129,0.4)]",
                    )}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Suggestion Chips (Optional, keeping it simple for now as requested) */}
      </motion.div>
    </div>
  );
}
