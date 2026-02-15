"use client";

import type React from "react";
import { useState, useRef } from "react";
import {
  ArrowRight,
  Wand2,
  Loader2,
  Shield,
  Zap,
  Terminal,
  Lock,
  Users,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ModelProvider } from "@/lib/ai/agent";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ModelSelector } from "@/components/shared/model-selector";

interface HeroSectionProps {
  onSubmit: (prompt: string, model: ModelProvider) => void;
}

export function HeroSectionV3({ onSubmit }: HeroSectionProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] =
    useState<ModelProvider>("anthropic");
  const [isImproving, setIsImproving] = useState(false);
  const [showImproveEffect, setShowImproveEffect] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    // Allow starting with an empty prompt (opens editor with no initialPrompt).
    // This matches the landing-page CTA behavior and avoids a disabled primary action.
    onSubmit(inputValue.trim(), selectedModel);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const typewriterEffect = async (text: string) => {
    setShowImproveEffect(true);
    setInputValue("");

    await new Promise((r) => setTimeout(r, 200));

    for (let i = 0; i <= text.length; i++) {
      setInputValue(text.slice(0, i));
      const delay = Math.random() * 15 + 8;
      await new Promise((r) => setTimeout(r, delay));
    }

    setShowImproveEffect(false);
  };

  const handleImprovePrompt = async () => {
    if (!inputValue.trim() || isImproving) return;

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
  };

  const companyLogos = [
    { name: "Company 1", width: "w-20" },
    { name: "Company 2", width: "w-24" },
    { name: "Company 3", width: "w-20" },
    { name: "Company 4", width: "w-28" },
    { name: "Company 5", width: "w-20" },
  ];

  const stats = [
    { value: "50K+", label: "Developers" },
    { value: "2M+", label: "Projects Built" },
    { value: "99.9%", label: "Uptime" },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-16 pb-24 relative overflow-hidden">
      {/* Sophisticated grid pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />

      {/* Subtle mesh gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-gradient-to-b from-blue-600/[0.07] via-transparent to-transparent rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gradient-to-tl from-indigo-600/[0.05] via-transparent to-transparent rounded-full blur-[80px] pointer-events-none" />

      <div className="w-full max-w-5xl mx-auto relative z-10">
        {/* Enterprise Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-900/80 border border-zinc-800 backdrop-blur-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                Enterprise Ready
              </span>
            </div>
            <div className="w-px h-4 bg-zinc-700" />
            <span className="text-xs text-zinc-500">
              SOC 2 Type II Compliant
            </span>
          </div>
        </motion.div>

        {/* Main Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center mb-6"
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-white leading-[1.1]">
            Ship production apps
            <br />
            <span className="text-zinc-500">in minutes, not months</span>
          </h1>
        </motion.div>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto mb-12 text-center leading-relaxed"
        >
          The AI-powered development platform trusted by teams at the world&apos;s
          leading companies. Build, iterate, and deploy Next.js applications
          with unprecedented speed and precision.
        </motion.p>

        {/* Command Center Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative max-w-4xl mx-auto"
        >
          {/* Animated glow on focus */}
          <AnimatePresence>
            {isFocused && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="absolute -inset-px bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-blue-500/20 rounded-xl blur-sm"
              />
            )}
          </AnimatePresence>

          <div
            className={cn(
              "relative bg-zinc-950 rounded-xl border transition-all duration-300",
              isFocused
                ? "border-zinc-600 shadow-2xl shadow-blue-500/5"
                : "border-zinc-800 hover:border-zinc-700",
              showImproveEffect && "border-indigo-500/50",
            )}
          >
            {/* Terminal header bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-zinc-600" />
                <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
                  Command Interface
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-zinc-600">
                  <Lock className="w-3 h-3" />
                  <span className="text-xs">Secure</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-700" />
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-700" />
                </div>
              </div>
            </div>

            {/* Main input area */}
            <div className="p-5">
              <div className="relative">
                <textarea
                  id="landing-prompt-input"
                  name="landingPrompt"
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="Describe the application you want to build..."
                  className={cn(
                    "w-full bg-transparent text-white placeholder:text-zinc-600 resize-none outline-none text-base leading-relaxed font-mono",
                    "min-h-[140px]",
                    showImproveEffect && "text-indigo-300",
                  )}
                  disabled={isImproving}
                />

                {/* Cursor blink effect when empty */}
                {!inputValue && !isFocused && (
                  <div className="absolute top-0 left-0 flex items-center pointer-events-none">
                    <span className="text-zinc-600 font-mono">
                      Describe the application you want to build
                    </span>
                    <motion.span
                      animate={{ opacity: [1, 0] }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        repeatType: "reverse",
                      }}
                      className="w-0.5 h-5 bg-zinc-600 ml-0.5"
                    />
                  </div>
                )}

                {/* Sparkle effect overlay during improvement */}
                <AnimatePresence>
                  {showImproveEffect && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 pointer-events-none"
                    >
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
                          transition={{
                            duration: 1.2,
                            delay: i * 0.15,
                            repeat: Infinity,
                            repeatDelay: 0.3,
                          }}
                          className="absolute w-1 h-1 bg-indigo-400 rounded-full"
                          style={{
                            left: `${10 + Math.random() * 80}%`,
                            top: `${10 + Math.random() * 80}%`,
                            boxShadow: "0 0 12px 3px rgba(129, 140, 248, 0.5)",
                          }}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action bar */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800/50">
                <div className="flex items-center gap-3">
                  <ModelSelector
                    selectedModel={selectedModel}
                    onModelChange={setSelectedModel}
                    disabled={isImproving}
                    triggerClassName="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800"
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleImprovePrompt}
                    disabled={!inputValue.trim() || isImproving}
                    className={cn(
                      "h-9 gap-2 px-3 rounded-lg transition-all border",
                      inputValue.trim() && !isImproving
                        ? "text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/10 hover:text-indigo-300 hover:border-indigo-500/30"
                        : "text-zinc-600 border-zinc-800 cursor-not-allowed",
                    )}
                  >
                    {isImproving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm hidden sm:inline">
                          Enhancing...
                        </span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        <span className="text-sm hidden sm:inline">
                          Enhance
                        </span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600 hidden sm:inline">
                    {navigator?.platform?.includes("Mac") ? "Cmd" : "Ctrl"} +
                    Enter to submit
                  </span>

                  <Button
                    onClick={handleSubmit}
                    disabled={isImproving}
                    className={cn(
                      "h-10 px-6 gap-2 rounded-lg font-medium transition-all",
                      !isImproving
                        ? "bg-white text-black hover:bg-zinc-200 shadow-lg shadow-white/10"
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                    )}
                  >
                    <span>Build Application</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Trust badges below input */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-6 mt-6"
          >
            <div className="flex items-center gap-2 text-zinc-500">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="text-xs">End-to-end encrypted</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-500">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-xs">Instant deployment</span>
            </div>
            <div className="flex items-center gap-2 text-zinc-500">
              <Building2 className="w-4 h-4 text-blue-500" />
              <span className="text-xs">Enterprise SSO</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex items-center justify-center gap-12 mt-16"
        >
          {stats.map((stat, index) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl sm:text-3xl font-semibold text-white mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Company logos placeholder */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-16 text-center"
        >
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-6">
            Trusted by engineering teams at
          </p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            {companyLogos.map((logo, index) => (
              <motion.div
                key={logo.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.8 + index * 0.1 }}
                className={cn(
                  "h-8 flex items-center justify-center",
                  logo.width,
                )}
              >
                <div className="h-6 w-full bg-zinc-800/50 rounded flex items-center justify-center border border-zinc-800">
                  <Users className="w-4 h-4 text-zinc-600" />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
