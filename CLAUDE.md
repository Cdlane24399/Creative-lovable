# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Creative-lovable is an AI-powered web development assistant that builds real, working Next.js applications in seconds using E2B sandboxes. It leverages AI SDK v6 (beta) with multi-step tool calling for agentic workflows.

**Key Technologies:**
- Next.js 16 (^16.0.10) with App Router and React 19.2.3
- E2B Sandbox SDK (v2.8.4) for isolated cloud code execution
- E2B Code Interpreter (v2.3.3) for additional code execution capabilities
- AI SDK v6 (beta 150) with streaming and multi-step tool loops
- AI SDK providers: @ai-sdk/anthropic (^2.0.56), @ai-sdk/openai (^2.0.86), @ai-sdk/google (^2.0.46)
- shadcn/ui + Tailwind CSS v4 (^4.1.18) for UI components
- TypeScript 5.9+ throughout
- Neon Serverless PostgreSQL (@neondatabase/serverless) for persistence
- Framer Motion (^12.23.26) for animations
- Zod 4.2.0 for schema validation
- Lucide React (^0.561.0) for icons

## Development Commands

This project supports multiple package managers (npm/pnpm). Use your preferred package manager:

\`\`\`bash
# Development
npm run dev          # Start dev server at localhost:3000
# or
pnpm dev

# Build & Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint
\`\`\`

**Note:** TypeScript build errors are ignored in production (`ignoreBuildErrors: true` in next.config.mjs) for rapid prototyping.

## E2B Template Setup (Critical for Performance)

The project uses custom E2B templates for **60x faster startup** (2-5 seconds vs 3-5 minutes).

### Build Custom Template:
\`\`\`bash
# Development template
npx tsx lib/e2b/templates/build.dev.ts

# Production template
npx tsx lib/e2b/templates/build.prod.ts
\`\`\`

**Required:** Set `E2B_API_KEY` in `.env.local` before building templates.

After building, the template alias (e.g., `creative-lovable-nextjs`) is automatically used via `E2B_TEMPLATE_ID` environment variable.

See `lib/e2b/templates/README.md` for complete setup instructions.

## Architecture

### Core Agent System

The application uses an **agentic workflow** architecture where AI models can plan, execute, verify, and iterate:

**Flow:** `app/api/chat/route.ts` → `lib/ai/agent.ts` (system prompt) → `lib/ai/web-builder-agent.ts` (tools) → `lib/e2b/sandbox.ts` (execution)

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
- `createWebsite`: Create/update complete websites with live preview
- `editFile`: Targeted file edits (uses unified diff format)
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

### E2B Sandbox Management (`lib/e2b/sandbox.ts`)

Sandboxes are cloud-based Ubuntu environments managed by E2B. They are reused per `projectId` and cached in-memory:
- **Default timeout**: 10 minutes (DEFAULT_TIMEOUT_MS = 10 * 60 * 1000)
- **Caching**: Active sandboxes stored in Map<projectId, Sandbox>
- **Auto-cleanup**: Sandboxes auto-expire after timeout and are removed from cache on failure
- **Template support**: Custom templates (E2B_TEMPLATE_ID env var) significantly reduce startup time
- **Reuse logic**: Existing sandboxes are reused if still alive; timeout is extended on reuse

**Key functions:**
- `createSandbox(projectId, templateId?)`: Get or create sandbox (creates if not exists, reuses if exists)
- `getSandbox(projectId)`: Get existing sandbox without creating (returns undefined if not exists)
- `closeSandbox(projectId)`: Close and cleanup sandbox
- `executeCommand(sandbox, command, timeoutMs?)`: Run shell commands (default 2 min timeout, 5 min for npm commands)
- `executeCode(sandbox, code, language)`: Execute Python/JS/TS code
- `writeFile(sandbox, path, content)`: Write file to sandbox filesystem
- `readFile(sandbox, path)`: Read file from sandbox filesystem
- `startBackgroundProcess(sandbox, command, cwd)`: Start long-running processes (dev servers) using `setsid`
- `getHostUrl(sandbox, port)`: Get public HTTPS URL for running servers (format: `https://{sandboxId}.e2b.dev`)

### AI Model Configuration (`lib/ai/agent.ts`)

