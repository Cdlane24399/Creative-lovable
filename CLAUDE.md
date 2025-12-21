# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Creative-lovable is an AI-powered web development assistant that builds real, working Next.js applications in seconds using E2B sandboxes. It leverages AI SDK with multi-step tool calling for agentic workflows.

**Key Technologies:**
- Next.js 16 (^16.0.10) with App Router and React 19.2.3
- E2B Sandbox SDK (v2.8.4) for isolated cloud code execution
- E2B Code Interpreter (v2.3.3) for additional code execution capabilities
- AI SDK 5.0.113 with streaming and multi-step tool loops
- AI SDK providers: @ai-sdk/anthropic (^2.0.56), @ai-sdk/openai (^2.0.86), @ai-sdk/google (^2.0.47)
- shadcn/ui + Tailwind CSS v4 (^4.1.18) for UI components
- TypeScript 5.9+ throughout
- Neon Serverless PostgreSQL (@neondatabase/serverless ^1.0.2) for persistence
- Framer Motion (^12.23.26) for animations
- Zod 4.2.1 for schema validation
- Lucide React (^0.561.0) for icons

## Development Commands

This project supports multiple package managers (npm/pnpm). Use your preferred package manager:

```bash
# Development
npm run dev          # Start dev server at localhost:3000
# or
pnpm dev

# Build & Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint

# Testing
npm run test:e2b     # Run E2B sandbox tests
```

**Note:** TypeScript build errors are ignored in production (`ignoreBuildErrors: true` in next.config.mjs) for rapid prototyping.

## E2B Template Setup (Critical for Performance)

The project uses custom E2B templates for **60x faster startup** (2-5 seconds vs 3-5 minutes).

### Build Custom Template:
```bash
# Development template
npx tsx lib/e2b/templates/build.dev.ts

# Production template
npx tsx lib/e2b/templates/build.prod.ts
```

**Required:** Set `E2B_API_KEY` in `.env.local` before building templates.

After building, the template alias (e.g., `creative-lovable-nextjs`) is automatically used via `E2B_TEMPLATE_ID` environment variable.

See `lib/e2b/templates/README.md` for complete setup instructions.

## Architecture

### Core Agent System

The application uses an **agentic workflow** architecture where AI models can plan, execute, verify, and iterate:

**Flow:** `app/api/chat/route.ts` → `lib/ai/agent.ts` (system prompt + models) → `lib/ai/web-builder-agent.ts` (tools) → `lib/e2b/sandbox.ts` (execution)

#### Agent Context System (`lib/ai/agent-context.ts`)
Maintains stateful in-memory context across tool executions for each `projectId`:
- **Project state**: Files (Map<path, FileInfo>), dependencies (Map<name, version>), project structure
- **Build status**: Error tracking, warnings, build health
- **Server state**: isRunning, port, URL, startup time
- **Execution history**: Tool calls with timestamps, success/failure patterns, error history
- **Planning**: Current plan steps and completion tracking
- **Statistics**: Total tool calls, success rate, common errors

**Key Functions:**
- `getAgentContext(projectId)`: Retrieve full context for a project
- `updateFileInContext(projectId, path, content, status)`: Track file changes
- `recordToolExecution(projectId, toolName, input, output, success, error, startTime)`: Log tool calls
- `updateBuildStatus(projectId, status)`: Track build errors/warnings
- `updateServerState(projectId, state)`: Track dev server state
- `setProjectInfo(projectId, info)`: Set project metadata
- `setCurrentPlan(projectId, steps)`: Create execution plan
- `completeStep(projectId, step)`: Mark plan step complete
- `generateContextSummary(projectId)`: Generate human-readable summary
- `getContextRecommendations(projectId)`: Get AI recommendations based on state

Context is stored in-memory and persists for the lifetime of the server process.

#### Tool Categories (`lib/ai/web-builder-agent.ts`)

**Planning Tools:**
- `planChanges`: Create multi-step implementation plans
- `markStepComplete`: Track progress through plan steps

**Website Tools:**
- `createWebsite`: Create/update complete websites with live preview (uses async generator for streaming progress)
- `editFile`: Targeted file edits using search and replace
- `writeFile`: Write individual files
- `readFile`: Read file contents

