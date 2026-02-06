# AGENTS.md -- Creative-lovable

This document is the authoritative reference for any AI agent working on the Creative-lovable codebase. It describes the project purpose, architecture, conventions, and key files in full detail.

---

## 1. Project Overview

Creative-lovable is an AI-powered web development assistant that builds and iterates on real, working Next.js applications in seconds. Users describe what they want in natural language, and the AI agent scaffolds, writes, edits, and deploys complete projects inside secure E2B sandboxes.

---

## 2. Tech Stack

| Category | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 16+ | App Router, Server Components, Turbopack |
| Runtime | React | 19.2.4 | Server and Client Components |
| Language | TypeScript | 5.9+ | Strict mode |
| Styling | Tailwind CSS | 4.x | `@theme` directive, `@tailwindcss/postcss` |
| UI Components | shadcn/ui, Radix UI | Latest | Pre-installed and configured |
| AI SDK | Vercel AI SDK | v6 (`ai@^6.0.73`) | `createGateway()`, `streamText`, `stepCountIs`, `UIMessage` |
| Agent SDK | `@anthropic-ai/claude-agent-sdk` | 0.2.33 | |
| Code Execution | E2B Code Interpreter | 2.x | Secure sandbox environment |
| Vercel Sandbox | `@vercel/sandbox` | 1.4.1 | |
| Database | `@neondatabase/serverless` | 1.x | Serverless PostgreSQL |
| Auth | Supabase Auth | Latest | `@supabase/supabase-js`, `@supabase/ssr` |
| Caching | `@upstash/redis` | 1.36+ | LRU in-memory fallback when Redis unavailable |
| Package Manager | pnpm | | Used for this host project |
| Testing | Jest 30, Playwright 1.58 | | Unit and E2E |

---

## 3. Architecture

### 3.1 Layered Architecture

```
Request flow:

  Browser / Client
       |
  app/api/ routes          -- Thin controllers: validate, auth, rate-limit, delegate
       |
  lib/services/            -- Business logic, caching, orchestration
       |
  lib/db/repositories/     -- Type-safe database access (repository pattern)
       |
  @neondatabase/serverless -- PostgreSQL
```

### 3.2 AI Agent Pipeline

```
app/api/chat/route.ts
  |
  +-- lib/validations.ts            -- Zod schema validation (chatRequestSchema)
  +-- lib/rate-limit.ts             -- checkChatRateLimit()
  +-- lib/ai/providers.ts           -- getModel(), getGatewayProviderOptions()
  +-- lib/ai/agent.ts               -- SYSTEM_PROMPT, MODEL_SETTINGS
  +-- lib/ai/web-builder-agent.ts   -- createContextAwareTools(), generateAgenticSystemPrompt()
  +-- lib/ai/agent-context.ts       -- Write-through cache for project state
  +-- lib/e2b/sandbox-provider.ts   -- withSandbox() via AsyncLocalStorage
  |
  streamText() -> toUIMessageStreamResponse()
```

### 3.3 Key Architectural Components

| Component | File(s) | Description |
|---|---|---|
| AI Gateway | `lib/ai/providers.ts` | `createGateway()` with provider failover (`providerOrder`) |
| Agent Context | `lib/ai/agent-context.ts` | Write-through cache: immediate DB writes, in-memory reads. TTL 30 min, max 100 contexts. |
| Sandbox State Machine | `lib/e2b/sandbox-state-machine.ts` | Formal state machine for sandbox lifecycle. States: `idle -> creating -> active -> paused -> expired -> error`. Events: `CREATE`, `CREATED`, `PAUSE`, `RESUME`, `EXPIRE`, `ERROR`, `RETRY`, `CLEANUP`. Max 3 retries. |
| Sandbox Provider | `lib/e2b/sandbox-provider.ts` | `AsyncLocalStorage`-based request-scoped sandbox injection. `withSandbox()`, `getCurrentSandbox()`. |
| Sync Manager | `lib/e2b/sync-manager.ts` | Bidirectional file sync between E2B sandbox and database. Delta computation, conflict resolution, chunked transfers. |
| Cache Manager | `lib/cache/cache-manager.ts` | Unified cache with Upstash Redis + LRU fallback. TTLs: project 5m, list 3m, messages 2m, context 10m. |
| Task Graph | `lib/ai/agent-context.ts` | Primary planning system. Tasks have statuses: `pending`, `in_progress`, `completed`, `failed`, `blocked`, `skipped`. |
| Error Handling | `lib/errors.ts` | Hierarchy: `AppError` -> `AuthenticationError`, `AuthorizationError`, `ValidationError`, `NotFoundError`, `RateLimitError`, `DatabaseError`, `ExternalServiceError`, `SandboxError`, `FileSystemError`, `ConfigurationError`. Wrap routes with `asyncErrorHandler()`. |
| Validations | `lib/validations.ts` | Zod schemas for all API inputs. `validateRequest()` helper. AI SDK v6 `UIMessage` format with `parts` array. |

