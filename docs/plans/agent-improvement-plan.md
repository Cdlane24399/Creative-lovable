# Agent Architecture Improvement Plan

> **Purpose**: Comprehensive plan to modernize the Lumi web builder agent using AI SDK v6 patterns and installed skills knowledge. Optimized for execution by a Claude Code team using the Team tool with Opus model teammates.

## Executive Summary

The current agent (`app/api/chat/route.ts`) manually orchestrates `streamText` with ~900 lines of boilerplate: custom `prepareStep` logic, message pruning, tool repair, dual-provider fallback, and token budget management. AI SDK v6 introduces `ToolLoopAgent` and subagents that absorb most of this complexity declaratively.

This plan migrates to `ToolLoopAgent`, introduces a research subagent for automatic web search + skills discovery, and bakes in the installed skills knowledge (React best practices, composition patterns, web design guidelines) directly into the agent's system prompt and tool descriptions.

---

## Installed Skills Reference

| Skill | Path | Key Value |
|-------|------|-----------|
| `ai-sdk-6-skills` | `.agents/skills/ai-sdk-6-skills/` | ToolLoopAgent, tool approval, Gateway patterns |
| `vercel-react-best-practices` | `.agents/skills/vercel-react-best-practices/` | 57 rules, 8 categories (async, bundle, server, client, rerender, rendering, JS, advanced) |
| `vercel-composition-patterns` | `.agents/skills/vercel-composition-patterns/` | Compound components, boolean prop avoidance, state lifting, React 19 APIs |
| `web-design-guidelines` | `.agents/skills/web-design-guidelines/` | 100+ UX/accessibility/design rules (fetch from source URL) |
| `nextjs16-skills` | `.agents/skills/nextjs16-skills/` | Next.js 16 breaking changes, Turbopack, async APIs, proxy.ts |
| `mcp-server-skills` | `.agents/skills/mcp-server-skills/` | MCP server patterns for Next.js |
| `shadcn-skills` | `.agents/skills/shadcn-skills/` | shadcn/ui theming and component patterns |

---

## Phase 1: Research Subagent (High Priority)

**Goal**: Automatically research design inspiration and discover relevant skills before the agent starts coding, using an isolated context window.

### Task 1.1: Create Research Subagent Definition

**File**: `lib/ai/agents/research-agent.ts` (new)

```typescript
import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { tavilySearch } from '@tavily/ai-sdk';

export const researchAgent = new ToolLoopAgent({
  model: 'anthropic/claude-sonnet-4.5',
  instructions: `You are a research agent for a web builder. Your job is to:
1. Search the web for design inspiration, UI patterns, and relevant APIs
2. Search the skills registry for reusable skills matching the task
3. Summarize findings concisely for the main coding agent

IMPORTANT: Your final response must be a clear summary containing:
- Design inspiration URLs and key takeaways
- Relevant color palettes, typography suggestions, and layout patterns
- Any skills or packages discovered that could help
- API endpoints or data sources relevant to the task

Keep your summary under 2000 tokens.`,
  tools: {
    webSearch: tavilySearch({
      maxResults: 5,
      searchDepth: 'basic',
      includeAnswer: true,
    }),
    findSkills: tool({
      description: 'Search the Vercel Skills registry for reusable agent skills',
      inputSchema: z.object({
        query: z.string().describe('Search query for skills registry'),
      }),
      execute: async ({ query }) => {
        // This will use the sandbox from the parent context
        // Implementation depends on sandbox availability
        return { query, note: 'Skills search executed' };
      },
    }),
  },
  stopWhen: stepCountIs(5),
});
```

### Task 1.2: Create Research Tool for Main Agent

**File**: `lib/ai/tools/research.tools.ts` (new)

Create a tool that wraps the research subagent and exposes it to the main agent. Uses `toModelOutput` to keep only the summary in the main agent's context.

