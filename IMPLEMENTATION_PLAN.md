# Web App Generation Implementation Plan

## Overview

This plan outlines how to implement **actual web app generation** in the Creative-lovable project, leveraging E2B sandboxes and AI SDK v6 beta for real-time code generation, execution, and live preview.

---

## Current State Analysis

### What's Working
- ✅ E2B sandbox creation and management
- ✅ Basic `createWebsite` tool that scaffolds Next.js projects
- ✅ File write/read operations in sandbox
- ✅ Command execution (npm install, etc.)
- ✅ Preview URL generation via `sandbox.getHost()`
- ✅ AI SDK v6 streaming with tool support
- ✅ `useChat` hook integration with `DefaultChatTransport`

### Current Limitations
1. **Slow cold-start**: Creates Next.js from scratch each time (~2-5 min for npm install)
2. **No pre-built template**: No E2B custom template with dependencies pre-installed
3. **Limited component library**: No shadcn/ui or design system pre-configured
4. **No file sync**: Changes require full rebuild, no hot-reload awareness
5. **No iterative editing**: Can't modify individual files after creation
6. **No error recovery**: Build/runtime errors not streamed back to user
7. **No version control**: No git integration in sandbox

---

## Implementation Plan

### Phase 1: Create Custom E2B Template (Priority: HIGH)

**Goal**: Create a pre-configured E2B template with Next.js, Tailwind, and shadcn/ui pre-installed for instant startup.

#### 1.1 Create Template Definition

```typescript
// lib/e2b/templates/nextjs-shadcn.ts
import { Template, waitForURL } from 'e2b'

export const nextjsShadcnTemplate = Template()
  .fromNodeImage('22-slim')
  .setWorkdir('/home/user/project')
  .runCmd('npx create-next-app@15 . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm')
  .runCmd('npx shadcn@latest init -d')
  .runCmd('npx shadcn@latest add --all')  // Pre-install all components
  .runCmd('npm install lucide-react @radix-ui/react-icons framer-motion')
  .setWorkdir('/home/user')
  .setStartCmd('cd project && npm run dev', waitForURL('http://localhost:3000'))
```

#### 1.2 Build and Deploy Template

```bash
# Install E2B CLI
npm install -g @e2b/cli

# Build template (creates template ID)
npx e2b template build --alias "nextjs-shadcn" --cpu-count 4 --memory-mb 4096
```

#### 1.3 Update Sandbox Creation

```typescript
// lib/e2b/sandbox.ts
export async function createSandbox(projectId: string, templateId?: string): Promise<Sandbox> {
  const sandbox = await Sandbox.create({
    template: templateId || 'nextjs-shadcn',  // Use custom template
    timeoutMs: DEFAULT_TIMEOUT_MS,
  })
  // Template already has dev server running, just return sandbox
  return sandbox
}
```

**Expected Improvement**: Cold start reduced from ~3-5 minutes to ~2-5 seconds.

---

### Phase 2: Streaming File Operations with AI SDK v6 (Priority: HIGH)

**Goal**: Implement real-time file streaming so users see code being written character-by-character.

#### 2.1 Update Tool Pattern for Streaming

The current implementation uses generator functions correctly. Enhance with more granular streaming:

