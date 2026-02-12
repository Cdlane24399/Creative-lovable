# GitHub Copilot Instructions for Creative-lovable

This document provides comprehensive instructions for GitHub Copilot to understand the Creative-lovable codebase and generate accurate, consistent suggestions.

---

## Project Overview

Creative-lovable is an AI-powered web development assistant that builds real, working Next.js applications in seconds. It uses E2B sandboxes for secure, isolated code execution and the Vercel AI SDK v6 for agentic workflows with multi-step tool calling. Users interact via a chat interface; the AI agent scaffolds, writes, edits, and runs code inside cloud sandboxes.

---

## Tech Stack

| Category        | Technology                                        | Version                                         | Notes                                              |
| --------------- | ------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Framework       | Next.js                                           | 16+                                             | App Router, Server Components, Turbopack           |
| Language        | TypeScript                                        | 5.9+                                            | Strict mode enabled                                |
| React           | React                                             | 19.2.4                                          | Server and Client Components                       |
| Styling         | Tailwind CSS                                      | 4.x                                             | Uses `@theme` directive, `@tailwindcss/postcss`    |
| UI Components   | shadcn/ui, Radix UI                               | Latest                                          | Full component library pre-installed               |
| AI SDK          | Vercel AI SDK                                     | v6 (ai@^6.0.73)                                 | `streamText`, `tool()`, `stepCountIs`, `UIMessage` |
| AI React        | @ai-sdk/react                                     | 3.0.75                                          | `useChat`, `DefaultChatTransport`                  |
| AI Providers    | @ai-sdk/anthropic, @ai-sdk/google, @ai-sdk/openai | 3.x                                             | Via AI Gateway                                     |
| Code Execution  | E2B (e2b, @e2b/code-interpreter)                  | 2.x                                             | Sandbox lifecycle management                       |
| Sandbox Alt     | @vercel/sandbox                                   | 1.4.1                                           | Alternative sandbox runtime                        |
| Database        | @neondatabase/serverless                          | 1.x                                             | PostgreSQL via Neon                                |
| Auth            | Supabase Auth                                     | @supabase/ssr ^0.8, @supabase/supabase-js ^2.95 | Cookie-based SSR auth                              |
| Cache           | @upstash/redis                                    | 1.36+                                           | Redis for caching                                  |
| Animations      | Framer Motion                                     | 12.x                                            | Motion components                                  |
| Charts          | Recharts                                          | 3.7                                             | Data visualization                                 |
| Forms           | react-hook-form + @hookform/resolvers + Zod       | 7.x / 5.x / 4.x                                 | Form handling + validation                         |
| Testing         | Jest 30, Playwright 1.58                          | Latest                                          | Unit + E2E tests                                   |
| Package Manager | pnpm                                              |                                                 | Not npm or yarn                                    |
| Editor          | Monaco Editor                                     | 4.7                                             | In-browser code editing                            |

---

## AI Models (from `lib/ai/providers.ts`)

Models are accessed via AI Gateway using `getModel(key)` and `getGatewayProviderOptions(key)`.

| Key                   | Model                  | Gateway ID                            | Provider Order                       |
| --------------------- | ---------------------- | ------------------------------------- | ------------------------------------ |
| `anthropic` (default) | Claude Sonnet 4.5      | `anthropic/claude-sonnet-4-5`         | anthropic, vertex                    |
| `opus`                | Claude Opus 4.6        | `anthropic/claude-opus-4-6`           | anthropic, vertex                    |
| `google`              | Gemini 3 Flash Preview | `google/gemini-3-flash-preview`       | google, vertex                       |
| `googlePro`           | Gemini 3 Pro Preview   | `google/gemini-3-pro-preview`         | google, vertex                       |
| `openai`              | GPT-5.2                | `openai/gpt-5.2`                      | openai                               |
| `haiku`               | Claude 3.5 Haiku       | `anthropic/claude-3-5-haiku-20241022` | anthropic, vertex (title generation) |
| `minimax`             | MiniMax M2.1           | `minimax/minimax-m2.1`                | minimax                              |
| `moonshot`            | Kimi K2.5              | `moonshotai/kimi-k2.5`                | moonshotai                           |
| `glm`                 | GLM-4.7                | `zai/glm-4.7`                         | zai                                  |