```typescript
import { tool, readUIMessageStream } from 'ai';
import { z } from 'zod';
import { researchAgent } from '../agents/research-agent';

export function createResearchTools(projectId: string) {
  const research = tool({
    description: `Research a topic before building. Use this FIRST on every new project to find design inspiration, relevant APIs, color palettes, typography, and reusable skills. Returns a concise summary.`,
    inputSchema: z.object({
      task: z.string().describe('What the user wants to build — used as the research query'),
    }),
    execute: async function* ({ task }, { abortSignal }) {
      const result = await researchAgent.stream({
        prompt: `Research for building: ${task}. Find design inspiration, relevant UI patterns, color palettes, typography suggestions, and any reusable skills or packages.`,
        abortSignal,
      });
      for await (const message of readUIMessageStream({
        stream: result.toUIMessageStream(),
      })) {
        yield message;
      }
    },
    toModelOutput: ({ output: message }) => {
      const lastTextPart = message?.parts.findLast(
        (p: { type: string }) => p.type === 'text'
      );
      return {
        type: 'text' as const,
        value: lastTextPart?.text ?? 'Research completed.',
      };
    },
  });

  return { research };
}
```

### Task 1.3: Register Research Tool

**File**: `lib/ai/tools/index.ts` — Add export for `createResearchTools`
**File**: `lib/ai/web-builder-agent.ts` — Import and compose into `createContextAwareTools`
**File**: `app/api/chat/route.ts` — Add `"research"` to `BOOTSTRAP_ACTIVE_TOOLS` and `DEFAULT_ACTIVE_TOOLS`

### Task 1.4: Update System Prompt for Research-First Workflow

**File**: `lib/ai/agent.ts`

Replace the current "Research first" step with:
```
1. **Research first.** Call `research` with the user's request before writing any code.
   This automatically searches the web for design inspiration and the skills registry
   for reusable packages. The research summary will inform your design choices.
```

**File**: `lib/ai/prompt-generator.ts`

Update Agentic Workflow step 1:
```
1. **Research** — Call `research` with the user's task description. This runs a dedicated
   research agent that searches the web and skills registry, returning a concise summary.
   Use the findings to inform your design and architecture decisions.
```

---

## Phase 2: ToolLoopAgent Migration (High Priority)

**Goal**: Replace the manual `streamText` orchestration in `route.ts` with `ToolLoopAgent` + `createAgentUIStreamResponse`.

### Task 2.1: Create Main Agent Definition

**File**: `lib/ai/agents/web-builder.ts` (new)

```typescript
import { ToolLoopAgent, stepCountIs } from 'ai';
import { getModel, getGatewayProviderOptions } from '../providers';
import { SYSTEM_PROMPT, MODEL_SETTINGS, type ModelProvider } from '../agent';
import { generateAgenticSystemPrompt } from '../prompt-generator';
import { createContextAwareTools } from '../web-builder-agent';

export function createWebBuilderAgent(
  projectId: string,
  model: ModelProvider,
) {
  const tools = createContextAwareTools(projectId);
  const systemPrompt = generateAgenticSystemPrompt(projectId, SYSTEM_PROMPT);
  const settings = MODEL_SETTINGS[model];

  return new ToolLoopAgent({
    model: getModel(model as any),
    providerOptions: getGatewayProviderOptions(model as any),
    instructions: systemPrompt,
    tools,
    stopWhen: stepCountIs(settings.maxSteps || 50),
    prepareStep: async ({ stepNumber, messages, steps }) => {
      // Phase-based tool selection (preserving existing logic)
      if (stepNumber === 0) {
        return {
          activeTools: ['research', 'analyzeProjectState', 'planChanges',
            'getProjectStructure', 'readFile', 'writeFile', 'editFile',
            'batchWriteFiles', 'installPackage', 'getBuildStatus', 'syncProject',
            'webSearch', 'findSkills'],
          toolChoice: 'auto',
        };
      }
      // ... migrate remaining prepareStep logic from route.ts
      return {};
    },
    onStepFinish: async ({ usage, toolCalls, finishReason }) => {
      // ... migrate step tracking from route.ts
    },
  });
}
```

### Task 2.2: Simplify Chat Route

**File**: `app/api/chat/route.ts`

Replace the ~400 lines of `createResult` / `streamText` / `prepareStep` / `onStepFinish` with:

```typescript
import { createAgentUIStreamResponse } from 'ai';
import { createWebBuilderAgent } from '@/lib/ai/agents/web-builder';

// Inside the POST handler:
const agent = createWebBuilderAgent(projectId, executionModel);

return createAgentUIStreamResponse({
  agent,
  uiMessages: messages,
  onError: streamErrorHandler,
  onFinish: streamFinishHandler,
});
```