```typescript
// app/api/chat/route.ts
createWebsite: {
  description: "Create or modify a web application with live preview",
  inputSchema: z.object({
    name: z.string().describe("Project name"),
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
      action: z.enum(['create', 'update', 'delete']).default('create'),
    })),
    projectId: z.string(),
  }),
  execute: async function* ({ name, files, projectId }) {
    const sandbox = await createSandbox(projectId, 'nextjs-shadcn')

    for (const file of files) {
      yield {
        state: 'writing-file' as const,
        path: file.path,
        action: file.action,
      }

      if (file.action === 'delete') {
        await executeCommand(sandbox, `rm -f /home/user/project/${file.path}`)
      } else {
        await writeFileToSandbox(sandbox, `/home/user/project/${file.path}`, file.content)
      }

      yield {
        state: 'file-complete' as const,
        path: file.path,
      }
    }

    // Dev server already running in template, just get URL
    const previewUrl = `https://${getHostUrl(sandbox, 3000)}`

    yield {
      state: 'complete' as const,
      previewUrl,
      filesModified: files.map(f => f.path),
    }
  },
},
```

#### 2.2 Add File Edit Tool (Incremental Updates)

```typescript
editFile: {
  description: "Edit specific sections of a file without rewriting the entire file",
  inputSchema: z.object({
    projectId: z.string(),
    path: z.string().describe("File path relative to project root"),
    edits: z.array(z.object({
      lineStart: z.number(),
      lineEnd: z.number(),
      newContent: z.string(),
    })),
  }),
  execute: async function* ({ projectId, path, edits }) {
    const sandbox = await createSandbox(projectId)
    const fullPath = `/home/user/project/${path}`

    yield { state: 'reading' as const, path }
    const { content } = await readFileFromSandbox(sandbox, fullPath)
    const lines = content.split('\n')

    // Apply edits in reverse order to preserve line numbers
    for (const edit of edits.sort((a, b) => b.lineStart - a.lineStart)) {
      lines.splice(edit.lineStart - 1, edit.lineEnd - edit.lineStart + 1, ...edit.newContent.split('\n'))
    }

    yield { state: 'writing' as const, path }
    await writeFileToSandbox(sandbox, fullPath, lines.join('\n'))

    yield { state: 'complete' as const, path }
  },
},
```

---

### Phase 3: Real-time Preview with Hot Reload (Priority: HIGH)

**Goal**: Preview updates automatically when files change, no manual refresh needed.

#### 3.1 Implement WebSocket-based File Watcher

Since Next.js Turbopack has built-in HMR, we just need to ensure files are written correctly. The iframe will auto-refresh.

For more control, add a `triggerReload` tool:

```typescript
triggerReload: {
  description: "Force the preview to reload after significant changes",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  execute: async function* ({ projectId }) {
    // Send message to client to refresh iframe
    yield { state: 'reloading' as const }
    yield { state: 'complete' as const, shouldRefresh: true }
  },
},
```

#### 3.2 Enhanced Preview Panel with Auto-Refresh

```typescript
// components/preview-panel.tsx - Add refresh trigger from tool results
useEffect(() => {
  // Listen for reload signals from tool results
  const lastToolResult = messages
    .flatMap(m => m.parts)
    .filter(p => p.type === 'tool-triggerReload' && p.state === 'complete')
    .pop()

  if (lastToolResult?.shouldRefresh) {
    handleRefresh()
  }
}, [messages])
```

---

### Phase 4: Error Streaming & Recovery (Priority: MEDIUM)

**Goal**: Stream build errors, runtime errors, and TypeScript errors back to the AI for self-correction.

#### 4.1 Add Build Error Streaming Tool

```typescript
getBuildStatus: {
  description: "Check the build/compile status of the project and get any errors",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  execute: async function* ({ projectId }) {
    const sandbox = await getSandbox(projectId)
    if (!sandbox) {
      yield { state: 'error' as const, error: 'No active sandbox' }
      return
    }

    // Read server logs for errors
    const { content: logs } = await readFileFromSandbox(sandbox, '/tmp/server.log')

    // Parse for common error patterns
    const errors = parseNextJsErrors(logs)

    yield {
      state: 'complete' as const,
      hasErrors: errors.length > 0,
      errors,
      recentLogs: logs.slice(-2000), // Last 2KB of logs
    }
  },
},
```

#### 4.2 Add TypeScript Error Checking

```typescript
checkTypes: {
  description: "Run TypeScript type checking and return any type errors",
  inputSchema: z.object({
    projectId: z.string(),
  }),
  execute: async function* ({ projectId }) {
    const sandbox = await createSandbox(projectId)

    yield { state: 'checking' as const }
    const result = await executeCommand(sandbox, 'cd /home/user/project && npx tsc --noEmit 2>&1')

    const errors = parseTscOutput(result.stdout + result.stderr)

    yield {
      state: 'complete' as const,
      hasErrors: errors.length > 0,
      errors,
    }
  },
},
```

---

### Phase 5: Component Library Integration (Priority: MEDIUM)

**Goal**: Give the AI access to pre-built shadcn/ui components with proper documentation.

#### 5.1 Add Component Discovery Tool

```typescript
listAvailableComponents: {
  description: "List all available shadcn/ui components that can be used",
  inputSchema: z.object({}),
  execute: async function* () {
    yield {
      state: 'complete' as const,
      components: SHADCN_COMPONENTS, // Pre-defined list with descriptions
    }
  },
},
```

#### 5.2 Update System Prompt with Component Knowledge

```typescript
// lib/ai/agent.ts
export const SYSTEM_PROMPT = `You are Lovable, an expert AI software engineer...

## Available UI Components (shadcn/ui)
When building UIs, use these pre-installed components:
- Button: \`import { Button } from "@/components/ui/button"\`
- Card: \`import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"\`
- Input: \`import { Input } from "@/components/ui/input"\`
- Dialog: \`import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog"\`
...

## Icons (lucide-react)
All Lucide icons are available: \`import { Icon } from "lucide-react"\`

## Animation (framer-motion)
Framer Motion is pre-installed for animations.
`
```

---

### Phase 6: Multi-file Project Understanding (Priority: MEDIUM)

**Goal**: AI can understand the full project structure and make informed decisions.

#### 6.1 Add Project Structure Tool

```typescript
getProjectStructure: {
  description: "Get the full file tree and key file contents of the project",
  inputSchema: z.object({
    projectId: z.string(),
    includeContents: z.boolean().default(false).describe("Include file contents for key files"),
  }),
  execute: async function* ({ projectId, includeContents }) {
    const sandbox = await createSandbox(projectId)

    yield { state: 'scanning' as const }

    // Get file tree
    const treeResult = await executeCommand(sandbox,
      'cd /home/user/project && find . -type f -name "*.tsx" -o -name "*.ts" -o -name "*.css" | head -100'
    )
    const files = treeResult.stdout.split('\n').filter(Boolean)

    let contents: Record<string, string> = {}
    if (includeContents) {
      for (const file of files.slice(0, 20)) { // Limit to 20 files
        try {
          const { content } = await readFileFromSandbox(sandbox, `/home/user/project/${file}`)
          contents[file] = content
        } catch {}
      }
    }

    yield {
      state: 'complete' as const,
      files,
      contents,
    }
  },
},
```

---

### Phase 7: Install Dependencies On-Demand (Priority: LOW)

**Goal**: Install npm packages when AI needs them.

```typescript
installPackage: {
  description: "Install an npm package in the project",
  inputSchema: z.object({
    projectId: z.string(),
    packages: z.array(z.string()).describe("Package names to install"),
    dev: z.boolean().default(false).describe("Install as dev dependency"),
  }),
  execute: async function* ({ projectId, packages, dev }) {
    const sandbox = await createSandbox(projectId)
    const flag = dev ? '--save-dev' : '--save'

    yield { state: 'installing' as const, packages }

    const result = await executeCommand(sandbox,
      `cd /home/user/project && npm install ${flag} ${packages.join(' ')}`
    )

    yield {
      state: result.exitCode === 0 ? 'complete' : 'error',
      stdout: result.stdout,
      stderr: result.stderr,
    }
  },
},
```

---

### Phase 8: Enhanced Client-Side UI (Priority: MEDIUM)

#### 8.1 File Explorer Panel

Add a file explorer that shows the project structure:

```typescript
// components/file-explorer.tsx
interface FileExplorerProps {
  files: string[]
  onFileSelect: (path: string) => void
  selectedFile?: string
}