Currently uses **placeholder model identifiers** for demonstration purposes:
\`\`\`typescript
// lib/ai/agent.ts:173-182
anthropic: anthropic("claude-opus-4-5", {
  apiKey: process.env.ANTHROPIC_API_KEY,
})
google: google("gemini-3-pro-preview", {
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
})
openai: openai("gpt-5.2", {
  apiKey: process.env.OPENAI_API_KEY,
})
\`\`\`

**⚠️ Important:** These model IDs are placeholders. Replace with actual model IDs from provider docs:
- **Anthropic**: Use real model IDs like `claude-sonnet-4-20250514`, `claude-opus-4-20250514`
- **Google**: Use real model IDs like `gemini-1.5-pro`, `gemini-2.0-flash-exp`
- **OpenAI**: Use real model IDs like `gpt-4o`, `gpt-4o-mini`, `o1-preview`

The system prompt in `SYSTEM_PROMPT` defines the agent's behavior, capabilities, and available shadcn/ui components. The model is selected via the `model` parameter in the `/api/chat` POST request (defaults to "anthropic").

### Frontend Architecture

- **`app/page.tsx`**: Landing page with features carousel
- **`components/editor-layout.tsx`**: Main split-pane editor (chat + preview)
- **`components/chat-panel.tsx`**: Chat interface with model selector
- **`components/preview-panel.tsx`**: iframe for live website preview
- **`hooks/use-chat-with-tools.ts`**: Custom hook wrapping AI SDK's `useChat`

### API Routes

**`POST /api/chat`** (app/api/chat/route.ts):
- **Accepts**: `messages` (UIMessage[]), `projectId` (default: "default"), `model` (ModelProvider, default: "anthropic")
- **Max Duration**: 60 seconds (export const maxDuration = 60)
- **Tool Loops**: Uses `streamText()` with `stopWhen: stepCountIs(15)` for up to 15 agentic steps
- **Context-Aware**: Generates enhanced system prompt with project state via `generateAgenticSystemPrompt()`
- **Returns**: `UIMessageStreamResponse` with streaming tool call results
- **Persistence**: Optionally saves messages to Neon PostgreSQL if projectId provided
- **Error Handling**: Returns 500 status with error JSON on failure

## Key Implementation Patterns

### Multi-Step Tool Calling (AI SDK v6)
\`\`\`typescript
const result = streamText({
  model: selectedModel,
  tools: createContextAwareTools(projectId),
  stopWhen: stepCountIs(15), // Limit agentic loops
})
\`\`\`

The agent can call multiple tools in sequence without returning to the user until `stopWhen` condition is met.

### Context-Aware Tools
Each tool execution updates the `AgentContext`:
\`\`\`typescript
recordToolExecution(projectId, toolName, input, output, success, error, startTime)
updateFileInContext(projectId, filePath, content)
updateBuildStatus(projectId, hasErrors, errors)
\`\`\`

This allows subsequent tool calls to have awareness of what happened previously.

### Website Creation Flow
1. User requests website
2. Agent calls `createWebsite` with complete page code (pages + optional components)
3. Tool creates sandbox (or reuses existing via `projectId`)
4. Checks if project exists at `/home/user/{projectName}`
5. For new projects:
   - Scaffolds Next.js structure (app/, components/, public/)
   - Writes `package.json`, `tsconfig.json`, `next.config.mjs`, Tailwind config
   - Creates `app/layout.tsx` and `app/globals.css`
6. Writes all pages to `app/` directory and components to `components/`
7. Installs dependencies with `npm install` (skipped if using E2B_TEMPLATE_ID)
8. Starts Next.js dev server with `npm run dev` in background via `setsid`
9. Waits 10 seconds for server startup
10. Returns live HTTPS preview URL (e.g., `https://{sandboxId}.e2b.dev`)
11. Agent shares URL with user

### Error Recovery Pattern
Agent can autonomously fix errors:
1. `getBuildStatus` detects build errors
2. Agent analyzes error logs
3. Uses `readFile` to examine problematic code
4. Fixes with `editFile` or `installPackage`
5. Verifies fix with another `getBuildStatus`

## Environment Variables