Model settings are defined in `lib/ai/agent.ts` via `MODEL_SETTINGS` (maxSteps, maxTokens per model). The `ModelProvider` type and `ModelKey` type are interchangeable.

---

## Architecture

### Layered Architecture

```
Client (React + useChat)
  |
  v
API Routes (app/api/) --- withAuth middleware --- checkChatRateLimit
  |
  v
Services Layer (lib/services/) --- Business logic, caching, coordination
  |
  v
Repository Layer (lib/db/repositories/) --- Data access, SQL queries
  |
  v
Neon PostgreSQL (via @neondatabase/serverless)

AI Agent Pipeline:
  Chat API Route
    -> withSandbox(projectId) --- AsyncLocalStorage-based sandbox context
    -> streamText(model, tools, messages)
    -> createContextAwareTools(projectId) --- All tool factories composed
    -> prepareStep() --- Dynamic tool activation per step
    -> onStepFinish() --- Token usage tracking
    -> toUIMessageStreamResponse() --- Streaming to client
```

### Sandbox Lifecycle

Sandbox state is managed via in-memory Maps in `lib/e2b/sandbox.ts`:

- `activeSandboxes`: Map of projectId -> active `Sandbox` instance
- `pausedSandboxes`: Map of projectId -> paused sandbox info (sandboxId, pausedAt)
- `connectionAttempts`: Map of sandboxId -> retry tracking (count, lastAttempt)

Key operations: `createSandbox`, `createSandboxWithAutoPause`, `getSandbox` (with reconnection), `pauseSandbox`, `resumeSandbox`, `closeSandbox`. Includes connection retry logic and periodic auto-cleanup of idle sandboxes.

Sandbox persistence: sandbox IDs are saved to the database via `ProjectRepository`, allowing reconnection across API route invocations. File snapshots are persisted for restoration after sandbox expiration.

### Sandbox Provider (AsyncLocalStorage)

The `withSandbox()` function in `lib/e2b/sandbox-provider.ts` uses `AsyncLocalStorage` to provide request-scoped sandbox access. Tools call `getCurrentSandbox()` to get the shared sandbox instance rather than creating their own.

---

## Directory Structure

```
app/
  api/
    chat/route.ts              # Main chat endpoint (streamText + tools)
    projects/                   # CRUD + messages + restore + screenshot
    generate-title/route.ts     # Title generation via Haiku
    improve-prompt/route.ts     # Prompt enhancement
    sandbox/                    # Dev server management
    health/                     # Health + readiness checks
    integrations/               # External integrations
    screenshot/route.ts         # Screenshot capture
  (auth)/                       # Authentication routes
components/
  ui/                           # shadcn/ui components
  features/                     # Feature-specific components
  shared/                       # Reusable shared components
  layout/                       # Layout components (Header, etc.)
hooks/
  use-chat-with-tools.ts        # Enhanced useChat hook with tool support
lib/
  ai/
    agent.ts                    # SYSTEM_PROMPT, MODEL_SETTINGS, MODEL_DISPLAY_NAMES
    providers.ts                # AI Gateway: createGateway(), getModel(), getGatewayProviderOptions()
    web-builder-agent.ts        # createContextAwareTools() - tool composition
    agent-context.ts            # Per-project agent context tracking
    prompt-generator.ts         # Dynamic system prompt generation
    schemas/                    # Zod schemas for tool parameters
    errors/                     # WebBuilderError, InvalidPathError, SandboxError
    utils/                      # Path normalization, formatting utilities
    helpers/                    # Scaffolding, file writing helpers
    tools/
      index.ts                  # Barrel export for all tool factories
      planning.tools.ts         # planChanges, markStepComplete, analyzeProjectState
      state.tools.ts            # Sandbox and application state
      file.tools.ts             # writeFile, readFile, editFile
      batch-file.tools.ts       # batchWriteFiles (bulk operations)
      project.tools.ts          # getProjectStructure, installPackage
      project-init.tools.ts     # initializeProject (new project scaffolding)
      sync.tools.ts             # syncProject (database persistence)
      build.tools.ts            # getBuildStatus, runCommand, startDevServer
      website.tools.ts          # createWebsite (DEPRECATED)
      code.tools.ts             # executeCode
      suggestion.tools.ts       # generateSuggestions
  db/
    repositories/
      base.repository.ts        # BaseRepository, generateId, parseJsonSafe
      project.repository.ts     # ProjectRepository + getProjectRepository()
      message.repository.ts     # MessageRepository + getMessageRepository()
      context.repository.ts     # ContextRepository + getContextRepository()
      integration.repository.ts # IntegrationRepository + getIntegrationRepository()
      token-usage.repository.ts # TokenUsageRepository + getTokenUsageRepository()
      index.ts                  # Barrel exports
    types.ts                    # Database entity types
  services/
    project.service.ts          # ProjectService + getProjectService()
    message.service.ts          # MessageService + getMessageService()
    context.service.ts          # ContextService + getContextService()
    token-usage.service.ts      # TokenUsageService + getTokenUsageService()
    index.ts                    # Barrel exports
  e2b/
    sandbox.ts                  # Sandbox CRUD, file ops, command execution, screenshots
    sandbox-provider.ts         # withSandbox(), getCurrentSandbox() (AsyncLocalStorage)
    sync-manager.ts             # File sync to database
    delta-sync.ts               # Incremental file sync
    file-watcher.ts             # File change detection
  auth.ts                       # withAuth middleware, authenticateRequest
  errors.ts                     # AppError hierarchy (9 error classes)
  validations.ts                # Zod schemas for API request validation
  rate-limit.ts                 # Rate limiting (100/min general, 20/min chat)
  logger.ts                     # Structured Logger class, JSON in prod, pretty in dev
  supabase/                     # Supabase client setup
```