**Project Analysis:**
- `getProjectStructure`: List files, optionally read multiple files
- `analyzeProjectState`: Get comprehensive context summary
- `getBuildStatus`: Check dev server logs for errors

**Dependency Management:**
- `installPackage`: Dynamically install npm packages

**Execution:**
- `executeCode`: Run Python/JavaScript/TypeScript code
- `runCommand`: Execute shell commands

**Deprecated:**
- `startDevServer`: DEPRECATED - Dev server is now managed by the frontend via `useDevServer` hook

### Dev Server Management

Dev server management has been separated into its own system:

**API Route:** `app/api/sandbox/[projectId]/dev-server/route.ts`
- `GET` - Check server status (with 1.5s caching)
- `POST` - Start the dev server
- `DELETE` - Stop the dev server

**Frontend Hook:** `hooks/use-dev-server.ts`
```typescript
const { status, isStarting, start, stop, restart, refresh } = useDevServer({
  projectId: "my-project",
  projectName: "my-project",
  enabled: true,
  onReady: (url) => console.log(`Server ready at ${url}`),
  onError: (errors) => console.error(errors),
})
```

The dev server is started automatically by the frontend when `createWebsite` returns `filesReady: true`.

### E2B Sandbox Management (`lib/e2b/sandbox.ts`)

Sandboxes are cloud-based Ubuntu environments managed by E2B. They are reused per `projectId` and cached in-memory:
- **Default timeout**: 10 minutes (DEFAULT_TIMEOUT_MS = 10 * 60 * 1000)
- **Caching**: Active sandboxes stored in Map<projectId, Sandbox>
- **Auto-cleanup**: Sandboxes auto-expire after timeout and are removed from cache on failure
- **Template support**: Custom templates (E2B_TEMPLATE_ID env var) significantly reduce startup time
- **Reuse logic**: Existing sandboxes are reused if still alive; timeout is extended on reuse

**Key functions:**
- `createSandbox(projectId, templateId?)`: Get or create sandbox (creates if not exists, reuses if exists)
- `createSandboxWithAutoPause(projectId, autoPause?)`: Create with auto-pause support (beta)
- `getSandbox(projectId)`: Get existing sandbox without creating (returns undefined if not exists)
- `closeSandbox(projectId)`: Close and cleanup sandbox
- `pauseSandbox(projectId)`: Pause sandbox to preserve state (beta)
- `resumeSandbox(projectId)`: Resume a paused sandbox (beta)
- `executeCommand(sandbox, command, options?)`: Run shell commands with streaming support
- `executeCode(sandbox, code, language)`: Execute Python/JS/TS code
- `writeFile(sandbox, path, content)`: Write file to sandbox filesystem
- `writeFiles(sandbox, files, options?)`: Batch write files with concurrency control
- `readFile(sandbox, path)`: Read file from sandbox filesystem
- `startBackgroundProcess(sandbox, command, options?)`: Start long-running processes (dev servers)
- `killBackgroundProcess(projectId)`: Kill background process for a project
- `getHostUrl(sandbox, port)`: Get public HTTPS URL for running servers (format: `https://{sandboxId}.e2b.dev`)

### AI Model Configuration (`lib/ai/agent.ts`)

Model configuration with display names and descriptions:

```typescript
// lib/ai/agent.ts
export const MODEL_OPTIONS = {
  anthropic: anthropic("claude-sonnet-4-5"),
  sonnet: anthropic("claude-opus-4-5"),
  google: google("gemini-3-pro-preview"),
  openai: openai("gpt-5.2"),
} as const

export const MODEL_DISPLAY_NAMES = {
  anthropic: "Claude Sonnet 4.5",
  sonnet: "Claude Opus 4.5",
  google: "Gemini 3 Pro",
  openai: "GPT-5.2",
} as const
```

**Note:** These model IDs may need to be updated to match actual provider model IDs:
- **Anthropic**: Real IDs like `claude-sonnet-4-20250514`, `claude-opus-4-20250514`
- **Google**: Real IDs like `gemini-1.5-pro`, `gemini-2.0-flash-exp`
- **OpenAI**: Real IDs like `gpt-4o`, `gpt-4o-mini`

The system prompt in `SYSTEM_PROMPT` defines the agent's behavior as "Lovable", an autonomous AI agent specializing in building complete Next.js applications.