### Task 2.3: Migrate prepareStep Logic

Move the existing `prepareStep` logic from `route.ts` into the agent definition:

- Token budget enforcement (soft/hard caps)
- Model-aware compression thresholds
- Context-based tool selection (build errors, active task graph)
- Message pruning with `pruneMessages`
- Tool input sanitization for MiniMax/moonshot/glm

### Task 2.4: Migrate Error Recovery

Move `experimental_repairToolCall` logic into the agent definition. The `ToolLoopAgent` supports this directly.

### Task 2.5: Migrate Provider Fallback

The current route has a try/catch that falls back from gateway to OpenRouter. This can be handled via the Gateway's `providerOptions.gateway.models` array for automatic fallback, or kept as a wrapper around the agent call.

---

## Phase 3: Skills Knowledge Integration (Medium Priority)

**Goal**: Bake the installed skills knowledge into the agent's system prompt and tool descriptions so it produces better code by default, without needing to web search for common patterns.

### Task 3.1: Create Condensed Skills Context

**File**: `lib/ai/skills-context.ts` (new)

Create a module that loads and condenses the most impactful skill rules into a compact context string that fits within the system prompt token budget.

Key rules to include (highest impact from installed skills):

**From `vercel-react-best-practices`** (CRITICAL priority):
- `async-parallel`: Use `Promise.all()` for independent operations
- `async-suspense-boundaries`: Use Suspense to stream content
- `bundle-barrel-imports`: Import directly, avoid barrel files
- `bundle-dynamic-imports`: Use `next/dynamic` for heavy components
- `server-parallel-fetching`: Restructure components to parallelize fetches

**From `vercel-composition-patterns`** (HIGH priority):
- `architecture-avoid-boolean-props`: Use composition instead
- `architecture-compound-components`: Structure complex components with shared context
- `state-lift-state`: Move state into provider components

**From `web-design-guidelines`**:
- Accessibility rules (focus states, ARIA, keyboard nav)
- Performance rules (image optimization, lazy loading)
- Responsive design rules

### Task 3.2: Inject Skills Context into System Prompt

**File**: `lib/ai/prompt-generator.ts`

Add a `## Code Quality Rules` section to the agentic addendum that includes the condensed skills context. Keep it under 500 tokens to avoid bloating the prompt.

```typescript
const skillsContext = `
## Code Quality Rules (from installed skills)

### Performance (CRITICAL)
- Use Promise.all() for independent async operations — never sequential awaits
- Use next/dynamic for heavy components (charts, editors, maps)
- Import directly from modules — avoid barrel file re-exports
- Use Suspense boundaries to stream independent content sections
- Parallelize server-side data fetching by restructuring component hierarchy

### Architecture (HIGH)
- Never add boolean props to customize behavior — use composition and explicit variants
- Use compound components with shared context for complex UI (Tabs, Accordions, Dialogs)
- Lift state into provider components when siblings need access

### Design (HIGH)
- All interactive elements must have visible focus states
- All images must have alt text; decorative images use alt=""
- Touch targets minimum 44x44px
- Color contrast minimum 4.5:1 for text, 3:1 for large text
- Test keyboard navigation for all interactive flows
`;
```

### Task 3.3: Update Tool Descriptions

Enhance existing tool descriptions to reference skills knowledge:

- `writeFile` / `batchWriteFiles`: Add note about following React best practices (no barrel imports, use Suspense boundaries)
- `planChanges`: Add note to consider composition patterns and performance rules when planning

---

## Phase 4: Forced Research via prepareStep (Low Priority)

**Goal**: Guarantee the research phase happens by using `toolChoice` forcing on step 0.

### Task 4.1: Force Research Tool on Step 0

In `prepareStep`, when `stepNumber === 0` and this is a new project (no existing files), force the research tool:

```typescript
prepareStep: async ({ stepNumber }) => {
  if (stepNumber === 0 && isNewProject) {
    return {
      activeTools: ['research'],
      toolChoice: { type: 'tool', toolName: 'research' },
    };
  }
  // ... rest of logic
}
```

This ensures the agent always researches first on new projects, but skips research for follow-up messages on existing projects.

### Task 4.2: Detect New vs Existing Project