---

## 4. AI Models (9 providers via AI Gateway)

All models are configured in `lib/ai/providers.ts` using `createGateway()` from the AI SDK.

| Key | Model | Gateway ID | Provider Order | Notes |
|---|---|---|---|---|
| `anthropic` | Claude Sonnet 4.5 | `anthropic/claude-sonnet-4-5` | anthropic, vertex | Default model |
| `opus` | Claude Opus 4.6 | `anthropic/claude-opus-4-6` | anthropic, vertex | Best reasoning |
| `google` | Gemini 3 Flash | `google/gemini-3-flash-preview` | google, vertex | Fast, maxTokens: 8192 |
| `googlePro` | Gemini 3 Pro | `google/gemini-3-pro-preview` | google, vertex | Best multimodal, maxTokens: 8192 |
| `openai` | GPT-5.2 | `openai/gpt-5.2` | openai | |
| `haiku` | Claude 3.5 Haiku | `anthropic/claude-3-5-haiku-20241022` | anthropic, vertex | (Not in MODEL_SETTINGS, used elsewhere) |
| `minimax` | MiniMax M2.1 | `minimax/minimax-m2.1` | minimax | |
| `moonshot` | Kimi K2.5 | `moonshotai/kimi-k2.5` | moonshotai | Long context |
| `glm` | GLM-4.7 | `zai/glm-4.7` | zai | Zhipu AI |

Model settings are in `lib/ai/agent.ts` (`MODEL_SETTINGS`). Default `maxSteps` is 50 (40 for `google`).

---

## 5. AI Tool Categories

Tools are implemented as factory functions in `lib/ai/tools/`, each taking a `projectId` and returning tool objects. The barrel export is in `lib/ai/tools/index.ts`. Tools are composed in `lib/ai/web-builder-agent.ts` via `createContextAwareTools(projectId)`.

| Category | Factory | File | Key Tools | Notes |
|---|---|---|---|---|
| Planning | `createPlanningTools` | `planning.tools.ts` | `planChanges`, `markStepComplete`, `analyzeProjectState` | Task graph management |
| State | `createStateTools` | `state.tools.ts` | Sandbox and application state awareness | |
| File | `createFileTools` | `file.tools.ts` | `writeFile`, `readFile`, `editFile` | Single-file operations |
| Batch File | `createBatchFileTools` | `batch-file.tools.ts` | `batchWriteFiles` | Bulk operations, max 50 files |
| Project | `createProjectTools` | `project.tools.ts` | `getProjectStructure` | Project introspection |
| Project Init | `createProjectInitTools` | `project-init.tools.ts` | `initializeProject` | Template-based scaffolding |
| Sync | `createSyncTools` | `sync.tools.ts` | `syncProject` | Database persistence with retry |
| Build | `createBuildTools` | `build.tools.ts` | `runCommand`, `installPackage`, `getBuildStatus`, `startDevServer` | Build and dev server |
| Website | `createWebsiteTools` | `website.tools.ts` | `createWebsite` | **DEPRECATED** -- use ProjectInit + BatchFile + Sync |
| Code | `createCodeTools` | `code.tools.ts` | `executeCode` | Code analysis and execution |
| Suggestion | `createSuggestionTools` | `suggestion.tools.ts` | `generateSuggestions` | Follow-up suggestions |

### Dynamic Tool Activation (prepareStep)

The chat route uses AI SDK v6 `prepareStep` to dynamically select active tools per step:
- **Step 0**: Planning + Creation (`initializeProject`, `batchWriteFiles`, `syncProject`) + File + Build + Suggestions
- **Build errors detected**: File + BatchFile + Build + Suggestions
- **Server running with task graph**: File + BatchFile + Build + `markStepComplete` + `syncProject` + Suggestions
- **Otherwise (step 1+)**: All tools available (no restriction)