### Frontend Architecture

- **`app/page.tsx`**: Landing page with features and project showcase
- **`components/editor-layout.tsx`**: Main split-pane editor (chat + preview)
- **`components/chat-panel.tsx`**: Chat interface with model selector
- **`components/preview-panel.tsx`**: iframe for live website preview
- **`hooks/use-chat-with-tools.ts`**: Custom hook wrapping AI SDK's `useChat`
- **`hooks/use-dev-server.ts`**: Hook for dev server management and polling
- **`hooks/use-projects.ts`**: Hook for project CRUD operations

### API Routes

**Chat API (`POST /api/chat`)**
- **Accepts**: `messages` (UIMessage[]), `projectId` (default: "default"), `model` (ModelProvider, default: "anthropic")
- **Max Duration**: 60 seconds
- **Tool Loops**: Uses `streamText()` with `stopWhen: stepCountIs(15)` for up to 15 agentic steps
- **Context-Aware**: Generates enhanced system prompt with project state via `generateAgenticSystemPrompt()`
- **Features**: `prepareStep` for dynamic tool activation, `experimental_repairToolCall` for error recovery
- **Returns**: `UIMessageStreamResponse` with streaming tool call results
- **Persistence**: Saves messages to Neon PostgreSQL if projectId provided
- **Error Handling**: Returns 500 status with error JSON on failure

**Dev Server API (`/api/sandbox/[projectId]/dev-server`)**
- `GET`: Check server status (cached for 1.5s)
- `POST`: Start dev server with optional `forceRestart`
- `DELETE`: Stop dev server

**Projects API**
- `GET /api/projects`: List all projects
- `POST /api/projects`: Create new project
- `GET /api/projects/[id]`: Get project details
- `PUT /api/projects/[id]`: Update project
- `DELETE /api/projects/[id]`: Delete project
- `GET /api/projects/[id]/messages`: Get project messages
- `GET /api/projects/[id]/screenshot`: Get project screenshot

**Utility APIs**
- `POST /api/improve-prompt`: Improve user prompts using AI
- `GET /api/init-db`: Initialize database tables
- `GET /api/test-db`: Test database connection

## Key Implementation Patterns

### Multi-Step Tool Calling (AI SDK)
```typescript
const result = streamText({
  model: selectedModel,
  tools: createContextAwareTools(projectId),
  stopWhen: stepCountIs(15), // Limit agentic loops
  prepareStep: async ({ stepNumber, messages }) => {
    // Dynamic tool activation based on context
    if (context.buildStatus?.hasErrors) {
      return { activeTools: [...FILE_TOOLS, ...BUILD_TOOLS] }
    }
    return {}
  },
  experimental_repairToolCall: async ({ toolCall, error }) => {
    // Auto-fix common tool input issues
    if (InvalidToolInputError.isInstance(error)) {
      return { ...toolCall, input: fixedInput }
    }
    return null
  },
})
```

The agent can call multiple tools in sequence without returning to the user until `stopWhen` condition is met.

### Streaming Tool Progress (AsyncIterable)
The `createWebsite` tool uses async generators for real-time progress:

```typescript
async *execute({ name, description, pages, components }) {
  yield { status: "loading", phase: "init", message: "Creating website", progress: 0 }
  // ... do work ...
  yield { status: "progress", phase: "files", message: "Writing pages", progress: 50 }
  // ... final result
  yield { status: "success", success: true, filesReady: true, progress: 100 }
}
```

### Context-Aware Tools
Each tool execution updates the `AgentContext`:
```typescript
recordToolExecution(projectId, toolName, input, output, success, error, startTime)
updateFileInContext(projectId, filePath, content)
updateBuildStatus(projectId, hasErrors, errors)
```

This allows subsequent tool calls to have awareness of what happened previously.

### Website Creation Flow
1. User requests website
2. Agent calls `createWebsite` with complete page code (pages + optional components)
3. Tool creates sandbox (or reuses existing via `projectId`)
4. Checks if project exists at `/home/user/{projectName}`
5. For new projects with template:
   - Copies pre-built project from `/home/user/project` (60x faster)
   - Updates package.json and layout.tsx with project metadata
6. For new projects without template:
   - Scaffolds Next.js structure (app/, components/, public/)
   - Writes `package.json`, `tsconfig.json`, `next.config.mjs`, Tailwind config
   - Runs `npm install`