Add a helper that checks `AgentContext` to determine if this is the first message in a new project (no files written yet) vs a continuation.

---

## Phase 5: Tool Approval for Destructive Operations (Low Priority)

**Goal**: Add `needsApproval` to destructive tools per AI SDK v6 patterns.

### Task 5.1: Add Approval to Sensitive Tools

Tools that could benefit from approval:
- `syncProject` (overwrites database state)
- `runCommand` (arbitrary command execution)
- Any future delete/deploy tools

```typescript
const syncProject = tool({
  description: 'Persist project files to database',
  inputSchema: z.object({ /* ... */ }),
  needsApproval: true,
  execute: async (input) => { /* ... */ },
});
```

### Task 5.2: Client-Side Approval UI

Add an approval component that renders when a tool's state is `'approval-requested'`. Uses the `addToolApprovalResponse` callback from `useChat`.

---

## Team Execution Plan

This plan is designed for parallel execution by a team of Opus model agents. Below is the optimal task assignment.

### Team Structure

| Agent Name | Role | Phase | Subagent Type |
|------------|------|-------|---------------|
| `architect` | Team lead — coordinates, reviews PRs, resolves conflicts | All | `general-purpose` |
| `research-agent-dev` | Builds the research subagent and research tool | Phase 1 | `general-purpose` |
| `migration-dev` | Migrates route.ts to ToolLoopAgent | Phase 2 | `general-purpose` |
| `skills-integrator` | Condenses skills into prompt context | Phase 3 | `general-purpose` |
| `test-runner` | Runs tests after each phase, validates builds | All | `test-runner` |

### Task Dependencies

```
Phase 1 (research-agent-dev):
  1.1 Create research-agent.ts          [no deps]
  1.2 Create research.tools.ts          [depends on 1.1]
  1.3 Register in index.ts + route.ts   [depends on 1.2]
  1.4 Update system prompts             [depends on 1.3]

Phase 2 (migration-dev):                [depends on Phase 1 complete]
  2.1 Create web-builder.ts agent       [no deps within phase]
  2.2 Simplify chat route               [depends on 2.1]
  2.3 Migrate prepareStep               [depends on 2.1]
  2.4 Migrate error recovery            [depends on 2.1]
  2.5 Migrate provider fallback         [depends on 2.2]

Phase 3 (skills-integrator):            [can run in parallel with Phase 2]
  3.1 Create skills-context.ts          [no deps]
  3.2 Inject into prompt-generator      [depends on 3.1]
  3.3 Update tool descriptions          [depends on 3.1]

Phase 4 (research-agent-dev):           [depends on Phase 1 + 2]
  4.1 Force research via prepareStep    [no deps within phase]
  4.2 Detect new vs existing project    [no deps within phase]

Phase 5 (migration-dev):                [depends on Phase 2]
  5.1 Add needsApproval to tools        [no deps within phase]
  5.2 Client-side approval UI           [depends on 5.1]
```

### Parallelism Opportunities

- **Phase 1 + Phase 3** can run fully in parallel (different files, no conflicts)
- **Phase 2** depends on Phase 1 completion (needs research tool registered)
- **Phase 4 + Phase 5** can run in parallel after Phase 2

### Execution Order (Optimal)

```
Time →
├── research-agent-dev: Phase 1 (Tasks 1.1-1.4)
├── skills-integrator:  Phase 3 (Tasks 3.1-3.3)     [parallel with Phase 1]
│
├── test-runner: Validate Phase 1 + 3 (build, lint)
│
├── migration-dev: Phase 2 (Tasks 2.1-2.5)
│
├── test-runner: Validate Phase 2 (build, lint, e2e)
│
├── research-agent-dev: Phase 4 (Tasks 4.1-4.2)     [parallel with Phase 5]
├── migration-dev: Phase 5 (Tasks 5.1-5.2)          [parallel with Phase 4]
│
└── test-runner: Final validation
```

### Team Spawn Commands