---

## 6. Directory Structure

```
Creative-lovable/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── chat/route.ts         # Main chat endpoint (streamText)
│   │   ├── projects/             # CRUD for projects
│   │   ├── sandbox/              # Sandbox management
│   │   ├── generate-title/       # AI title generation
│   │   ├── improve-prompt/       # Prompt enhancement
│   │   ├── screenshot/           # Screenshot capture
│   │   ├── health/               # Health checks (ready, liveness)
│   │   ├── init-db/              # Database initialization
│   │   ├── migrate/              # Database migrations
│   │   ├── migrate-supabase/     # Supabase migration
│   │   ├── integrations/         # External integrations
│   │   └── test-db/              # Database connectivity test
│   └── (auth)/                   # Authentication routes
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── features/                 # Feature-specific components
│   ├── shared/                   # Shared components (icons, model-selector)
│   └── layout/                   # Layout components
├── hooks/
│   ├── use-chat-with-tools.ts    # Chat hook with tool support
│   ├── use-projects.ts           # Project management hook
│   └── use-dev-server.ts         # Dev server status hook
├── lib/
│   ├── ai/
│   │   ├── agent.ts              # SYSTEM_PROMPT, MODEL_SETTINGS, MODEL_DISPLAY_NAMES
│   │   ├── agent-context.ts      # Write-through context cache
│   │   ├── context-types.ts      # TypeScript types for context
│   │   ├── providers.ts          # createGateway(), getModel(), getGatewayProviderOptions()
│   │   ├── web-builder-agent.ts  # createContextAwareTools(), generateAgenticSystemPrompt()
│   │   ├── schemas/              # Zod schemas for tools
│   │   ├── errors/               # Web builder error classes
│   │   ├── utils/                # Path handling, formatting utilities
│   │   ├── helpers/              # Scaffolding, file writing helpers
│   │   ├── planning/             # Task graph implementation
│   │   ├── prompt-generator.ts   # System prompt generation with context
│   │   └── tools/                # Tool factory modules (see section 5)
│   ├── db/
│   │   └── repositories/
│   │       ├── base.repository.ts        # Base repository class
│   │       ├── project.repository.ts     # Project CRUD
│   │       ├── message.repository.ts     # Message persistence
│   │       ├── context.repository.ts     # Agent context persistence
│   │       ├── token-usage.repository.ts # Token usage tracking
│   │       ├── integration.repository.ts # External integrations
│   │       └── index.ts                  # Singleton getters
│   ├── services/
│   │   ├── project.service.ts            # Project business logic
│   │   ├── message.service.ts            # Message operations
│   │   ├── context.service.ts            # Context management
│   │   ├── token-usage.service.ts        # Token tracking
│   │   └── index.ts                      # Singleton getters (getProjectService(), etc.)
│   ├── e2b/
│   │   ├── sandbox.ts                    # createSandbox, createSandboxWithAutoPause
│   │   ├── sandbox-provider.ts           # withSandbox(), getCurrentSandbox() (AsyncLocalStorage)
│   │   ├── sandbox-state-machine.ts      # Formal state machine for lifecycle
│   │   ├── sync-manager.ts               # Bidirectional file sync
│   │   ├── delta-sync.ts                 # Delta computation, chunked transfers
│   │   └── file-watcher.ts               # File change detection
│   ├── cache/
│   │   ├── cache-manager.ts              # Unified cache (Redis + LRU fallback)
│   │   └── index.ts                      # getCacheManager()
│   ├── errors.ts                         # Error class hierarchy + asyncErrorHandler
│   ├── validations.ts                    # Zod schemas for API validation
│   ├── rate-limit.ts                     # In-memory rate limiting (100/min general, 20/min chat)
│   ├── auth.ts                           # withAuth middleware
│   └── logger.ts                         # Structured logger
├── styles/                       # Global CSS styles
└── public/                       # Static assets
```

---

## 7. Key Files Quick Reference