---

## Key Conventions and Patterns

### Import Aliases

Always use `@/*` path aliases for imports:

```typescript
import { getModel } from "@/lib/ai/providers";
import { logger } from "@/lib/logger";
import { withAuth } from "@/lib/auth";
```

### Singleton Getters

All repositories and services use singleton getter functions. Never instantiate directly:

```typescript
// Correct
const projectService = getProjectService()
const projectRepo = getProjectRepository()

// Wrong - do not instantiate directly
const service = new ProjectService(...)
```

Available getters:

- Services: `getProjectService()`, `getMessageService()`, `getContextService()`, `getTokenUsageService()`
- Repositories: `getProjectRepository()`, `getMessageRepository()`, `getContextRepository()`, `getIntegrationRepository()`, `getTokenUsageRepository()`

### Error Handling

Use the custom error hierarchy from `lib/errors.ts`:

```typescript
import {
  ValidationError,
  AuthenticationError,
  DatabaseError,
  asyncErrorHandler,
} from "@/lib/errors";

// Wrap API routes with asyncErrorHandler for automatic error formatting
export const POST = withAuth(
  asyncErrorHandler(async (req: Request) => {
    if (!isValid) {
      throw new ValidationError("Invalid input", errors);
    }
  }),
);
```

Error classes (all extend `AppError`):

- `AuthenticationError` (401)
- `AuthorizationError` (403)
- `ValidationError` (400) - includes `errors: Record<string, string[]>`
- `NotFoundError` (404)
- `RateLimitError` (429) - includes `retryAfter: number`
- `DatabaseError` (500)
- `ExternalServiceError` (502)
- `SandboxError` (500)
- `FileSystemError` (500)
- `ConfigurationError` (500, non-operational)

### Request Validation

Use Zod schemas from `lib/validations.ts` for all API inputs:

```typescript
import {
  validateRequest,
  chatRequestSchema,
  ValidationError,
  createValidationErrorResponse,
} from "@/lib/validations";

try {
  const validated = validateRequest(chatRequestSchema, body);
} catch (error) {
  if (error instanceof ValidationError) {
    return createValidationErrorResponse(error);
  }
}
```

Pre-defined schemas: `chatRequestSchema`, `createProjectSchema`, `updateProjectSchema`, `runCommandSchema`, `writeFileSchema`, `improvePromptSchema`, `generateTitleSchema`, `modelProviderSchema`, `projectIdSchema`.

### Logging

Use the structured logger from `lib/logger.ts`:

```typescript
import { logger } from "@/lib/logger"

// Create a child logger with context
const log = logger.child({ requestId, operation: 'chat' })

log.info('Request received', { projectId, model })
log.error('Failed to process', { error: err.message })

// Time async operations
await log.time('database-query', async () => {
  return await db.query(...)
})
```

Logger outputs JSON in production, pretty-printed text in development. Log levels: `debug`, `info`, `warn`, `error`.

