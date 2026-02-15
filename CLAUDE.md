# Creative-lovable Development Guide for AI Assistants

AI-powered web development assistant that builds working Next.js applications in seconds. Uses E2B sandboxes for code execution and Vercel AI SDK v6 for agentic workflows.

## Information Recording Principles (Claude must read)

This document uses **progressive disclosure** to maximize LLM working efficiency.

### Level 1 (this file) contains only

| Type | Example |
|---|---|
| Iron rules / code patterns | `inputSchema` not `parameters`, `createGateway()` |
| Common commands | `pnpm dev`, `pnpm test` |
| Directory navigation | Function → file mapping |
| Error diagnostics | Symptom → cause → fix |
| Trigger index tables | Pointers to Level 2 references |

### Level 2 (`docs/references/`) contains

| Type | Example |
|---|---|
| Environment variables | Full env var table, `.env.example` details |
| Model catalog | All available AI models with descriptions |
| Rate limiting | Code patterns for rate-limited routes |

### When asked to record information

1. **High-frequency?** → Write to this file (Level 1)
2. **Low-frequency?** → Write to `docs/references/` (Level 2)
3. **Every L2 reference must have** a trigger condition + content summary

---

## Reference Index (check here when something goes wrong)

| Trigger | Document | Key Content |
|---|---|---|
| Missing API key, env var setup | `docs/references/env-and-models.md` | Full env vars table, `.env.example` guide |
| Which model to use, adding a model | `docs/references/env-and-models.md` | All model keys, gateway IDs, descriptions |
| Adding rate limiting to a route | `docs/references/env-and-models.md` | `checkChatRateLimit` code pattern |

---

## Core Technologies

| Category | Technology | Notes |
|---|---|---|
| Framework | Next.js ^16.1.6 | App Router, Server Components |
| Runtime | React 19.2.4 | Server and Client Components |
| Language | TypeScript ^5.9.3 | Strict mode enabled |
| Styling | Tailwind CSS ^4.1.18 | Utility-first CSS |
| UI | shadcn/ui, Radix UI | Pre-installed and configured |
| AI SDK | Vercel AI SDK ^6.0.73 | Streaming, tools, agentic logic via `createGateway()` |
| Sandbox | E2B ^2.3.3 | Secure sandbox environment |
| Database | Neon PostgreSQL | Serverless Postgres |
| Auth | Supabase Auth | SSR + JS client |
| Cache | Upstash Redis | Rate limiting and caching |
| Testing | Jest ^30.2.0, Playwright ^1.58.1 | Unit/integration + E2E |
| Package Manager | pnpm | |

---

## Directory Structure

```
Creative-lovable/
├── app/                  # Next.js App Router (pages and API routes)
│   ├── api/              # API endpoints
│   └── (auth)/           # Authentication routes
├── components/           # Reusable React components
│   ├── ui/               # shadcn/ui components
│   ├── features/         # Feature-specific components
│   └── layout/           # Layout components
├── lib/                  # Core application logic
│   ├── ai/               # AI agent, tools, and prompts
│   ├── db/               # Database repositories and types
│   ├── services/         # Business logic layer
│   ├── e2b/              # E2B sandbox management
│   └── utils/            # Shared utility functions
├── hooks/                # Custom React hooks
└── public/               # Static assets
```

## Key Files

| File Path | Description |
|---|---|
| `lib/ai/web-builder-agent.ts` | Core AI agent tools and logic. **Primary file for AI agent development.** |
| `lib/ai/agent.ts` | Main system prompt and model configurations. |
| `lib/ai/providers.ts` | AI Gateway and model routing via `createGateway()`. |
| `lib/ai/tools/index.ts` | Tool barrel exports. Central registry for all tool factories. |
| `lib/ai/tools/batch-file.tools.ts` | Batch file write operations (up to 50 files per call). |
| `lib/ai/tools/project-init.tools.ts` | Project initialization from templates. |
| `lib/ai/tools/sync.tools.ts` | Database sync persistence with retry logic. |
| `app/api/chat/route.ts` | Main chat API endpoint, streaming AI responses. |
| `lib/e2b/sandbox.ts` | E2B sandbox lifecycle (creation, cleanup, state). |
| `lib/e2b/sync-manager.ts` | File sync to database for project persistence. |
| `lib/db/repositories/` | Data access layer. |
| `lib/services/` | Business logic coordinating API and database layers. |

---

## Common Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run Jest test suite |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm lint` | ESLint code quality check |
| `pnpm template:build` | Build E2B sandbox template |
| `pnpm db:up` / `pnpm db:down` | Start/stop local Supabase |
| `pnpm db:psql` | Open psql shell to local DB |

---

## AI SDK v6 Code Patterns (must stay here — directly copyable)

### Gateway Model Routing

