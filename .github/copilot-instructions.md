# Copilot Instructions for Creative-lovable

## Project Overview

AI-powered web development assistant that generates real, working Next.js apps in E2B cloud sandboxes using AI SDK v6 (beta) with agentic multi-step tool calling.

**Core Tech Stack:**
- Next.js 16 + React 19 (App Router, `"use client"` where needed)
- AI SDK v6 beta: `streamText()`, `stepCountIs()`, `prepareStep`, `onStepFinish`
- E2B SDK v2 for isolated sandbox execution
- shadcn/ui + Tailwind CSS v4 + Framer Motion
- Neon serverless PostgreSQL for persistence

## Architecture at a Glance

```
User Chat → /api/chat/route.ts → lib/ai/web-builder-agent.ts (tools) → lib/e2b/sandbox.ts → E2B Cloud
                ↓
         lib/ai/agent-context.ts (stateful context per projectId)
```

**Key flows:**
- `createWebsite` tool scaffolds complete Next.js 15 projects inside sandboxes
- Sandboxes cached by `projectId` in `activeSandboxes` Map (10-min timeout)
- Agent context tracks files, dependencies, build status, tool execution history
- Tool results stream via AI SDK v6 preliminary results (`async *execute`)

## Critical Patterns

### Tool Implementation (lib/ai/web-builder-agent.ts)
All tools use AI SDK v6 `tool()` with async generators for streaming progress:
```typescript
tool({
  description: "...",
  parameters: z.object({ /* Zod v4 schema */ }),
  async *execute(input) {
    yield { status: "loading", phase: "init", message: "Starting..." }
    // ... do work
    yield { status: "success", result: data }
  }
})
```
After execution, always call context helpers: `recordToolExecution()`, `updateFileInContext()`, `updateBuildStatus()`.

### File Paths in Sandbox
Use `normalizeSandboxRelativePath()` for all file paths. Strips leading slashes, handles `app/` and `components/` prefixes automatically. Invalid paths throw errors.

### Sandbox Management (lib/e2b/sandbox.ts)
- `createSandbox(projectId)` – get or create, reuses if alive
- `executeCommand(sandbox, cmd, opts)` – supports `onStdout`, `onStderr` callbacks
- `startBackgroundProcess()` – for `npm run dev`, uses `setsid` for proper detachment
- Template via `E2B_TEMPLATE_ID` env var = 60x faster startup (mandatory for production)

### Chat API (app/api/chat/route.ts)
```typescript
streamText({
  model: MODEL_OPTIONS[model],
  tools: createContextAwareTools(projectId),
  stopWhen: stepCountIs(15),  // Max 15 agentic steps
  prepareStep: async ({ stepNumber, messages }) => {
    // Dynamic tool filtering, conversation compression
  }
})
```
Returns `UIMessageStreamResponse`. 60-second max duration.

## Development Commands

```bash
pnpm dev                          # Start dev server (localhost:3000)
pnpm build                        # Production build (TS errors ignored)
pnpm lint                         # ESLint

# E2B template (first-time setup, takes 5-10 min)
npx tsx lib/e2b/templates/build.dev.ts
```

## Generated vs Platform Versions

Platform uses Next.js 16 / React 19, but **generated projects** in sandboxes use:
- Next.js 15.0.0
- React 18.3.1
- Tailwind 3.4.3

See `createWebsite` tool in [lib/ai/web-builder-agent.ts](lib/ai/web-builder-agent.ts#L582-L590) for exact versions.

## Required Environment Variables

```bash
E2B_API_KEY=             # Required
E2B_TEMPLATE_ID=         # Highly recommended (60x faster)
ANTHROPIC_API_KEY=       # At least one AI provider
DATABASE_URL=            # Neon PostgreSQL for persistence
```

## File Conventions

- **Kebab-case** for all files: `hero-section.tsx`, `use-chat-with-tools.ts`
- Import alias: `@/*` resolves to project root
- Client components need explicit `"use client"` directive
- TypeScript required; props interfaces for all components

## Key Files to Understand First

| Purpose | File |
|---------|------|
| Tool definitions | [lib/ai/web-builder-agent.ts](lib/ai/web-builder-agent.ts) |
| Agent context/state | [lib/ai/agent-context.ts](lib/ai/agent-context.ts) |
| Sandbox operations | [lib/e2b/sandbox.ts](lib/e2b/sandbox.ts) |
| System prompt | [lib/ai/agent.tsx](lib/ai/agent.tsx) (SYSTEM_PROMPT) |
| Chat API endpoint | [app/api/chat/route.ts](app/api/chat/route.ts) |
| Custom chat hook | [hooks/use-chat-with-tools.ts](hooks/use-chat-with-tools.ts) |

## Common Pitfalls

1. **Model IDs in agent.tsx are placeholders** – Update to real provider model IDs
2. **Sandbox timeout is 10 minutes** – Long-idle projects need new sandbox
3. **TypeScript errors ignored** (`ignoreBuildErrors: true`) – Check runtime behavior
4. **Max 15 tool steps** – Complex tasks may hit this limit
5. **File read limits** – `getProjectStructure` caps at 10 files in content mode