### Authentication

Use `withAuth` middleware from `lib/auth.ts` for all API routes:

```typescript
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async (req: Request) => {
  // Handler is only called if auth passes
});
```

Auth flow: Supabase cookie auth -> API key header (`x-api-key` or `Authorization: Bearer`) -> Development mode bypass.

### Rate Limiting

Two tiers defined in `lib/rate-limit.ts`:

- General API: 100 requests/minute per IP (`checkRateLimit`)
- Chat endpoint: 20 requests/minute per IP (`checkChatRateLimit`)

Use `withRateLimit` middleware or call `checkChatRateLimit` directly in streaming routes.

---

## AI SDK v6 Patterns

### Streaming with streamText

```typescript
import { streamText, stepCountIs, convertToModelMessages } from "ai"
import { getModel, getGatewayProviderOptions } from "@/lib/ai/providers"

const result = streamText({
  model: getModel('anthropic'),
  providerOptions: getGatewayProviderOptions('anthropic'),
  system: systemPrompt,
  messages: await convertToModelMessages(uiMessages),
  tools: createContextAwareTools(projectId),
  stopWhen: stepCountIs(50),
  prepareStep: async ({ stepNumber, messages }) => {
    // Dynamic tool activation and conversation compression
    return { activeTools: [...] }
  },
  onStepFinish: async ({ text, toolCalls, usage }) => {
    // Token usage tracking
  },
  experimental_repairToolCall: async ({ toolCall, error }) => {
    // Auto-fix common tool input errors
  },
})

return result.toUIMessageStreamResponse({
  originalMessages: messages,
  onError: (error) => "User-friendly error message",
  onFinish: async ({ messages }) => {
    // Persist messages to database
  },
})
```

### Tool Definition

```typescript
// IMPORTANT: Use `inputSchema` (NOT `parameters`) — AI SDK v6 reads `inputSchema` internally
import { tool } from "ai";
import { z } from "zod";

const myTool = tool({
  description: "Does something useful",
  inputSchema: z.object({
    input: z.string().describe("The input to process"),
  }),
  execute: async ({ input }) => {
    const sandbox = getCurrentSandbox();
    // Tool implementation using shared sandbox
    return { result: "processed" };
  },
});
```

### Tool Factory Pattern

Tools are organized into factory functions that accept a `projectId`:

```typescript
export function createFileTools(projectId: string) {
  return {
    writeFile: tool({
      description: "...",
      inputSchema: z.object({ ... }),
      execute: async ({ path, content }) => {
        const sandbox = getCurrentSandbox()
        // implementation
      },
    }),
    readFile: tool({ ... }),
    editFile: tool({ ... }),
  }
}
```

### Client-Side Chat Hook

```typescript
import { useChatWithTools } from "@/hooks/use-chat-with-tools";

const {
  messages,
  input,
  handleSubmit,
  isWorking, // submitted || streaming
  isCallingTools, // active tool calls in progress
  status, // 'submitted' | 'streaming' | 'ready' | 'error'
  getThinkingTime, // thinking duration per message
  stop, // abort current streaming
} = useChatWithTools({
  projectId: "my-project",
  model: "anthropic",
  initialMessages: dbMessages,
});
```

Uses `DefaultChatTransport` with `/api/chat` endpoint. Transport is recreated when `model` or `projectId` changes.

---

## AI Agent Tools

### Current Tools (via `createContextAwareTools`)

| Tool                  | Factory     | Description                                                            |
| --------------------- | ----------- | ---------------------------------------------------------------------- |
| `planChanges`         | Planning    | Create a task graph for multi-step changes                             |
| `markStepComplete`    | Planning    | Mark a planned step as done                                            |
| `analyzeProjectState` | State       | Analyze current project state                                          |
| `writeFile`           | File        | Write a single file to sandbox                                         |
| `readFile`            | File        | Read a file from sandbox                                               |
| `editFile`            | File        | Make targeted edits to existing file                                   |
| `batchWriteFiles`     | BatchFile   | Write multiple files in one operation                                  |
| `initializeProject`   | ProjectInit | Scaffold a new project structure                                       |
| `syncProject`         | Sync        | Sync sandbox files to database                                         |
| `getProjectStructure` | Project     | Scan and return project file tree                                      |
| `installPackage`      | Build       | Install npm packages                                                   |
| `getBuildStatus`      | Build       | Check for build errors                                                 |
| `startDevServer`      | Build       | Start the development server                                           |
| `runCommand`          | Build       | Execute shell commands                                                 |
| `executeCode`         | Code        | Run code (Python, JS, TS)                                              |
| `generateSuggestions` | Suggestion  | Generate follow-up suggestions                                         |
| `createWebsite`       | Website     | **DEPRECATED** - Use initializeProject + batchWriteFiles + syncProject |