7. Writes all pages to `app/` directory and components to `components/`
8. Returns `filesReady: true` to signal frontend
9. Frontend's `useDevServer` hook automatically starts the dev server
10. Preview URL becomes available in the UI

### Error Recovery Pattern
Agent can autonomously fix errors:
1. `getBuildStatus` detects build errors
2. Agent analyzes error logs
3. Uses `readFile` to examine problematic code
4. Fixes with `editFile` or `installPackage`
5. Verifies fix with another `getBuildStatus`

## Environment Variables

Required in `.env.local`:
```bash
# E2B (Required)
E2B_API_KEY=e2b_***

# Template (Highly Recommended - 60x faster)
E2B_TEMPLATE_ID=creative-lovable-nextjs

# AI Providers (At least one required)
ANTHROPIC_API_KEY=sk-ant-***
OPENAI_API_KEY=sk-***
GOOGLE_GENERATIVE_AI_API_KEY=***

# Neon PostgreSQL (Required for persistence)
DATABASE_URL=postgresql://neondb_owner:***@***.neon.tech/neondb?sslmode=require
```

## Generated Project Specifications

**Important:** The Creative-lovable platform (this codebase) uses different versions than the projects it generates:

| Dependency | Platform Version | Generated Project Version |
|------------|------------------|---------------------------|
| Next.js    | 16.0.10          | 15.0.0 (web-builder-agent.ts:728) |
| React      | 19.2.3           | 18.3.1 (web-builder-agent.ts:729) |
| React DOM  | 19.2.3           | 18.3.1 (web-builder-agent.ts:730) |
| Tailwind   | 4.1.18           | 3.4.3 (web-builder-agent.ts:735) |
| TypeScript | 5.9.3            | 5.4.5 (web-builder-agent.ts:736) |

The `createWebsite` tool generates Next.js 15 projects (not Next.js 16) in the E2B sandboxes.

## Pre-installed UI Components

The E2B sandbox template (if using E2B_TEMPLATE_ID) has shadcn/ui fully installed. When creating projects without a template, components must be added via the scaffolding process. All these components are available in the template:

**Layout:** Card, Separator, Tabs, Accordion, AspectRatio, ScrollArea, Resizable
**Forms:** Button, Input, Textarea, Label, Select, Checkbox, RadioGroup, Switch, Slider, Form
**Navigation:** DropdownMenu, NavigationMenu, Command, Menubar, ContextMenu
**Overlays:** Dialog, Sheet, Popover, Tooltip, HoverCard, Drawer
**Feedback:** Alert, Badge, Toast, Sonner, Progress, Skeleton, Avatar
**Data:** Table, Calendar, Carousel, Collapsible, Toggle

**Icons:** 1000+ Lucide React icons available
**Animation:** Framer Motion pre-installed

Import from `@/components/ui/*` in generated code.

## File Naming Conventions

- Use kebab-case for all files: `page.tsx`, `hero-section.tsx`, `use-chat-with-tools.ts`
- Components export as default or named exports
- Always include TypeScript types for props
- Use `@/*` path alias for imports (resolves to project root)

## Known Limitations

1. **Template build**: First-time template build takes 5-10 minutes (one-time cost)
2. **Sandbox timeout**: Expires after 10 minutes of inactivity (DEFAULT_TIMEOUT_MS in sandbox.ts)
3. **File reading limit**: `getProjectStructure` reads max 10 files in `includeContents` mode to avoid token overflow
4. **File search limit**: `getProjectStructure` returns max 50 files via `head -50`
5. **Server startup wait**: Dev server API waits up to 15 seconds for startup
6. **Git integration**: Not implemented yet
7. **TypeScript**: Build errors ignored for rapid iteration (`ignoreBuildErrors: true` in next.config.mjs)
8. **API timeout**: Chat API has 60-second max duration (maxDuration = 60)
9. **Tool loops**: Limited to 15 steps via `stepCountIs(15)` to prevent infinite loops
10. **Dev server cache**: Status is cached for 1.5 seconds to reduce polling overhead

## Best Practices Implemented

### E2B SDK v2 Best Practices

The project follows E2B SDK v2 best practices for optimal performance and reliability:

