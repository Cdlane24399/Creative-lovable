"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessagePart, ToolPart } from "./message";

export interface PlanStep {
  label: string;
  completed: boolean;
}

export interface PlanState {
  goal: string;
  steps: PlanStep[];
}

/**
 * Normalize a step string for fuzzy matching.
 * Strips casing, extra whitespace, trailing punctuation, and leading numbers/bullets.
 */
function normalizeStep(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[\d.\-–—•*)\]]+\s*/, "") // strip leading bullets / numbering
    .replace(/[.,;:!?]+$/, "") // strip trailing punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a completed step label matches a plan step label.
 * Uses exact match first, then normalized fuzzy match, then substring containment.
 */
function stepsMatch(planLabel: string, completedLabel: string): boolean {
  if (planLabel === completedLabel) return true;
  const a = normalizeStep(planLabel);
  const b = normalizeStep(completedLabel);
  if (a === b) return true;
  // Substring containment (the agent sometimes abbreviates)
  if (a.length > 10 && b.length > 10) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

/**
 * Extracts the current plan state from the chat message stream.
 * Scans for planChanges and markStepComplete tool outputs.
 */
export function extractPlanState(
  messages: Array<{ role: string; parts?: MessagePart[] }>,
): PlanState | null {
  let latestPlan: { goal: string; steps: string[] } | null = null;
  const completedSteps: string[] = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !message.parts) continue;

    for (const part of message.parts) {
      if (part.type === "tool-planChanges") {
        const toolPart = part as ToolPart;
        if (
          toolPart.state === "output-available" &&
          typeof toolPart.output === "object" &&
          toolPart.output !== null
        ) {
          const output = toolPart.output as Record<string, unknown>;
          if (Array.isArray(output.steps) && typeof output.goal === "string") {
            latestPlan = {
              goal: output.goal,
              steps: output.steps.filter(
                (s: unknown): s is string => typeof s === "string",
              ),
            };
            completedSteps.length = 0;
          }
        }
      }

      if (part.type === "tool-markStepComplete") {
        const toolPart = part as ToolPart;
        // Capture from output when available
        if (
          toolPart.state === "output-available" &&
          typeof toolPart.output === "object" &&
          toolPart.output !== null
        ) {
          const output = toolPart.output as Record<string, unknown>;
          if (typeof output.completedStep === "string") {
            completedSteps.push(output.completedStep);
          }
        }
        // Capture from input during streaming (before output arrives)
        if (
          toolPart.state === "input-available" ||
          toolPart.state === "input-streaming"
        ) {
          const input = toolPart.input as Record<string, unknown> | undefined;
          if (input && typeof input.step === "string") {
            completedSteps.push(input.step);
          }
        }
      }
    }
  }

  if (!latestPlan) return null;

  return {
    goal: latestPlan.goal,
    steps: latestPlan.steps.map((label) => ({
      label,
      completed: completedSteps.some((c) => stepsMatch(label, c)),
    })),
  };
}

interface PlanProgressProps {
  plan: PlanState;
  isWorking: boolean;
}

export function PlanProgress({ plan, isWorking }: PlanProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevPlanGoalRef = useRef<string | null>(null);

  const completedCount = plan.steps.filter((s) => s.completed).length;
  const totalCount = plan.steps.length;
  const allComplete = completedCount === totalCount && totalCount > 0;
  const progressPercent =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Reset dismissed state when a new plan arrives
  useEffect(() => {
    if (plan.goal !== prevPlanGoalRef.current) {
      prevPlanGoalRef.current = plan.goal;
      setDismissed(false);
      setIsExpanded(false);
    }
  }, [plan.goal]);

  // Auto-dismiss after all steps complete and agent stops working
  useEffect(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (allComplete && !isWorking) {
      dismissTimerRef.current = setTimeout(() => {
        setDismissed(true);
      }, 3000);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [allComplete, isWorking]);

  // Find the current in-progress step (first incomplete one)
  const currentStepIndex = plan.steps.findIndex((s) => !s.completed);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key={plan.goal}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mx-auto w-full max-w-3xl"
        >
          <div className="rounded-t-xl border border-b-0 border-white/[0.05] bg-[#1A1A1A]/90 backdrop-blur-xl overflow-hidden">
            {/* Compact header */}
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 shrink-0 text-zinc-500 transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />

              <span className="flex-1 truncate text-[11px] font-medium text-zinc-400">
                {plan.goal}
              </span>

              {/* Progress pill */}
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums leading-tight",
                  allComplete
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-zinc-800/80 text-zinc-500",
                )}
              >
                {completedCount}/{totalCount}
              </span>
            </button>

            {/* Thin progress bar */}
            <div className="h-px bg-zinc-800/40">
              <motion.div
                className={cn(
                  "h-full",
                  allComplete ? "bg-emerald-500/60" : "bg-emerald-500/40",
                )}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>

            {/* Steps list — collapsible */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <ul className="px-3 py-1.5 space-y-px">
                    {plan.steps.map((step, index) => {
                      const isCurrent = index === currentStepIndex && isWorking;
                      return (
                        <li
                          key={index}
                          className="flex items-center gap-2 py-0.5"
                        >
                          {/* Status indicator */}
                          <div
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                              step.completed
                                ? "bg-emerald-500"
                                : isCurrent
                                  ? "border border-emerald-500/50"
                                  : "border border-zinc-700",
                            )}
                          >
                            {step.completed ? (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 500,
                                  damping: 25,
                                }}
                              >
                                <Check className="h-2 w-2 text-black stroke-[3px]" />
                              </motion.div>
                            ) : isCurrent ? (
                              <Loader2 className="h-2 w-2 text-emerald-400 animate-spin" />
                            ) : null}
                          </div>

                          {/* Step text */}
                          <span
                            className={cn(
                              "text-[11px] leading-snug transition-colors duration-300",
                              step.completed
                                ? "text-zinc-600 line-through decoration-zinc-700"
                                : isCurrent
                                  ? "text-zinc-300"
                                  : "text-zinc-500",
                            )}
                          >
                            {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