```typescript
import { createGateway } from 'ai'

const aiGateway = createGateway()

const MODEL_CONFIG = {
  anthropic: {
    gatewayId: 'anthropic/claude-sonnet-4-5',
    providerOrder: ['anthropic', 'vertex'] as const,
  },
}

export function getModel(key: ModelKey) {
  return aiGateway(MODEL_CONFIG[key].gatewayId)
}

export function getGatewayProviderOptions(key: ModelKey) {
  return { gateway: { order: [...MODEL_CONFIG[key].providerOrder] } }
}
```

### Streaming with streamText

```typescript
import { streamText, stepCountIs } from "ai"
import { getModel, getGatewayProviderOptions } from "@/lib/ai/providers"

const result = streamText({
  model: getModel('anthropic'),
  providerOptions: getGatewayProviderOptions('anthropic'),
  messages,
  tools,
  stopWhen: stepCountIs(50),
  onStepFinish: async ({ text, toolCalls, usage }) => {
    logger.info({ usage }, 'Step completed')
  },
})

return result.toUIMessageStreamResponse()
```

### Tool Definition (CRITICAL: use `inputSchema`, NOT `parameters`)

```typescript
import { tool } from "ai"
import { z } from "zod"

const myTool = tool({
  description: "Does something useful",
  inputSchema: z.object({
    input: z.string().describe("The input to process"),
  }),
  execute: async ({ input }) => {
    return { result: "processed" }
  },
})
```

### Error Handling

```typescript
import {
  ValidationError,
  AuthenticationError,
  DatabaseError,
  asyncErrorHandler
} from "@/lib/errors"

export const POST = withAuth(asyncErrorHandler(async (req: Request) => {
  if (!isValid) {
    throw new ValidationError("Invalid input", errors)
  }
}))
```

---

## AI Agent Tools

Tool factories in `lib/ai/tools/`, barrel export at `lib/ai/tools/index.ts`.

| Factory | Description |
|---|---|
| `createPlanningTools` | Task planning and workflow organization |
| `createStateTools` | Sandbox and application state management |
| `createFileTools` | File operations (read, write, delete) |
| `createBatchFileTools` | Bulk file operations (up to 50 files per call) |
| `createProjectTools` | Project structure and configuration |
| `createProjectInitTools` | Initialize new projects from templates |
| `createSyncTools` | Database persistence with retry logic |
| `createBuildTools` | Building and bundling applications |
| `createCodeTools` | Code analysis and transformation |
| `createSearchTools` | Web search via Tavily |
| `createSkillTools` | Discover Vercel Skills from registry |

**Key tools:** `initializeProject`, `batchWriteFiles`, `syncProject`, `writeFile`, `editFile`, `readFile`, `getProjectStructure`, `installPackage`, `getBuildStatus`, `runCommand`, `executeCode`, `webSearch`, `findSkills`.

---

## Contributing to the AI Agent

- **Adding a tool**: Create factory in `lib/ai/tools/` (e.g., `my-feature.tools.ts`), export from `lib/ai/tools/index.ts`. Use `tool()` from AI SDK.
- **Modifying system prompt**: Edit `SYSTEM_PROMPT` in `lib/ai/agent.ts`.
- **Adding a model**: Add entry to `MODEL_CONFIG` in `lib/ai/providers.ts` with gateway ID and provider fallback order.
- **Improving context**: Enhance `generateAgenticSystemPrompt` in `lib/ai/web-builder-agent.ts`.

---

## Modify Code Before Reading (check here first)

| You want to change... | Read first | Key pitfall |
|---|---|---|
| AI agent tools | `lib/ai/web-builder-agent.ts` | Must register in `lib/ai/tools/index.ts` barrel export |
| System prompt | `lib/ai/agent.ts` | `SYSTEM_PROMPT` constant; don't break token budget |
| Model config | `lib/ai/providers.ts` | Must have `gatewayId` + `providerOrder` in `MODEL_CONFIG` |
| Chat API route | `app/api/chat/route.ts` | Uses `streamText` + `toUIMessageStreamResponse()` pattern |
| Sandbox lifecycle | `lib/e2b/sandbox.ts` | State management and cleanup are tightly coupled |
| File sync | `lib/e2b/sync-manager.ts` | Has retry logic; don't bypass it |
| Environment vars | `docs/references/env-and-models.md` | Full table there; `.env.example` is source of truth |

---

## Reference Trigger Index (long conversations — check this)

| What you need | Read this | Contains |
|---|---|---|
| Env var names and descriptions | `docs/references/env-and-models.md` | Full env vars table, required/optional status |
| Which AI model to use | `docs/references/env-and-models.md` | All model keys, gateway IDs, capabilities |
| Rate limiting pattern | `docs/references/env-and-models.md` | `checkChatRateLimit` code example |