1. **Sandbox Creation with Metadata**: All sandboxes are created with metadata for tracking (lib/e2b/sandbox.ts:69-84)
   ```typescript
   const sandbox = await Sandbox.create(template, {
     timeoutMs: DEFAULT_TIMEOUT_MS,
     metadata: { projectId, createdAt, template, purpose }
   })
   ```

2. **Code Interpreter for Python**: Uses `@e2b/code-interpreter` package with `runCode()` for better Python execution (lib/e2b/sandbox.ts:351-378)
   ```typescript
   if ("runCode" in sandbox && language === "python") {
     const execution = await sandbox.runCode(code)
   }
   ```

3. **Batch File Operations**: Implements `writeFiles()` for efficient multi-file writes with concurrency control (lib/e2b/sandbox.ts:614-698)
   ```typescript
   await writeFiles(sandbox, files, {
     useNativeApi: true,  // Use native API for better performance
     concurrency: 5,       // Control parallel writes
     onProgress: (phase, msg) => console.log(`${phase}: ${msg}`),
   })
   ```

4. **Dynamic Timeouts**: Commands get appropriate timeouts based on type (lib/e2b/sandbox.ts:477-481)
   - 10 minutes for `npm install`
   - 5 minutes for build commands
   - 5 minutes default for other commands

5. **Background Process Control**: `startBackgroundProcess()` uses native `background: true` API (lib/e2b/sandbox.ts:774-806)
   ```typescript
   const result = await startBackgroundProcess(sandbox, "npm run dev", {
     workingDir: projectDir,
     projectId,
     onStdout: (data) => console.log(data),
   })
   ```

6. **Command Streaming**: `executeCommand()` supports `onStdout`/`onStderr` callbacks (lib/e2b/sandbox.ts:459-543)
   ```typescript
   await executeCommand(sandbox, "npm install", {
     onStdout: (data) => console.log(data),
     onStderr: (data) => console.error(data),
     cwd: "/home/user/project",
   })
   ```

7. **Process Cleanup**: `killBackgroundProcess(projectId)` properly terminates dev servers (lib/e2b/sandbox.ts:815-829)
   - `closeSandbox()` automatically kills associated background processes
   - Process handles tracked in `backgroundProcesses` Map

8. **Proper Resource Cleanup**: `cleanupAllSandboxes()` handles both regular and code interpreter sandboxes

9. **Monitoring**: `getSandboxStats()` provides real-time sandbox statistics including paused sandboxes

10. **Backward Compatibility**: `executeCommand` accepts number timeout for legacy code

11. **Sandbox Persistence (Beta)**: Pause and resume sandboxes to preserve state
    ```typescript
    await pauseSandbox(projectId)
    const sandbox = await resumeSandbox(projectId)
    const sandbox = await createSandboxWithAutoPause(projectId, true)
    ```

### AI SDK Best Practices

The project leverages AI SDK advanced features:

1. **Multi-Step Tool Calling**: Uses `stopWhen: stepCountIs(15)` for agentic workflows

2. **Step Tracking**: `onStepFinish` callback logs each step's completion
   ```typescript
   onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
     console.log(`[Step ${stepNumber}] Finished:`, { toolCallsCount, tokensUsed })
   }
   ```

3. **Dynamic Step Configuration**: `prepareStep` for context-aware tool activation
   ```typescript
   prepareStep: async ({ stepNumber, messages }) => {
     // Compress conversation for long loops
     if (messages.length > 30) {
       return { messages: [messages[0], ...messages.slice(-20)] }
     }
     // Dynamic tool activation based on build status
     if (context.buildStatus?.hasErrors) {
       return { activeTools: [...FILE_TOOLS, ...BUILD_TOOLS] }
     }
   }
   ```

4. **Streaming Tool Progress**: Tools can yield progress updates via AsyncIterable
   ```typescript
   async *execute({ name, description, pages }) {
     yield { status: "loading", phase: "init", message: "Creating website", progress: 0 }
     yield { status: "progress", phase: "files", message: "Writing pages", progress: 50 }
     yield { status: "success", success: true, progress: 100 }
   }
   ```