| File | Purpose |
|---|---|
| `lib/ai/agent.ts` | `SYSTEM_PROMPT`, `MODEL_SETTINGS`, `MODEL_DISPLAY_NAMES`, `MODEL_DESCRIPTIONS`, `ModelProvider` type |
| `lib/ai/providers.ts` | `createGateway()`, `getModel(key)`, `getGatewayProviderOptions(key)`, `ModelKey` type |
| `lib/ai/web-builder-agent.ts` | `createContextAwareTools(projectId)`, re-exports schemas, errors, utils, helpers, prompt generator |
| `lib/ai/agent-context.ts` | `getAgentContext()`, `getAgentContextAsync()`, `updateFileInContext()`, `recordToolExecution()`, `setTaskGraph()`, `generateContextSummary()` |
| `lib/ai/tools/index.ts` | Barrel exports for all tool factories |
| `app/api/chat/route.ts` | Main chat endpoint: validation, rate limiting, `streamText()` with `prepareStep`, `experimental_repairToolCall`, `withSandbox()` |
| `lib/e2b/sandbox.ts` | `createSandbox()`, `createSandboxWithAutoPause()` |
| `lib/e2b/sandbox-provider.ts` | `withSandbox()`, `getCurrentSandbox()`, `getCurrentProjectId()`, `getCurrentProjectDir()` |
| `lib/e2b/sandbox-state-machine.ts` | `SandboxStateMachine` class, `getSandboxStateMachine()`, `shouldAttemptConnection()`, `waitForReady()` |
| `lib/e2b/sync-manager.ts` | Bidirectional sync, `SyncDirection`: `sandbox-to-db`, `db-to-sandbox`, `bidirectional` |
| `lib/errors.ts` | `AppError`, `ValidationError`, `AuthenticationError`, `DatabaseError`, `SandboxError`, `asyncErrorHandler()` |
| `lib/validations.ts` | `chatRequestSchema`, `uiMessageSchema`, `projectIdSchema`, `modelProviderSchema`, `validateRequest()` |
| `lib/cache/cache-manager.ts` | `getCacheManager()`, TTLs, Redis + LRU fallback |
| `lib/rate-limit.ts` | `checkChatRateLimit()` -- 20 req/min for chat, 100 req/min general |
| `lib/services/index.ts` | `getProjectService()`, `getMessageService()`, `getContextService()`, `getTokenUsageService()` |

---

## 8. Conventions and Patterns

### 8.1 Path Aliases
- All imports use `@/*` path alias (maps to project root).

### 8.2 File Naming
- `*.repository.ts` -- Database access layer
- `*.service.ts` -- Business logic layer
- `*.tools.ts` -- AI tool factory functions
- `*.test.ts` -- Unit tests (Jest)
- `*.spec.ts` -- E2E tests (Playwright)

### 8.3 Database Access
- **Always** through repositories (`lib/db/repositories/`), never raw SQL.
- Repositories extend a base class in `base.repository.ts`.
- Singleton getters: `getProjectRepository()`, `getMessageRepository()`, etc.

### 8.4 Services
- Singleton getters: `getProjectService()`, `getMessageService()`, `getTokenUsageService()`.
- Services orchestrate repositories and caching.

### 8.5 Error Handling
- API routes wrapped with `asyncErrorHandler()` from `lib/errors.ts`.
- Throw typed errors: `ValidationError`, `AuthenticationError`, `DatabaseError`, `SandboxError`, etc.
- All errors include `statusCode`, `code`, and `isOperational` flag.
- Non-operational errors (e.g., `ConfigurationError`) indicate programming bugs.

### 8.6 Validation
- All API inputs validated with Zod schemas from `lib/validations.ts`.
- Use `validateRequest(schema, data)` helper.
- AI SDK v6 messages use `UIMessage` format with `parts` array (not `content` string).

### 8.7 Rate Limiting
- General: 100 requests/minute per client.
- Chat endpoint: 20 requests/minute per client.
- In-memory store (production should use Redis).

### 8.8 Caching
- Centralized via `getCacheManager()`.
- Upstash Redis when configured, in-memory LRU (max 500 entries) as fallback.
- Invalidation is project-scoped.

### 8.9 Sandbox Management
- Sandboxes are request-scoped via `AsyncLocalStorage` (`withSandbox()`).
- Tools access the sandbox via `getCurrentSandbox()` -- never create their own.
- Lifecycle managed by `SandboxStateMachine` (singleton via `getSandboxStateMachine()`).
- Auto-pause supported for idle sandboxes.