### Dynamic Tool Activation (prepareStep)

The chat route uses `prepareStep` to control which tools are available at each step:

- Step 0: Planning + Creation (`initializeProject`, `batchWriteFiles`, `syncProject`) + File + Build + Suggestions
- Build errors detected: File + BatchFile + Build + Suggestions
- Server running with task graph: File + BatchFile + Build + `markStepComplete` + `syncProject` + Suggestions
- Otherwise (step 1+): All tools available (no restriction)

---

## Sandbox Operations

### Key Functions (from `lib/e2b/sandbox.ts`)

```typescript
// Sandbox lifecycle
createSandbox(projectId, templateId?, options?)
getSandbox(projectId)
closeSandbox(projectId)
pauseSandbox(projectId)
resumeSandbox(projectId)
createSandboxWithAutoPause(projectId, autoPause?)

// File operations
writeFile(sandbox, path, content)
writeFiles(sandbox, files[], options?)  // Batch with concurrency
readFile(sandbox, path)
listFiles(sandbox, path?)

// Command execution
executeCommand(sandbox, command, optionsOrTimeout?)
executeCode(sandbox, code, language?)

// Dev server
startBackgroundProcess(sandbox, command, options?)
waitForDevServer(sandbox, port?, maxWaitMs?)
checkDevServerStatus(sandbox, ports?)
getHostUrl(sandbox, port?)

// Screenshots
captureSandboxScreenshot(projectId, options?)
```

### Sandbox Provider Pattern

```typescript
import { withSandbox, getCurrentSandbox } from "@/lib/e2b/sandbox-provider"

// In API route - wraps entire request in sandbox context
return withSandbox(projectId, async () => {
  const result = streamText({ ... })
  return result.toUIMessageStreamResponse()
}, { projectDir: "/home/user/project", autoPause: true })

// In tools - access shared sandbox
const sandbox = getCurrentSandbox()
```

### Sandbox Persistence

- Sandbox IDs: Stored in database via `ProjectRepository.updateSandbox()`
- File snapshots: Stored via `ProjectRepository.saveFilesSnapshot()`
- Auto-restore: When sandbox expires and is recreated, files are restored from snapshot
- TTL: 30 minutes idle timeout, cleaned up every 5 minutes
- Default timeout: 10 minutes per sandbox

---

## API Routes

| Endpoint                              | Method             | Description                                              |
| ------------------------------------- | ------------------ | -------------------------------------------------------- |
| `/api/chat`                           | POST               | Main chat endpoint, streams AI responses with tool calls |
| `/api/projects`                       | GET, POST          | List and create projects                                 |
| `/api/projects/[id]`                  | GET, PATCH, DELETE | Project CRUD                                             |
| `/api/projects/[id]/messages`         | GET, POST          | Message history                                          |
| `/api/projects/[id]/restore`          | POST               | Restore project from snapshot                            |
| `/api/projects/[id]/screenshot`       | GET                | Capture project screenshot                               |
| `/api/generate-title`                 | POST               | Generate title from conversation                         |
| `/api/improve-prompt`                 | POST               | Enhance user prompt                                      |
| `/api/sandbox/[projectId]/dev-server` | POST               | Manage dev server                                        |
| `/api/screenshot`                     | POST               | Generic screenshot capture                               |
| `/api/health`                         | GET                | Health check                                             |
| `/api/health/ready`                   | GET                | Readiness check                                          |
| `/api/integrations/[provider]`        | GET, POST          | External integrations                                    |

All routes use `withAuth` middleware. Chat route has additional `checkChatRateLimit`. Max duration for chat is 300 seconds.

---

## Database Layer

### Repository Pattern

All repositories extend `BaseRepository` which provides:

