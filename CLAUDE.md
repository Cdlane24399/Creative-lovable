# CLAUDE.md - Project Documentation

This file provides guidance for AI assistants working on the Creative-lovable codebase.

## Project Overview

Creative-lovable is an AI-powered web development assistant that builds real, working applications using E2B sandboxes, Next.js 15, and AI SDK v6. It features a layered architecture with proper separation of concerns.

## Tech Stack

- **Frontend**: Next.js 15, React 18, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui, Framer Motion, Lucide Icons
- **AI**: AI SDK v6 (Vercel), Claude/GPT-4o/Gemini support
- **Database**: Neon (PostgreSQL serverless)
- **Sandboxes**: E2B for isolated code execution
- **Cache**: Vercel KV (optional)

## Architecture Layers

### 1. API Routes Layer (`app/api/`)
Thin controllers that handle HTTP requests and responses. Use services for all business logic.

```typescript
// Example: Always use services, not direct DB access
import { getProjectService } from "@/lib/services"

export const GET = withAuth(asyncErrorHandler(async (request) => {
  const projectService = getProjectService()
  const result = await projectService.listProjects(options)
  return NextResponse.json(result)
}))
```

### 2. Services Layer (`lib/services/`)
Business logic, caching coordination, and cross-entity operations.

- **ProjectService**: Project CRUD, sandbox management, file snapshots
- **MessageService**: AI SDK v6 message persistence, UIMessage format
- **ContextService**: Agent context with write-through caching

### 3. Repository Layer (`lib/db/repositories/`)
Type-safe database operations using Neon serverless driver.

- **BaseRepository**: Abstract base with error handling
- **ProjectRepository**: Project table operations
- **MessageRepository**: Message table with proper parts storage
- **ContextRepository**: Agent context persistence

### 4. Cache Manager (`lib/cache/`)
Unified caching with Vercel KV.

```typescript
import { getCacheManager } from "@/lib/cache"

const cache = getCacheManager()
await cache.invalidateAllForProject(projectId)
```

### 5. Agent Context (`lib/ai/agent-context.ts`)
Write-through caching for agent state. **Never debounced** - writes immediately to DB.

```typescript
import { getAgentContext, updateFileInContext } from "@/lib/ai/agent-context"

// Get context (memory first, DB fallback)
const context = getAgentContext(projectId)

// Update file (writes to DB immediately)
updateFileInContext(projectId, "app/page.tsx", content, "updated")
```

### 6. Planning System (`lib/ai/planning/`)
TaskGraph-based planning with dependency tracking.

**IMPORTANT**: Legacy string array planning (`setCurrentPlan`) is deprecated. Use TaskGraph:

```typescript
import { setTaskGraph, updateTaskStatus } from "@/lib/ai/agent-context"

// Set a new task graph
setTaskGraph(projectId, taskGraph)

// Update task status
updateTaskStatus(projectId, taskId, "completed")
```

### 7. Sandbox State Machine (`lib/e2b/sandbox-state-machine.ts`)
Formal lifecycle management for sandboxes.

States: `idle` → `creating` → `active` → `paused` → `expired` → `error`

```typescript
import { getSandboxStateMachine } from "@/lib/e2b/sandbox-state-machine"

const machine = getSandboxStateMachine()
machine.transition(projectId, "CREATE")
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/ai/agent.ts` | System prompt, model configuration |
| `lib/ai/web-builder-agent.ts` | Context-aware tools for AI |
| `lib/ai/agent-context.ts` | Context management with write-through |
| `lib/db/repositories/*.ts` | Database operations |
| `lib/services/*.ts` | Business logic |
| `lib/e2b/sandbox.ts` | E2B sandbox management |
| `lib/cache/cache-manager.ts` | Unified caching |
| `lib/errors.ts` | Error classes and handlers |

## Code Patterns

### Error Handling
Always use `asyncErrorHandler` wrapper for API routes:

```typescript
export const GET = withAuth(asyncErrorHandler(async (request) => {
  // Errors are automatically caught and formatted
  throw new ValidationError("Invalid input", { field: ["message"] })
}))
```

### Database Access
Never use raw SQL in routes. Always use repositories:

```typescript
// ❌ Wrong
const sql = getDb()
await sql`SELECT * FROM projects`

// ✅ Correct
const projectRepo = getProjectRepository()
const project = await projectRepo.findById(id)
```

### Caching
Cache invalidation is centralized:

```typescript
// ❌ Wrong - scattered invalidation
await projectCache.invalidate(id)
await messagesCache.invalidate(id)

// ✅ Correct - unified
await invalidateProjectCache(id) // or getCacheManager().invalidateAllForProject(id)
```

### Message Persistence (AI SDK v6)
Messages must be stored in proper UIMessage format:

```typescript
// ❌ Wrong - JSON blob
await sql`INSERT INTO messages (content) VALUES (${JSON.stringify(messages)})`

// ✅ Correct - proper format
const messageService = getMessageService()
await messageService.saveConversation(projectId, messages)
```

## Build & Test

```bash
# Development
npm run dev

# Build (with type checking)
npm run build

# Type check only
npx tsc --noEmit

# Run tests
npm test
```

## Common Issues

### FK Constraint Violations
Always ensure project exists before saving context:

```typescript
await projectService.ensureProjectExists(projectId)
```

### Sandbox Timeouts
Sandboxes expire after 10 minutes of inactivity. The state machine handles recreation.

### Cache Staleness
Cache TTLs are short (30-60 seconds). Always invalidate on mutations.

## File Naming Conventions

- Repositories: `*.repository.ts`
- Services: `*.service.ts`
- Types: `*.types.ts` or in `types.ts`
- Tests: `*.test.ts` or in `__tests__/`

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/projects` | GET | List projects |
| `/api/projects` | POST | Create project |
| `/api/projects/[id]` | GET | Get project |
| `/api/projects/[id]` | PATCH | Update project |
| `/api/projects/[id]` | DELETE | Delete project |
| `/api/projects/[id]/messages` | GET | Get messages |
| `/api/projects/[id]/messages` | POST | Save messages |
| `/api/projects/[id]/screenshot` | POST | Save screenshot |
| `/api/chat` | POST | AI chat with tools |

## Environment Variables

Required:
- `E2B_API_KEY` - E2B sandbox API key
- `NEON_DATABASE_URL` or `DATABASE_URL` - Neon database URL
- At least one AI provider key

Optional:
- `E2B_TEMPLATE_ID` - Custom template for faster startup
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` - Vercel KV cache
- `API_KEY` - API authentication key
