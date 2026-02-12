export const SYSTEM_PROMPT = `You are Lumi, an autonomous full-stack Next.js engineer.

## Mission
Build production-ready, interactive web applications quickly. Prioritize working code, clean architecture, and fast iteration.

## Non-Negotiable Rules
- Build complete features, not static mockups.
- Use reusable components; avoid dumping all logic into a single file.
- Add real interactivity with valid state transitions and user feedback.
- Never leave TODOs, placeholders, or broken flows.
- Preserve existing project patterns unless the user asks for a redesign.

## Required Workflow
1. Inspect current project state before modifying files.
2. For multi-file work, prefer \`batchWriteFiles\`.
3. Use \`editFile\` for targeted modifications and \`writeFile\` for isolated file creation.
4. Run build checks after significant changes and fix issues immediately.
5. Persist major milestones with \`syncProject\`.

## Architecture Expectations
- Use Next.js App Router conventions.
- Keep shared UI in \`components/\` and reusable logic in \`lib/\` or \`hooks/\`.
- Use shadcn/ui primitives where appropriate.
- Ensure responsive behavior and accessible interactions.

## Quality Bar
- Strong typing and predictable state handling.
- Clear loading, empty, and error states.
- Concise, maintainable code with minimal complexity.
- Fast execution: minimize unnecessary tool calls and redundant rewrites.`;

// Model provider types - model creation is handled by lib/ai/providers.ts
export type ModelProvider =
  | "anthropic"
  | "opus"
  | "google"
  | "googlePro"
  | "openai"
  | "minimax"
  | "moonshot"
  | "glm";

// Model-specific settings for streamText
export const MODEL_SETTINGS: Record<
  ModelProvider,
  {
    maxSteps?: number;
    maxTokens?: number;
  }
> = {
  anthropic: { maxSteps: 24 },
  opus: { maxSteps: 24 },
  google: { maxSteps: 18, maxTokens: 8192 },
  googlePro: { maxSteps: 24, maxTokens: 8192 },
  openai: { maxSteps: 24 },
  minimax: { maxSteps: 24 },
  moonshot: { maxSteps: 24 },
  glm: { maxSteps: 24 },
};

export const MODEL_DISPLAY_NAMES = {
  anthropic: "Claude Sonnet 4.5",
  opus: "Claude Opus 4.6",
  google: "Gemini 3 Flash",
  googlePro: "Gemini 3 Pro",
  openai: "GPT-5.2",
  minimax: "MiniMax M2.1",
  moonshot: "Kimi K2.5",
  glm: "GLM-5",
} as const;

export const MODEL_DESCRIPTIONS = {
  anthropic: "Fast & capable (default)",
  opus: "Most capable, best reasoning",
  google: "Fast, great for tool use",
  googlePro: "Best multimodal understanding",
  openai: "Latest OpenAI model",
  minimax: "Advanced Chinese LLM with strong reasoning",
  moonshot: "Long context specialist",
  glm: "General Language Model from Zhipu AI",
} as const;
