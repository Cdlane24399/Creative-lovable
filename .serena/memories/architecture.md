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
│   ├── agent.ts           # System prompt, model config
│   ├── web-builder-agent.ts # Context-aware AI tools
│   ├── agent-context.ts   # Context management (write-through)
│   └── planning/          # TaskGraph-based planning
├── cache/                  # Cache manager (Vercel KV)
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
├── shared/                 # Shared components
├── code-editor.tsx         # Monaco editor
├── preview-panel.tsx       # App preview
├── chat-panel.tsx          # AI chat interface
└── editor-layout.tsx       # Main editor layout

hooks/
└── use-chat-with-tools.ts  # AI chat hook
```

## Key Architectural Concepts

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

## API Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/projects` | GET/POST | List/Create projects |
| `/api/projects/[id]` | GET/PATCH/DELETE | Project CRUD |
| `/api/projects/[id]/messages` | GET/POST | Messages |
| `/api/chat` | POST | AI chat with tools |