export function FileExplorer({ files, onFileSelect, selectedFile }: FileExplorerProps) {
  const tree = buildFileTree(files)
  return (
    <div className="h-full overflow-auto bg-zinc-900 p-2">
      <FileTree tree={tree} onSelect={onFileSelect} selected={selectedFile} />
    </div>
  )
}
```

#### 8.2 Code Editor Panel (Read-only initially)

```typescript
// components/code-panel.tsx
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'

export function CodePanel({ code, language, path }: CodePanelProps) {
  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 bg-zinc-800 px-4 py-2 text-sm text-zinc-400">
        {path}
      </div>
      <SyntaxHighlighter language={language}>
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
```

#### 8.3 Three-Panel Layout

```typescript
// components/editor-layout.tsx
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={15} minSize={10}>
    <FileExplorer files={projectFiles} onFileSelect={setSelectedFile} />
  </ResizablePanel>

  <ResizableHandle />

  <ResizablePanel defaultSize={35}>
    <ChatPanel {...chatProps} />
  </ResizablePanel>

  <ResizableHandle />

  <ResizablePanel defaultSize={50}>
    <Tabs defaultValue="preview">
      <TabsList>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="code">Code</TabsTrigger>
      </TabsList>
      <TabsContent value="preview">
        <PreviewPanel sandboxUrl={sandboxUrl} />
      </TabsContent>
      <TabsContent value="code">
        <CodePanel code={selectedFileContent} path={selectedFile} />
      </TabsContent>
    </Tabs>
  </ResizablePanel>
</ResizablePanelGroup>
```

---

## Implementation Priority Order

| Phase | Description | Effort | Impact |
|-------|-------------|--------|--------|
| **1** | E2B Custom Template | 2-3 hours | **HUGE** - 60x faster startup |
| **2** | Streaming File Operations | 2-3 hours | HIGH - Better UX |
| **3** | Hot Reload Integration | 1-2 hours | HIGH - Instant feedback |
| **4** | Error Streaming | 2-3 hours | MEDIUM - Self-healing |
| **5** | Component Library Docs | 1-2 hours | MEDIUM - Better output |
| **6** | Project Structure Tool | 2-3 hours | MEDIUM - Context awareness |
| **7** | Dependency Installation | 1 hour | LOW - Flexibility |
| **8** | Enhanced UI Panels | 4-6 hours | MEDIUM - Pro UX |

---

## AI SDK v6 Beta Specific Patterns

### Tool Streaming Pattern (Current Best Practice)

```typescript
// tools use async generators for streaming states
execute: async function* (input) {
  yield { state: 'starting' }
  // ... do work
  yield { state: 'progress', percent: 50 }
  // ... more work
  yield { state: 'complete', result: data }
}
```

### Client Tool Handling

```typescript
// In chat component, render tool parts with streaming states
{message.parts.map(part => {
  if (part.type.startsWith('tool-')) {
    switch (part.state) {
      case 'input-streaming':
        return <ToolLoading tool={part.toolName} />
      case 'output-available':
        return <ToolResult tool={part.toolName} result={part.output} />
      case 'output-error':
        return <ToolError tool={part.toolName} error={part.errorText} />
    }
  }
})}
```

### Message Deduplication (Important!)

```typescript
// In API route, pass originalMessages to prevent duplicate IDs
return result.toUIMessageStreamResponse({
  originalMessages: messages, // From request body
})
```

---

## Environment Setup

### Required Environment Variables

```env
# .env.local
E2B_API_KEY=your_e2b_api_key

# AI Providers (at least one required)
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key

# Supabase (for persistence)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### E2B Template Build Commands

```bash
# Install E2B CLI
npm install -g @e2b/cli

# Login
e2b auth login

# Build template from definition file
e2b template build \
  --name "nextjs-shadcn" \
  --cpu-count 4 \
  --memory-mb 4096 \
  --start-cmd "cd /home/user/project && npm run dev"
```

---

## Testing Plan

1. **Unit Tests**: Test sandbox operations in isolation
2. **Integration Tests**: Test full tool execution flow
3. **E2E Tests**: Test complete user flow from chat to preview
4. **Performance Tests**: Measure cold start, file write, and preview load times

---

## Success Metrics

- **Cold Start Time**: < 5 seconds (down from 3-5 minutes)
- **File Update to Preview**: < 2 seconds
- **Build Error Detection**: < 10 seconds
- **User Satisfaction**: Working preview on first attempt > 90%

---

## Next Steps

1. ✅ Document current state and plan
2. 🔲 Create E2B template with Next.js + shadcn (Phase 1)
3. 🔲 Update `createWebsite` tool to use template
4. 🔲 Add `editFile` tool for incremental updates
5. 🔲 Add error detection and streaming
6. 🔲 Enhance system prompt with component docs
7. 🔲 Build file explorer UI
8. 🔲 Test and iterate