Required in `.env.local`:
\`\`\`bash
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
\`\`\`

## Generated Project Specifications

**Important:** The Creative-lovable platform (this codebase) uses different versions than the projects it generates:

| Dependency | Platform Version | Generated Project Version |
|------------|------------------|---------------------------|
| Next.js    | 16.0.10          | 15.0.0 (web-builder-agent.ts:582) |
| React      | 19.2.3           | 18.3.1 (web-builder-agent.ts:583) |
| React DOM  | 19.2.3           | 18.3.1 (web-builder-agent.ts:584) |
| Tailwind   | 4.1.18           | 3.4.3 (web-builder-agent.ts:589) |
| TypeScript | 5.9.3            | 5.4.5 (web-builder-agent.ts:590) |

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
5. **Server startup wait**: `createWebsite` waits 10 seconds after starting dev server (hardcoded)
6. **Git integration**: Not implemented yet
7. **TypeScript**: Build errors ignored for rapid iteration (`ignoreBuildErrors: true` in next.config.mjs)
8. **API timeout**: Chat API has 60-second max duration (maxDuration = 60)
9. **Tool loops**: Limited to 15 steps via `stepCountIs(15)` to prevent infinite loops
10. **Model IDs**: Using placeholder model identifiers that need to be updated with real provider IDs

## Best Practices Implemented

### E2B SDK v2 Best Practices

The project follows E2B SDK v2 best practices for optimal performance and reliability:

1. **Sandbox Creation with Metadata**: All sandboxes are created with metadata for tracking (lib/e2b/sandbox.ts:59-64)
   \`\`\`typescript
   const sandbox = await Sandbox.create(template, {
     timeoutMs: DEFAULT_TIMEOUT_MS,
     metadata: { projectId, createdAt, template, purpose }
   })
   \`\`\`

2. **Code Interpreter for Python**: Uses `@e2b/code-interpreter` package with `runCode()` for better Python execution (lib/e2b/sandbox.ts:176-187)
   \`\`\`typescript
   if ("runCode" in sandbox && language === "python") {
     const execution = await sandbox.runCode(code)
   }
   \`\`\`

3. **Batch File Operations**: Implements `writeFiles()` for efficient multi-file writes with optional native API support (lib/e2b/sandbox.ts:303-331)
   \`\`\`typescript
   // Use native API for better performance
   await writeFiles(sandbox, files, { useNativeApi: true })
   \`\`\`

4. **Dynamic Timeouts**: Commands get appropriate timeouts (10 min for npm install, 5 min default) (lib/e2b/sandbox.ts:234-271)
   - Default timeout extended to 10 minutes for npm install without templates (3-5 minutes)
   - Supports complex build processes and multiple iterative operations

5. **Background Process Control**: `startBackgroundProcess()` uses native `background: true` API for better process control (lib/e2b/sandbox.ts:375-398)
   \`\`\`typescript
   const result = await startBackgroundProcess(sandbox, "npm run dev", {
     workingDir: projectDir,
     projectId,
     onStdout: (data) => console.log(data),
   })
   // Returns process handle for cleanup: result.process
   \`\`\`

6. **Command Streaming**: `executeCommand()` supports `onStdout`/`onStderr` callbacks for real-time feedback (lib/e2b/sandbox.ts:234-271)
   \`\`\`typescript
   await executeCommand(sandbox, "npm install", {
     onStdout: (data) => console.log(data),
     onStderr: (data) => console.error(data),
     cwd: "/home/user/project",
   })
   \`\`\`

7. **Process Cleanup**: `killBackgroundProcess(projectId)` properly terminates dev servers before restart or cleanup (lib/e2b/sandbox.ts:399-414)
   - `closeSandbox()` automatically kills associated background processes
   - Process handles tracked in `backgroundProcesses` Map for proper cleanup

8. **Proper Resource Cleanup**: `cleanupAllSandboxes()` handles both regular and code interpreter sandboxes
9. **Monitoring**: `getSandboxStats()` provides real-time sandbox statistics including paused sandboxes
10. **Backward Compatibility**: All new features maintain backward compatibility (e.g., `executeCommand` accepts number timeout for legacy code)

11. **Sandbox Persistence (Beta)**: Pause and resume sandboxes to preserve state and reduce costs
    \`\`\`typescript
    // Pause sandbox (saves filesystem and memory state)
    await pauseSandbox(projectId)
    
    // Resume sandbox (restores to previous state)
    const sandbox = await resumeSandbox(projectId)
    
    // Create with auto-pause (sandbox pauses on timeout instead of being killed)
    const sandbox = await createSandboxWithAutoPause(projectId, true)
    \`\`\`

12. **Progress Callbacks**: `executeCommand` and `writeFiles` support progress callbacks for streaming
    \`\`\`typescript
    await executeCommand(sandbox, "npm install", {
      onProgress: (phase, msg, detail) => console.log(`${phase}: ${msg}`)
    })
    
    await writeFiles(sandbox, files, {
      onProgress: (phase, msg) => console.log(`${phase}: ${msg}`),
      concurrency: 5
    })
    \`\`\`

13. **Enhanced Batch Operations**: `writeFiles` with concurrency control and detailed error tracking

### AI SDK 6 Beta Best Practices

The project leverages AI SDK v6 (beta 150) advanced features:

1. **Multi-Step Tool Calling**: Uses `stopWhen: stepCountIs(15)` for agentic workflows (app/api/chat/route.ts)
2. **Step Tracking**: `onStepFinish` callback logs each step's completion
   \`\`\`typescript
   onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
     // Log and optionally save to database
   }
   \`\`\`

3. **Dynamic Step Configuration with activeTools**: `prepareStep` supports dynamic tool filtering based on context
   \`\`\`typescript
   prepareStep: async ({ stepNumber, messages }) => {
     const context = getAgentContext(projectId)
     // Compress conversation for long loops
     if (messages.length > 30) {
       return { messages: [messages[0], ...messages.slice(-20)] }
     }
     // Dynamic tool activation based on build status
     if (context.buildStatus?.hasErrors) {
       return { activeTools: [...FILE_TOOLS, ...BUILD_TOOLS] }
     }
   }
   \`\`\`

4. **Preliminary Tool Results (AsyncIterable)**: Tools can stream progress updates during execution
   \`\`\`typescript
   async *execute({ name, description, pages }) {
     yield { status: "loading", phase: "init", message: "Creating website", progress: 0 }
     // ... do work ...
     yield { status: "progress", phase: "files", message: "Writing pages", progress: 50 }
     // ... final result
     yield { status: "success", success: true, previewUrl: url, progress: 100 }
   }
   \`\`\`

5. **Tool Input Lifecycle Hooks**: Real-time progress during tool input generation
   \`\`\`typescript
   tool({
     onInputStart: () => console.log("Tool input generation started"),
     onInputDelta: ({ inputTextDelta }) => console.log(`Receiving: ${inputTextDelta}`),
     onInputAvailable: ({ input }) => console.log("Input complete:", input),
     execute: async (input) => { /* ... */ }
   })
   \`\`\`

6. **Tool Call Repair**: Automatic error recovery for invalid tool inputs
   \`\`\`typescript
   experimental_repairToolCall: async ({ toolCall, error }) => {
     if (InvalidToolInputError.isInstance(error)) {
       // Fix common issues and retry
       return { ...toolCall, input: fixedInput }
     }
     return null
   }
   \`\`\`

7. **Custom Error Messages**: `toUIMessageStreamResponse` with `onError` for better UX
   \`\`\`typescript
   result.toUIMessageStreamResponse({
     onError: (error) => {
       if (NoSuchToolError.isInstance(error)) {
         return "I tried to use an unknown tool. Let me try a different approach."
       }
       return error.message
     }
   })
   \`\`\`

8. **Context-Aware Tools**: All tools update AgentContext after execution (lib/ai/web-builder-agent.ts)
9. **Structured Outputs**: Ready for answer tools pattern with `toolChoice: 'required'`

### Error Handling Best Practices

1. **Detailed Error Logging**: All errors include context and timestamps
2. **Non-Blocking Failures**: Step logging failures don't break the main flow
3. **Graceful Degradation**: Code execution falls back to file-based execution if runCode unavailable
4. **Timeout Management**: Commands get appropriate timeouts based on their type

## Testing Workflows

When testing agent capabilities:

**Simple website creation:**
\`\`\`
"Build me a landing page for a SaaS product"
\`\`\`

**Iterative updates:**
\`\`\`
"Make the CTA button purple"
"Add a pricing section with 3 tiers"
\`\`\`

**Error recovery:**
\`\`\`
"The site isn't loading, what's wrong?"
\`\`\`

**Code execution:**
\`\`\`
"Run this Python code to analyze data: [code]"
\`\`\`

The agent should autonomously detect and fix build errors without requiring explicit debugging requests.

## Performance Optimizations

1. **E2B Template Usage**: 60x faster startup with custom templates (2-5s vs 3-5 minutes)
2. **Sandbox Reuse**: Sandboxes are cached per projectId and reused across requests
3. **Sandbox Persistence**: Pause/resume sandboxes to preserve state between sessions (reduces startup time)
4. **Parallel File Writes**: Batch file operations with concurrency control for better performance
5. **Conversation Compression**: Automatic message history pruning in long agentic loops (>30 messages)
6. **Dynamic Timeouts**: Prevents unnecessary waiting for quick commands
7. **Dynamic activeTools**: Reduces token usage by only including relevant tools per step
8. **Tool Input Streaming**: Real-time progress updates during tool input generation
9. **Preliminary Tool Results**: Stream progress updates during long-running tool executions
10. **Auto-pause**: Sandboxes can auto-pause on timeout to save costs (beta feature)