5. **Tool Input Lifecycle Hooks**: Real-time progress during tool input generation
   ```typescript
   tool({
     onInputStart: () => console.log("Tool input generation started"),
     onInputDelta: ({ inputTextDelta }) => console.log(`Receiving: ${inputTextDelta}`),
     onInputAvailable: ({ input }) => console.log("Input complete:", input),
     execute: async (input) => { /* ... */ }
   })
   ```

6. **Tool Call Repair**: Automatic error recovery for invalid tool inputs
   ```typescript
   experimental_repairToolCall: async ({ toolCall, error }) => {
     if (InvalidToolInputError.isInstance(error)) {
       // Fix common issues like path normalization
       return { ...toolCall, input: fixedInput }
     }
     return null
   }
   ```

7. **Custom Error Messages**: `toUIMessageStreamResponse` with `onError` for better UX
   ```typescript
   result.toUIMessageStreamResponse({
     onError: (error) => {
       if (NoSuchToolError.isInstance(error)) {
         return "I tried to use an unknown tool. Let me try a different approach."
       }
       return error.message
     }
   })
   ```

8. **Context-Aware Tools**: All tools update AgentContext after execution

### Error Handling Best Practices

1. **Detailed Error Logging**: All errors include context and timestamps
2. **Non-Blocking Failures**: Step logging failures don't break the main flow
3. **Graceful Degradation**: Code execution falls back to file-based execution if runCode unavailable
4. **Timeout Management**: Commands get appropriate timeouts based on their type

## Testing Workflows

When testing agent capabilities:

**Simple website creation:**
```
"Build me a landing page for a SaaS product"
```

**Iterative updates:**
```
"Make the CTA button purple"
"Add a pricing section with 3 tiers"
```

**Error recovery:**
```
"The site isn't loading, what's wrong?"
```

**Code execution:**
```
"Run this Python code to analyze data: [code]"
```

The agent should autonomously detect and fix build errors without requiring explicit debugging requests.

## Performance Optimizations

1. **E2B Template Usage**: 60x faster startup with custom templates (2-5s vs 3-5 minutes)
2. **Sandbox Reuse**: Sandboxes are cached per projectId and reused across requests
3. **Sandbox Persistence**: Pause/resume sandboxes to preserve state between sessions (beta)
4. **Parallel File Writes**: Batch file operations with configurable concurrency
5. **Conversation Compression**: Automatic message history pruning in long agentic loops (>30 messages)
6. **Dynamic Timeouts**: Prevents unnecessary waiting for quick commands
7. **Dynamic activeTools**: Reduces token usage by only including relevant tools per step
8. **Dev Server Caching**: Status cached for 1.5s to reduce polling overhead
9. **Frontend Dev Server Management**: Separated from tool execution to prevent blocking
10. **Minimal Log Fetching**: Only fetch error logs during status checks, not full logs

## Project Directory Structure

```
Creative-lovable/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # Main AI chat endpoint
│   │   ├── sandbox/[projectId]/dev-server/route.ts  # Dev server management
│   │   ├── projects/               # Project CRUD endpoints
│   │   ├── improve-prompt/         # Prompt enhancement
│   │   ├── init-db/                # Database initialization
│   │   └── test-db/                # Database testing
│   ├── layout.tsx
│   └── page.tsx                    # Landing page
├── components/
│   ├── chat/                       # Chat UI components
│   ├── landing/                    # Landing page sections
│   ├── ui/                         # shadcn/ui components
│   ├── chat-panel.tsx
│   ├── editor-layout.tsx
│   ├── preview-panel.tsx
│   └── ...
├── hooks/
│   ├── use-chat-with-tools.ts      # Chat hook with tool support
│   ├── use-dev-server.ts           # Dev server management hook
│   └── use-projects.ts             # Project management hook
├── lib/
│   ├── ai/
│   │   ├── agent.ts                # System prompt and models
│   │   ├── agent-context.ts        # Stateful context management
│   │   └── web-builder-agent.ts    # All tool definitions
│   ├── db/
│   │   ├── neon.ts                 # Neon PostgreSQL connection
│   │   └── types.ts                # Database types
│   ├── e2b/
│   │   ├── sandbox.ts              # Sandbox management utilities
│   │   ├── __tests__/              # Sandbox tests
│   │   └── templates/              # E2B template builders
│   └── utils.ts
├── package.json
├── next.config.mjs
├── tsconfig.json
└── CLAUDE.md                       # This file
```