### 8.10 AI SDK v6 Patterns
```typescript
// Streaming with Gateway
import { streamText, stepCountIs } from "ai"
import { getModel, getGatewayProviderOptions } from "@/lib/ai/providers"

const result = streamText({
  model: getModel("anthropic"),
  providerOptions: getGatewayProviderOptions("anthropic"),
  system: systemPrompt,
  messages: modelMessages,
  tools,
  stopWhen: stepCountIs(50),
  prepareStep: async ({ stepNumber, messages }) => { /* dynamic tool selection */ },
  onStepFinish: async ({ usage }) => { /* token tracking */ },
  experimental_repairToolCall: async ({ toolCall, error }) => { /* input repair */ },
})

return result.toUIMessageStreamResponse({ originalMessages, onError, onFinish })
```

```typescript
// Tool definition
// IMPORTANT: Use `inputSchema` (NOT `parameters`) — AI SDK v6 reads `inputSchema` internally.
// The `tool()` function is a passthrough; `parameters` would result in tools with no schema.
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

---

## 9. Environment Variables

| Variable | Description | Required |
|---|---|---|
| `E2B_API_KEY` | API key for E2B sandboxes | Yes |
| `AI_GATEWAY_URL` | AI Gateway endpoint URL | Recommended |
| `AI_GATEWAY_TOKEN` | AI Gateway authentication token | Recommended |
| `ANTHROPIC_API_KEY` | Anthropic API key (fallback) | Fallback |
| `OPENAI_API_KEY` | OpenAI API key (fallback) | Fallback |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI API key (fallback) | Fallback |
| `DATABASE_URL` | Neon PostgreSQL connection string | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Yes |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL for caching | Recommended |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | Recommended |
| `E2B_TEMPLATE_ID` | Custom E2B template for faster startup | Recommended |

---

## 10. Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run Jest unit tests |
| `pnpm test:watch` | Jest in watch mode |
| `pnpm test:coverage` | Jest with coverage report |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm test:e2e:ui` | Playwright with interactive UI |
| `pnpm test:e2e:headed` | Playwright in headed browser |
| `pnpm test:e2e:debug` | Playwright debug mode |
| `pnpm test:e2e:chromium` | Playwright Chromium only |
| `pnpm test:e2e:firefox` | Playwright Firefox only |
| `pnpm test:e2e:webkit` | Playwright WebKit only |
| `pnpm test:e2e:mobile` | Playwright mobile viewports |
| `pnpm test:e2e:report` | Show Playwright HTML report |
| `pnpm template:build` | Build E2B sandbox template (production) |
| `pnpm template:build:dev` | Build E2B sandbox template (dev) |
| `pnpm sandbox` | Create a sandbox manually (`tsx scripts/create-sandbox.ts`) |
| `pnpm db:up` | Start local Supabase via Docker Compose |
| `pnpm db:down` | Stop local Supabase |
| `pnpm db:logs` | Tail Supabase logs |
| `pnpm db:psql` | Open psql shell to local Supabase |

---

## 11. Contributing Guidelines

### Adding a New AI Tool
1. Create `lib/ai/tools/your-tool.tools.ts` with a factory function `createYourTools(projectId: string)`.
2. Export it from `lib/ai/tools/index.ts`.
3. Import and spread the tools in `createContextAwareTools()` in `lib/ai/web-builder-agent.ts`.
4. If the tool needs sandbox access, use `getCurrentSandbox()` from `lib/e2b/sandbox-provider.ts`.
5. Record tool execution via `recordToolExecution()` from `lib/ai/agent-context.ts`.

### Adding a New API Route
1. Create the route in `app/api/your-route/route.ts`.
2. Add Zod validation schema to `lib/validations.ts`.
3. Wrap with `withAuth()` for authenticated endpoints.
4. Wrap the handler with `asyncErrorHandler()`.
5. Use `checkChatRateLimit()` or general rate limiting as appropriate.
6. Use repositories via services for database operations -- never raw SQL.

### Adding a New Repository
1. Create `lib/db/repositories/your-entity.repository.ts` extending the base.
2. Add singleton getter to `lib/db/repositories/index.ts`.
3. Create `lib/services/your-entity.service.ts` if business logic is needed.
4. Add singleton getter to `lib/services/index.ts`.

### Modifying the System Prompt
- Edit `SYSTEM_PROMPT` in `lib/ai/agent.ts`.
- For context-aware enhancements, modify `generateAgenticSystemPrompt()` in `lib/ai/prompt-generator.ts`.
