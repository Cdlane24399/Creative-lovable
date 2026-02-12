---
name: new-tool
description: Scaffold a new AI agent tool factory following project conventions. Use when adding tools to the AI agent.
---

# New AI Agent Tool Scaffolding

Create a new tool factory in `lib/ai/tools/` following project conventions.

## Steps

1. Create `lib/ai/tools/{name}.tools.ts` using the factory pattern below
2. Export the factory from `lib/ai/tools/index.ts`
3. Call the factory and spread its tools in `lib/ai/web-builder-agent.ts`

## Factory Template

**CRITICAL**: Use `inputSchema` (NOT `parameters`) — AI SDK v6 requirement.

```typescript
import { tool } from "ai"
import { z } from "zod"
import type { AgentContext } from "@/lib/ai/context-types"

export function createMyTools(context: AgentContext) {
  return {
    myTool: tool({
      description: "What this tool does",
      inputSchema: z.object({
        param: z.string().describe("Parameter description"),
      }),
      execute: async ({ param }) => {
        // Use context.sandbox for E2B operations
        // Use context.projectId for database operations
        return { success: true, message: "Result" }
      },
    }),
  }
}
```

## Key Context Properties

| Property | Type | Purpose |
|---|---|---|
| `context.sandbox` | `Sandbox` | E2B sandbox instance for file/command operations |
| `context.projectId` | `string` | Project ID for database persistence |
| `context.userId` | `string` | Authenticated user ID |

## Registration

In `lib/ai/tools/index.ts`, add the export:
```typescript
export { createMyTools } from "./my.tools"
```

In `lib/ai/web-builder-agent.ts`, spread the tools:
```typescript
const myTools = createMyTools(context)
// Add to the tools object passed to streamText
```

## Checklist

- [ ] Uses `inputSchema` (not `parameters`)
- [ ] Factory accepts `AgentContext`
- [ ] Exported from `lib/ai/tools/index.ts`
- [ ] Registered in `lib/ai/web-builder-agent.ts`
- [ ] Zod schemas have `.describe()` on each field
- [ ] Returns structured result object
