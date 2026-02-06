# Architecture Overview

## Directory Structure
```
app/
├── api/                    # API routes (thin controllers)
├── (auth)/                 # Auth-related pages
├── auth/                   # Auth callbacks
├── layout.tsx              # Root layout
└── page.tsx                # Landing page

lib/
├── ai/                     # AI/Agent logic
│   ├── agent.ts           # System prompt, model config (MODEL_SETTINGS, MODEL_DISPLAY_NAMES)
│   ├── providers.ts       # AI Gateway via createGateway(), getModel(), getGatewayProviderOptions()
│   ├── web-builder-agent.ts # Context-aware AI tools (createContextAwareTools)
│   ├── agent-context.ts   # Context management (write-through)
│   ├── planning/          # TaskGraph-based planning
│   └── tools/             # Tool barrel exports and implementations
│       ├── index.ts             # Barrel export for all tool factories
│       ├── planning.tools.ts    # Task planning and workflow tools
│       ├── state.tools.ts       # Sandbox/application state tools
│       ├── file.tools.ts        # File operations (read, write, delete)
│       ├── batch-file.tools.ts  # Bulk file operations (NEW)
│       ├── project.tools.ts     # Project structure and config tools
│       ├── project-init.tools.ts # Project initialization (NEW)
│       ├── sync.tools.ts        # Database persistence/sync (NEW)
│       ├── build.tools.ts       # Build and bundling tools
│       ├── website.tools.ts     # Website scaffolding (DEPRECATED)
│       ├── code.tools.ts        # Code analysis and transformation
│       └── suggestion.tools.ts  # Follow-up suggestion generation
├── cache/                  # Cache manager (@upstash/redis + LRU fallback)
│   ├── cache-manager.ts   # CacheManager class, singleton getCacheManager()
│   └── index.ts           # Cache barrel export
├── db/
│   └── repositories/       # Type-safe DB operations
│       ├── base.repository.ts
│       ├── project.repository.ts
│       ├── message.repository.ts
│       └── context.repository.ts
├── e2b/                    # E2B sandbox management
│   ├── sandbox.ts
│   ├── sync-manager.ts
│   └── sandbox-state-machine.ts
├── services/               # Business logic layer
│   ├── project.service.ts
│   ├── message.service.ts
│   └── context.service.ts
├── errors.ts               # Error classes and handlers
└── auth.ts                 # Authentication utilities

components/
├── ui/                     # shadcn/ui components
├── landing/                # Landing page components
├── chat/                   # Chat interface
├── auth/                   # Auth components
├── shared/                 # Shared components (icons, model-selector)
├── code-editor.tsx         # Monaco editor
├── preview-panel.tsx       # App preview
├── chat-panel.tsx          # AI chat interface
└── editor-layout.tsx       # Main editor layout

hooks/
└── use-chat-with-tools.ts  # AI chat hook
```

## Key Architectural Concepts

### Layered Architecture
```
API Routes → Services → Repositories → Cache → Agent Context → Sandbox State Machine
```

### AI Gateway (via createGateway)
```typescript
import { createGateway } from "ai"
import { getModel, getGatewayProviderOptions } from "@/lib/ai/providers"

const model = getModel('anthropic')  // Returns gateway-routed model
const providerOptions = getGatewayProviderOptions('anthropic')
```

### Agent Context (Write-Through Caching)
```typescript
import { getAgentContext, updateFileInContext } from "@/lib/ai/agent-context"
// Writes immediately to DB, never debounced
```

### Sandbox State Machine
States: `idle` → `creating` → `active` → `paused` → `expired` → `error`
```typescript
import { getSandboxStateMachine } from "@/lib/e2b/sandbox-state-machine"
machine.transition(projectId, "CREATE")
```

### TaskGraph Planning (Not legacy string arrays)
```typescript
import { setTaskGraph, updateTaskStatus } from "@/lib/ai/agent-context"
setTaskGraph(projectId, taskGraph)
```

### Cache Manager (@upstash/redis + LRU fallback)
```typescript
import { getCacheManager, invalidateProjectCache } from "@/lib/cache"
const cache = getCacheManager()
await cache.invalidateAllForProject(projectId)
```

## Tool Categories
| Category | Factory | Description |
|----------|---------|-------------|
| Planning | `createPlanningTools` | Task planning and workflow organization |
| State | `createStateTools` | Sandbox and application state management |
| File | `createFileTools` | File read, write, delete operations |
| BatchFile | `createBatchFileTools` | Bulk file operations (NEW) |
| Project | `createProjectTools` | Project structure and configuration |
| ProjectInit | `createProjectInitTools` | New project initialization (NEW) |
| Sync | `createSyncTools` | Database persistence and sync (NEW) |
| Build | `createBuildTools` | Building and bundling |
| Website | `createWebsiteTools` | Website scaffolding (DEPRECATED) |
| Code | `createCodeTools` | Code analysis and transformation |
| Suggestion | `createSuggestionTools` | Follow-up suggestion generation |

## API Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/projects` | GET/POST | List/Create projects |
| `/api/projects/[id]` | GET/PATCH/DELETE | Project CRUD |
| `/api/projects/[id]/messages` | GET/POST | Messages |
| `/api/chat` | POST | AI chat with tools |