```typescript
// architect (team lead) spawns:

// Agent 1: Research subagent developer
Task({
  subagent_type: 'general-purpose',
  name: 'research-agent-dev',
  team_name: 'agent-upgrade',
  model: 'opus',
  prompt: `You are building the research subagent for Phase 1. Read docs/plans/agent-improvement-plan.md for full context. Execute Tasks 1.1 through 1.4. Files to create/modify:
  - lib/ai/agents/research-agent.ts (new)
  - lib/ai/tools/research.tools.ts (new)
  - lib/ai/tools/index.ts (add export)
  - lib/ai/web-builder-agent.ts (add to createContextAwareTools)
  - app/api/chat/route.ts (add "research" to tool arrays)
  - lib/ai/agent.ts (update workflow step 1)
  - lib/ai/prompt-generator.ts (update agentic workflow step 1)`,
});

// Agent 2: Skills integrator
Task({
  subagent_type: 'general-purpose',
  name: 'skills-integrator',
  team_name: 'agent-upgrade',
  model: 'opus',
  prompt: `You are integrating installed skills knowledge into the system prompt for Phase 3. Read docs/plans/agent-improvement-plan.md for full context. Execute Tasks 3.1 through 3.3. Read the SKILL.md and AGENTS.md files from .agents/skills/ to extract the highest-impact rules. Files to create/modify:
  - lib/ai/skills-context.ts (new)
  - lib/ai/prompt-generator.ts (inject skills context)
  - lib/ai/tools/ (update tool descriptions)`,
});

// Agent 3: ToolLoopAgent migration (after Phase 1)
Task({
  subagent_type: 'general-purpose',
  name: 'migration-dev',
  team_name: 'agent-upgrade',
  model: 'opus',
  prompt: `You are migrating the chat route to ToolLoopAgent for Phase 2. Read docs/plans/agent-improvement-plan.md for full context. WAIT for Phase 1 to complete before starting. Execute Tasks 2.1 through 2.5. Files to create/modify:
  - lib/ai/agents/web-builder.ts (new)
  - app/api/chat/route.ts (simplify to use createAgentUIStreamResponse)
  Preserve all existing behavior: token budgets, message pruning, provider fallback, error recovery.`,
});

// Agent 4: Test runner (continuous)
Task({
  subagent_type: 'test-runner',
  name: 'test-runner',
  team_name: 'agent-upgrade',
  prompt: `Run build validation after each phase completes. Commands:
  - pnpm lint (should have 0 errors)
  - pnpm build (should succeed)
  - pnpm test (should pass)
  Report any failures to the architect.`,
});
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `ToolLoopAgent` API changes (still beta) | HIGH | Pin `ai` package version; keep manual fallback available |
| Research subagent adds latency to first response | MEDIUM | Set `stopWhen: stepCountIs(5)` and timeout; skip for follow-up messages |
| Skills context bloats system prompt | MEDIUM | Keep condensed context under 500 tokens; reference AGENTS.md for full detail |
| `createAgentUIStreamResponse` breaks streaming format | HIGH | Test with frontend `useChat` before merging; keep `toUIMessageStreamResponse` as fallback |
| Subagent sandbox access for `findSkills` | MEDIUM | May need to pass sandbox reference through tool execution context |

---

## Success Criteria

- [ ] Agent automatically researches before coding on new projects
- [ ] Research adds max 1-2 steps to the total step count
- [ ] `route.ts` reduced from ~900 lines to ~200 lines
- [ ] All existing tests pass after migration
- [ ] Build succeeds with no new TypeScript errors
- [ ] Frontend streaming behavior unchanged (verified with manual E2E test)
- [ ] Skills knowledge improves code quality (verified by reviewing generated code)
- [ ] Token usage per session does not increase by more than 10%

---

## Files Changed Summary

| File | Action | Phase |
|------|--------|-------|
| `lib/ai/agents/research-agent.ts` | CREATE | 1 |
| `lib/ai/agents/web-builder.ts` | CREATE | 2 |
| `lib/ai/tools/research.tools.ts` | CREATE | 1 |
| `lib/ai/tools/index.ts` | MODIFY | 1 |
| `lib/ai/web-builder-agent.ts` | MODIFY | 1 |
| `lib/ai/agent.ts` | MODIFY | 1 |
| `lib/ai/prompt-generator.ts` | MODIFY | 1, 3 |
| `lib/ai/skills-context.ts` | CREATE | 3 |
| `app/api/chat/route.ts` | MODIFY | 1, 2 |
| `components/features/chat/tool-approval.tsx` | CREATE | 5 |