- `generateId()` - UUID generation
- `parseJsonSafe()` / `toJsonString()` - JSON handling
- Pagination via `FindOptions` and `PaginatedResult`
- Mutation results via `MutationResult`

### Repositories

| Repository              | Getter                       | Manages                                           |
| ----------------------- | ---------------------------- | ------------------------------------------------- |
| `ProjectRepository`     | `getProjectRepository()`     | Projects, sandbox IDs, file snapshots             |
| `MessageRepository`     | `getMessageRepository()`     | Chat messages per project                         |
| `ContextRepository`     | `getContextRepository()`     | Agent context (files, build status, server state) |
| `IntegrationRepository` | `getIntegrationRepository()` | External service integrations                     |
| `TokenUsageRepository`  | `getTokenUsageRepository()`  | Per-step token usage tracking                     |

### Services

| Service             | Getter                   | Responsibility                             |
| ------------------- | ------------------------ | ------------------------------------------ |
| `ProjectService`    | `getProjectService()`    | Project CRUD, ensureProjectExists, caching |
| `MessageService`    | `getMessageService()`    | saveConversation, message formatting       |
| `ContextService`    | `getContextService()`    | Agent context summaries                    |
| `TokenUsageService` | `getTokenUsageService()` | recordTokenUsage per step                  |

---

## Environment Variables

| Variable                        | Required    | Description                            |
| ------------------------------- | ----------- | -------------------------------------- |
| `E2B_API_KEY`                   | Yes         | API key for E2B sandboxes              |
| `AI_GATEWAY_URL`                | Recommended | AI Gateway endpoint                    |
| `AI_GATEWAY_API_KEY`            | Recommended | AI Gateway auth token                  |
| `ANTHROPIC_API_KEY`             | Fallback    | Direct Anthropic API key               |
| `OPENAI_API_KEY`                | Fallback    | Direct OpenAI API key                  |
| `GOOGLE_GENERATIVE_AI_API_KEY`  | Fallback    | Direct Google API key                  |
| `DATABASE_URL`                  | Yes         | Neon PostgreSQL connection string      |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes         | Supabase project URL                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes         | Supabase anon key                      |
| `API_KEY`                       | Production  | Server-side API key for auth           |
| `E2B_TEMPLATE_ID`               | Recommended | Custom E2B template for faster startup |
| `LOG_LEVEL`                     | No          | Logging level (debug/info/warn/error)  |

---

## Common Commands

| Command               | Description                     |
| --------------------- | ------------------------------- |
| `pnpm dev`            | Start Next.js dev server        |
| `pnpm build`          | Production build                |
| `pnpm test`           | Run Jest unit tests             |
| `pnpm test:watch`     | Run tests in watch mode         |
| `pnpm test:coverage`  | Run tests with coverage         |
| `pnpm test:e2e`       | Run Playwright E2E tests        |
| `pnpm test:e2e:ui`    | Playwright E2E with UI          |
| `pnpm lint`           | ESLint check                    |
| `pnpm template:build` | Build E2B template              |
| `pnpm sandbox`        | Create a test sandbox           |
| `pnpm db:up`          | Start local Supabase via Docker |
| `pnpm db:down`        | Stop local Supabase             |

---

## Code Style and Conventions

- **Formatting**: Follow existing code style. No semicolons in most files (varies by file).
- **Components**: Reusable components in `components/`, organized by `ui/`, `features/`, `shared/`, `layout/`.
- **API Routes**: All in `app/api/`. Always wrap with `withAuth`. Use Zod validation schemas from `lib/validations.ts`.
- **Logging**: Use `logger` from `lib/logger.ts`. Never use raw `console.log` in production code (sandbox operations are the exception).
- **Error Handling**: Use `AppError` subclasses from `lib/errors.ts`. Wrap handlers with `asyncErrorHandler`.
- **State Management**: Zustand for client global state, React Query for server state, useState for local state.
- **Exports**: Use barrel files (`index.ts`) for clean imports. Use named exports, not default exports (except pages).
- **Types**: Define types near usage. Export from barrel files. Use Zod for runtime validation, TypeScript for compile-time types.
- **AI Tools**: Define in separate `*.tools.ts` files, export factory functions. Use `getCurrentSandbox()` for sandbox access within tools.
- **Deprecated patterns**: `createWebsite` is deprecated. Use `initializeProject` + `batchWriteFiles` + `syncProject` instead.
