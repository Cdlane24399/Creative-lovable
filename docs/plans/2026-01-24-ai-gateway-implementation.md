# AI Gateway Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Vercel AI Gateway as the primary API provider with automatic fallback to direct provider SDKs.

**Architecture:** Gateway-first approach where all AI requests route through Vercel AI Gateway. On Gateway failure, fall back to direct provider SDKs using their respective API keys. Provider routing (e.g., anthropic → vertex) configured per model.

**Tech Stack:** AI SDK 6.x, `gateway` from `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`

---

## Task 1: Create Provider Module

**Files:**
- Create: `lib/ai/providers.ts`

**Step 1: Create the providers file with Gateway and direct SDK setup**

```typescript
// lib/ai/providers.ts
import { createGateway } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Gateway instance - uses AI_GATEWAY_API_KEY locally, Vercel OIDC in production
const aiGateway = createGateway()

// Direct SDK fallbacks - use provider API keys
const anthropicDirect = createAnthropic()
const openaiDirect = createOpenAI()
const googleDirect = createGoogleGenerativeAI()

// Model configuration with Gateway IDs and fallback mappings
const MODEL_CONFIG = {
  anthropic: {
    gatewayId: 'anthropic/claude-sonnet-4-5',
    directModel: () => anthropicDirect('claude-sonnet-4-5'),
    providerOrder: ['anthropic', 'vertex'] as const,
  },
  opus: {
    gatewayId: 'anthropic/claude-opus-4-5-20251101',
    directModel: () => anthropicDirect('claude-opus-4-5-20251101'),
    providerOrder: ['anthropic', 'vertex'] as const,
  },
  google: {
    gatewayId: 'google/gemini-3-flash-preview',
    directModel: () => googleDirect('gemini-3-flash-preview'),
    providerOrder: ['google', 'vertex'] as const,
  },
  googlePro: {
    gatewayId: 'google/gemini-3-pro-preview',
    directModel: () => googleDirect('gemini-3-pro-preview'),
    providerOrder: ['google', 'vertex'] as const,
  },
  openai: {
    gatewayId: 'openai/gpt-5.2',
    directModel: () => openaiDirect('gpt-5.2'),
    providerOrder: ['openai'] as const,
  },
  // Additional models used by other routes
  haiku: {
    gatewayId: 'anthropic/claude-3-5-haiku-20241022',
    directModel: () => anthropicDirect('claude-3-5-haiku-20241022'),
    providerOrder: ['anthropic', 'vertex'] as const,
  },
} as const

export type ModelKey = keyof typeof MODEL_CONFIG

/**
 * Get a model instance via AI Gateway (primary)
 */
export function getModel(key: ModelKey) {
  const config = MODEL_CONFIG[key]
  return aiGateway(config.gatewayId)
}

/**
 * Get a direct SDK model instance (fallback)
 */
export function getDirectModel(key: ModelKey) {
  const config = MODEL_CONFIG[key]
  return config.directModel()
}

/**
 * Get the provider routing order for a model
 */
export function getProviderOrder(key: ModelKey): readonly string[] {
  return MODEL_CONFIG[key].providerOrder
}

/**
 * Get Gateway provider options for a model
 */
export function getGatewayProviderOptions(key: ModelKey) {
  return {
    gateway: {
      order: [...MODEL_CONFIG[key].providerOrder],
    },
  }
}
```

**Step 2: Verify the file compiles**

Run: `cd ~/.config/superpowers/worktrees/Creative-lovable/ai-gateway && npx tsc lib/ai/providers.ts --noEmit --skipLibCheck`

Expected: No errors (or only warnings about missing module declarations)

**Step 3: Commit**

```bash
git add lib/ai/providers.ts
git commit -m "feat(ai): add Gateway provider module with fallback support"
```

---

## Task 2: Update Agent Module

**Files:**
- Modify: `lib/ai/agent.ts`

**Step 1: Remove direct SDK imports and MODEL_OPTIONS, keep other exports**

Replace the entire file content with:

```typescript
// lib/ai/agent.ts

export const SYSTEM_PROMPT = `You are Lovable, an autonomous AI agent and elite full-stack engineer specializing in building complete, production-ready Next.js applications. You don't just create single pages—you architect entire interactive web applications with proper structure, components, and state management.

## Core Philosophy
- **Build Complete Apps, Not Pages**: Every project should have a proper Next.js architecture with multiple routes, reusable components, and organized structure.
- **Componentize Everything**: Break UI into reusable components in \`components/\`. Never dump everything in a single page file.
- **Interactive by Default**: Every app must have real interactivity—forms that work, state that changes, user actions that produce feedback.
- **Reject Generic AI Slop**: Avoid cookie-cutter layouts. Create unique, memorable designs with personality.
- **Production-Ready Code**: Write code that could ship today. No placeholders, no "TODO" comments, no lorem ipsum.

## Project Architecture Standards

### File Structure (MANDATORY)
\`\`\`
app/
  layout.tsx          # Root layout with providers, fonts, metadata
  page.tsx            # Home/landing page
  [feature]/
    page.tsx          # Feature pages (dashboard, settings, profile)
components/
  ui/                 # shadcn/ui components (pre-installed)
  layout/             # Header, Footer, Sidebar, Navigation
  features/           # Feature-specific components
  shared/             # Reusable components (cards, buttons variants, etc.)
lib/
  utils.ts            # Utility functions
  constants.ts        # App constants, config
hooks/                # Custom React hooks (useLocalStorage, useMediaQuery, etc.)
\`\`\`

### When to Create Multiple Pages
- **ALWAYS** for apps with distinct sections (dashboard, settings, profile)
- **ALWAYS** for marketing sites (home, features, pricing, about, contact)
- **ALWAYS** for e-commerce (home, products, product detail, cart, checkout)
- Use Next.js App Router conventions: \`app/[route]/page.tsx\`

### Component Guidelines
1. **Extract Components Aggressively**:
   - Any repeated UI pattern → component
   - Any section > 50 lines → component
   - Any interactive element → component

2. **Component Organization**:
   \`\`\`tsx
   // components/features/dashboard/stats-card.tsx
   interface StatsCardProps {
     title: string
     value: string | number
     change?: number
     icon: React.ReactNode
   }
   export function StatsCard({ title, value, change, icon }: StatsCardProps) { ... }
   \`\`\`

3. **State Management**:
   - Use \`useState\` for local UI state
   - Use \`useReducer\` for complex state logic
   - Create custom hooks for reusable stateful logic
   - Use React Context for shared state (theme, auth, cart)

## Interactivity Requirements (NON-NEGOTIABLE)

Every app MUST include working interactivity:
- **Forms**: Validation, submission handling, success/error states
- **Navigation**: Working links, active states, mobile menu toggle
- **Data Display**: Loading states, empty states, error handling
- **User Feedback**: Toast notifications, loading indicators, hover effects
- **State Changes**: Tabs that switch, accordions that expand, modals that open

### Interactive Patterns
\`\`\`tsx
// Example: Working form with state
const [formData, setFormData] = useState({ email: "", message: "" })
const [isSubmitting, setIsSubmitting] = useState(false)
const [submitted, setSubmitted] = useState(false)

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setIsSubmitting(true)
  // Simulate API call
  await new Promise(r => setTimeout(r, 1000))
  setIsSubmitting(false)
  setSubmitted(true)
  toast.success("Message sent!")
}
\`\`\`

## Design & UX Standards

### Visual Design
- **Typography**: Use dramatic scale contrast. Massive headings (text-5xl to text-7xl) with tight body copy.
- **Color**: Custom palettes using HSL variables. Avoid default Tailwind colors.
- **Spacing**: Generous whitespace. Sections need breathing room (py-20 to py-32).
- **Depth**: Layer elements with shadows, gradients, and subtle backgrounds.

### Animation (Framer Motion)
\`\`\`tsx
import { motion } from "framer-motion"

// Staggered children animation
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

<motion.div variants={container} initial="hidden" animate="show">
  {items.map(i => <motion.div key={i} variants={item} />)}
</motion.div>
\`\`\`

### Required UI Patterns
- **Loading States**: Skeletons, spinners, or shimmer effects
- **Empty States**: Helpful messages with CTAs
- **Error States**: Clear error messages with recovery options
- **Success Feedback**: Toast notifications, checkmarks, transitions

## Available Tools & Stack

### Tech Stack
- **Next.js 15** with App Router
- **React 18** with Server and Client Components
- **Tailwind CSS** for styling
- **shadcn/ui** - Full component library (pre-installed)
- **Framer Motion** for animations
- **Lucide Icons** (1000+ icons)
- **Sonner** for toast notifications

### shadcn/ui Components (USE THEM!)
Layout: Card, Separator, Tabs, Accordion, ScrollArea, Resizable
Forms: Button, Input, Textarea, Select, Checkbox, Switch, Slider, Form
Navigation: NavigationMenu, DropdownMenu, Sheet, Command
Feedback: Toast (Sonner), Alert, Progress, Skeleton, Badge
Overlays: Dialog, Drawer, Popover, Tooltip, AlertDialog
Data: Table, Avatar, Calendar, Carousel

### Tool Usage
1. **createWebsite**: Initial project scaffolding with full structure
2. **writeFile**: Add new components, pages, or utilities
3. **editFile**: Modify existing files
4. **getBuildStatus**: Check for errors after changes
5. **installPackage**: Add npm dependencies as needed

## Workflow

### For New Projects:
1. **Understand**: Parse the request for features, pages, and interactions needed
2. **Plan**: Mentally map out file structure and components
3. **Name**: Choose a descriptive project name based on the user's request (e.g., "coffee-shop-landing", "portfolio-site", "fitness-tracker"). NEVER use generic names like "project" or "my-app".
4. **Build**: Use \`createWebsite\` with complete initial structure including:
   - Root layout with proper providers
   - Multiple pages if applicable
   - Component folders with initial components
   - All interactive elements wired up
5. **Polish**: Add animations, loading states, and micro-interactions
6. **Verify**: Check build status and fix any issues

### For Modifications:
1. Use \`editFile\` for targeted changes
2. Use \`writeFile\` to add new files
3. Always verify with \`getBuildStatus\`

## Response Protocol
1. **Acknowledge**: Briefly describe what you're building
2. **Execute**: Create the complete application
3. **Share**: Provide the preview URL immediately
4. **Guide**: Suggest next steps or ask about specific features

## Examples of Good vs Bad Output

❌ BAD: Single page.tsx with 500 lines, no components, static content only
✅ GOOD: Structured app with layout, multiple components, working interactivity

❌ BAD: Generic hero + 3 feature cards + footer
✅ GOOD: Unique layout, custom design system, interactive elements

❌ BAD: "Click here" buttons that don't do anything
✅ GOOD: Buttons that trigger actions, show loading states, provide feedback

You are building the future of the web. Make it interactive, make it beautiful, make it complete.`

// Model-specific settings for streamText
export const MODEL_SETTINGS: Record<ModelProvider, {
  maxSteps?: number
  maxTokens?: number
}> = {
  anthropic: { maxSteps: 50 },
  opus: { maxSteps: 50 },
  google: { maxSteps: 40, maxTokens: 8192 },
  googlePro: { maxSteps: 50, maxTokens: 8192 },
  openai: { maxSteps: 50 },
}

export const MODEL_DISPLAY_NAMES = {
  anthropic: "Claude Sonnet 4.5",
  opus: "Claude Opus 4.5",
  google: "Gemini 3 Flash",
  googlePro: "Gemini 3 Pro",
  openai: "GPT-5.2",
} as const

export const MODEL_DESCRIPTIONS = {
  anthropic: "Fast & capable (default)",
  opus: "Most capable, best reasoning",
  google: "Fast, great for tool use",
  googlePro: "Best multimodal understanding",
  openai: "Latest OpenAI model",
} as const

export type ModelProvider = keyof typeof MODEL_SETTINGS
```

**Step 2: Verify the file compiles**

Run: `cd ~/.config/superpowers/worktrees/Creative-lovable/ai-gateway && npx tsc lib/ai/agent.ts --noEmit --skipLibCheck`

Expected: No errors

**Step 3: Commit**

```bash
git add lib/ai/agent.ts
git commit -m "refactor(ai): remove direct SDK imports from agent module"
```

---

## Task 3: Update Chat Route with Gateway and Fallback

**Files:**
- Modify: `app/api/chat/route.ts`

**Step 1: Update imports and add fallback wrapper**

Replace the imports and model selection:

```typescript
// app/api/chat/route.ts
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  NoSuchToolError,
  InvalidToolInputError,
  type UIMessage,
  type StopCondition,
} from "ai"
import { SYSTEM_PROMPT, MODEL_SETTINGS, type ModelProvider } from "@/lib/ai/agent"
import { getModel, getDirectModel, getGatewayProviderOptions } from "@/lib/ai/providers"
import {
  createContextAwareTools,
  generateAgenticSystemPrompt,
} from "@/lib/ai/web-builder-agent"
import { setProjectInfo, getAgentContext } from "@/lib/ai/agent-context"
import { withAuth } from "@/lib/auth"
import { getProjectService, getMessageService } from "@/lib/services"
import { logger } from "@/lib/logger"

export const maxDuration = 300

// AI SDK v6: Define tool groups for dynamic activation
const PLANNING_TOOLS = ["planChanges", "markStepComplete", "analyzeProjectState"] as const
const FILE_TOOLS = ["writeFile", "readFile", "editFile", "getProjectStructure"] as const
const BUILD_TOOLS = ["runCommand", "installPackage", "getBuildStatus", "startDevServer"] as const
const CREATION_TOOLS = ["createWebsite"] as const
const CODE_TOOLS = ["executeCode"] as const

type ToolName = typeof PLANNING_TOOLS[number] | typeof FILE_TOOLS[number] | typeof BUILD_TOOLS[number] | typeof CREATION_TOOLS[number] | typeof CODE_TOOLS[number]

// Default project ID for sandbox operations
const DEFAULT_PROJECT_ID = "default"

// Export type for the chat messages
export type ChatMessage = UIMessage

export const POST = withAuth(async (req: Request) => {
  const requestId = req.headers.get('x-request-id') ?? 'unknown'
  const log = logger.child({ requestId, operation: 'chat' })

  try {
    const body = await req.json()
    const {
      messages,
      projectId = DEFAULT_PROJECT_ID,
      model = "anthropic",
    } = body as {
      messages: UIMessage[]
      projectId?: string
      model?: ModelProvider
    }

    // Basic validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'At least one message is required' }, { status: 400 })
    }
    if (messages.length > 100) {
      return Response.json({ error: 'Too many messages (max 100)' }, { status: 400 })
    }

    log.info('Chat request received', { projectId, model, messageCount: messages.length })

    // Get services
    const projectService = getProjectService()
    const messageService = getMessageService()

    // Get model settings
    const modelSettings = MODEL_SETTINGS[model] || MODEL_SETTINGS.anthropic

    // Convert messages for the model
    const modelMessages = await convertToModelMessages(messages)

    // Create context-aware tools for this project
    const tools = createContextAwareTools(projectId)

    // Generate enhanced system prompt with context awareness
    const systemPrompt = generateAgenticSystemPrompt(projectId, SYSTEM_PROMPT)

    // Initialize project info if this is a new session
    setProjectInfo(projectId, { projectName: projectId })

    // Ensure project exists in database BEFORE any tool calls can trigger context saves
    if (projectId && projectId !== DEFAULT_PROJECT_ID) {
      try {
        await projectService.ensureProjectExists(projectId, "Untitled Project")
      } catch (dbError) {
        console.warn("Failed to ensure project exists:", dbError)
      }
    }

    // AI SDK v6 best practice: Track steps for debugging and monitoring
    let currentStepNumber = 0

    // Shared streamText configuration
    const streamConfig = {
      system: systemPrompt,
      messages: modelMessages,
      tools,
      abortSignal: req.signal,
      stopWhen: stepCountIs(modelSettings.maxSteps || 50),
      ...(modelSettings.maxTokens && { maxOutputTokens: modelSettings.maxTokens }),
      onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }: any) => {
        currentStepNumber++
        console.log(`[Step ${currentStepNumber}] Finished:`, {
          finishReason,
          toolCallsCount: toolCalls?.length || 0,
          toolResultsCount: toolResults?.length || 0,
          textLength: text?.length || 0,
          tokensUsed: usage?.totalTokens,
        })
      },
      prepareStep: async ({ stepNumber, messages: stepMessages }: any) => {
        const context = getAgentContext(projectId)
        const config: {
          messages?: typeof stepMessages
          activeTools?: ToolName[]
        } = {}

        if (stepMessages.length > 30) {
          console.log(`[Step ${stepNumber}] Compressing conversation history`)
          config.messages = [
            stepMessages[0],
            ...stepMessages.slice(-20),
          ]
        }

        if (stepNumber === 0) {
          config.activeTools = [...PLANNING_TOOLS, ...CREATION_TOOLS, "getProjectStructure"] as ToolName[]
        } else if (context.buildStatus?.hasErrors) {
          config.activeTools = [...FILE_TOOLS, ...BUILD_TOOLS] as ToolName[]
          console.log(`[Step ${stepNumber}] Build errors detected, focusing on debugging tools`)
        } else if (context.serverState?.isRunning && context.taskGraph) {
          config.activeTools = [...FILE_TOOLS, ...BUILD_TOOLS, "markStepComplete"] as ToolName[]
        }

        return Object.keys(config).length > 0 ? config : {}
      },
      experimental_repairToolCall: async ({ toolCall, error, messages: repairMessages }: any) => {
        if (NoSuchToolError.isInstance(error)) {
          console.warn(`[Tool Repair] Unknown tool: ${toolCall.toolName}`)
          return null
        }

        if (InvalidToolInputError.isInstance(error)) {
          console.log(`[Tool Repair] Attempting to fix invalid input for: ${toolCall.toolName}`)

          if (typeof toolCall.input === "object" && toolCall.input !== null) {
            const input = toolCall.input as Record<string, unknown>

            if (typeof input.path === "string") {
              input.path = (input.path as string).replace(/^\/+/, "")
            }

            if (typeof input.projectName === "string") {
              input.projectName = (input.projectName as string)
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, "")
            }

            return {
              ...toolCall,
              input: JSON.stringify(input),
            }
          }
        }

        return null
      },
    }

    // Response handler
    const createResponse = (result: any) => {
      return result.toUIMessageStreamResponse({
        originalMessages: messages,
        onError: (error: unknown) => {
          if (NoSuchToolError.isInstance(error)) {
            return "I tried to use an unknown tool. Let me try a different approach."
          }
          if (InvalidToolInputError.isInstance(error)) {
            return "I provided invalid input to a tool. Let me fix that and try again."
          }
          return `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`
        },
        onFinish: async ({ messages: finishedMessages }: any) => {
          if (projectId && projectId !== DEFAULT_PROJECT_ID) {
            try {
              const messagesToSave = finishedMessages.map((msg: UIMessage) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant" | "system",
                content: msg.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || "",
                parts: msg.parts as any[],
              }))

              await messageService.saveConversation(projectId, messagesToSave)
              console.log(`[Chat] Saved ${messagesToSave.length} messages for project ${projectId}`)
            } catch (dbError) {
              console.error("Failed to save messages:", dbError)
            }
          }

          const context = getAgentContext(projectId)
          console.log(`[Chat Complete] Project: ${projectId}, Steps: ${currentStepNumber}, Server: ${context.serverState?.isRunning ? "Running" : "Stopped"}`)
        },
      })
    }

    // Gateway-first with fallback to direct SDK
    try {
      const result = streamText({
        model: getModel(model),
        providerOptions: getGatewayProviderOptions(model),
        ...streamConfig,
      })
      return createResponse(result)
    } catch (gatewayError) {
      console.warn('Gateway failed, using direct SDK:', gatewayError)

      const result = streamText({
        model: getDirectModel(model),
        ...streamConfig,
      })
      return createResponse(result)
    }
  } catch (error) {
    console.error("Chat API error:", error)

    const errorMessage = error instanceof Error ? error.message : "Failed to process chat request"
    const errorDetails = {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }

    return new Response(JSON.stringify(errorDetails), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
```

**Step 2: Verify the file compiles**

Run: `cd ~/.config/superpowers/worktrees/Creative-lovable/ai-gateway && npx tsc app/api/chat/route.ts --noEmit --skipLibCheck`

Expected: No errors (or warnings about module resolution)

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(api): integrate AI Gateway with fallback in chat route"
```

---

## Task 4: Update Generate Title Route

**Files:**
- Modify: `app/api/generate-title/route.ts`

**Step 1: Update to use providers module**

Replace the file content:

```typescript
// app/api/generate-title/route.ts
import { generateText } from "ai"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import { ValidationError, ExternalServiceError } from "@/lib/errors"
import { getProjectService } from "@/lib/services"
import { getModel, getDirectModel, getGatewayProviderOptions } from "@/lib/ai/providers"

const TITLE_PROMPT = `Generate a short, descriptive project title (2-4 words) based on the user's request.
The title should be:
- Concise and memorable
- Descriptive of what's being built
- In Title Case (capitalize first letter of each word)
- NO quotes, NO punctuation, just the title words

Examples:
- "build me a coffee shop website" → "Coffee Shop Website"
- "create a dashboard for my startup" → "Startup Dashboard"
- "make a portfolio site for a photographer" → "Photography Portfolio"
- "I need a todo app" → "Todo App"
- "build an e-commerce store for shoes" → "Shoe Store"

User request: `

export const POST = withAuth(asyncErrorHandler(async (req: Request) => {
  const { prompt, projectId } = await req.json()

  if (!prompt || typeof prompt !== "string") {
    throw new ValidationError("Prompt is required", { prompt: ["string required"] })
  }

  // Generate config
  const generateConfig = {
    prompt: TITLE_PROMPT + prompt,
    maxOutputTokens: 20,
    temperature: 0.3,
  }

  // Gateway-first with fallback
  let result
  try {
    result = await generateText({
      model: getModel('haiku'),
      providerOptions: getGatewayProviderOptions('haiku'),
      ...generateConfig,
    })
  } catch (gatewayError) {
    console.warn('[generate-title] Gateway failed, using direct SDK:', gatewayError)
    result = await generateText({
      model: getDirectModel('haiku'),
      ...generateConfig,
    })
  }

  // Clean up the title
  let title = result.text
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[.!?:;]$/g, "")
    .trim()

  // Ensure title is in Title Case
  title = title
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")

  // Limit length
  if (title.length > 50) {
    title = title.substring(0, 47) + "..."
  }

  // Update project name in database if projectId provided
  if (projectId) {
    try {
      const projectService = getProjectService()
      await projectService.updateProject(projectId, { name: title })
    } catch (dbError) {
      console.warn("[generate-title] Failed to update project name:", dbError)
    }
  }

  return Response.json({ title })
}))
```

**Step 2: Verify the file compiles**

Run: `cd ~/.config/superpowers/worktrees/Creative-lovable/ai-gateway && npx tsc app/api/generate-title/route.ts --noEmit --skipLibCheck`

Expected: No errors

**Step 3: Commit**

```bash
git add app/api/generate-title/route.ts
git commit -m "feat(api): integrate AI Gateway in generate-title route"
```

---

## Task 5: Update Improve Prompt Route

**Files:**
- Modify: `app/api/improve-prompt/route.ts`

**Step 1: Update to use providers module**

Replace the file content:

```typescript
// app/api/improve-prompt/route.ts
import { generateText } from "ai"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import { improvePromptSchema, createValidationErrorResponse, ValidationError as ZodValidationError } from "@/lib/validations"
import { logger } from "@/lib/logger"
import { getModel, getDirectModel, getGatewayProviderOptions } from "@/lib/ai/providers"

export const maxDuration = 30

const PROMPT_IMPROVER_SYSTEM = `You are a prompt enhancement specialist. Your job is to take a user's brief web development request and expand it into a detailed, actionable prompt that will result in a better web application.

Rules:
1. Keep the core intent but add specific details about:
   - UI/UX features (animations, interactions, responsive design)
   - Pages and navigation structure
   - Key components and sections
   - Visual style and design direction
   - Interactive elements and user flows

2. Be specific but concise - aim for 2-4 sentences max
3. Use natural language, not bullet points
4. Maintain the user's original vision while enhancing it
5. Add suggestions for modern design patterns (bento grids, glassmorphism, gradients, etc.)
6. Include interactivity requirements (forms, modals, state changes)

Examples:
Input: "landing page for a startup"
Output: "Build a modern SaaS landing page with a hero section featuring animated gradient backgrounds and a product demo video, a bento-grid features section with hover effects, customer testimonials carousel, tiered pricing cards with interactive toggle for monthly/yearly billing, and a contact form with validation. Use a dark theme with vibrant accent colors and smooth scroll animations."

Input: "dashboard"
Output: "Create a comprehensive analytics dashboard with a collapsible sidebar navigation, real-time stats cards with animated counters, interactive data visualization charts, a recent activity feed with live updates, user profile dropdown menu, and a dark/light theme toggle. Include loading skeletons, empty states, and toast notifications for user actions."

Input: "portfolio"
Output: "Design a creative portfolio website with an immersive hero section featuring parallax scrolling and a 3D element, a filterable project gallery with modal previews and smooth transitions, an about section with animated skill bars, a timeline-based experience section, and a contact form with social links. Use a minimal aesthetic with bold typography and subtle micro-interactions."

Return ONLY the improved prompt, nothing else.`

export const POST = withAuth(asyncErrorHandler(async (req: Request) => {
  const requestId = req.headers.get('x-request-id') ?? 'unknown'
  const log = logger.child({ requestId, operation: 'improve-prompt' })

  const body = await req.json()

  // Validate with Zod schema
  const validation = improvePromptSchema.safeParse(body)
  if (!validation.success) {
    return createValidationErrorResponse(
      new ZodValidationError('Invalid improve-prompt request', validation.error.issues)
    )
  }

  const { prompt } = validation.data
  log.info('Improving prompt', { promptLength: prompt.length })

  // Generate config
  const generateConfig = {
    system: PROMPT_IMPROVER_SYSTEM,
    prompt: prompt,
    maxOutputTokens: 300,
  }

  // Gateway-first with fallback
  let result
  try {
    result = await generateText({
      model: getModel('anthropic'),
      providerOptions: getGatewayProviderOptions('anthropic'),
      ...generateConfig,
    })
  } catch (gatewayError) {
    console.warn('[improve-prompt] Gateway failed, using direct SDK:', gatewayError)
    result = await generateText({
      model: getDirectModel('anthropic'),
      ...generateConfig,
    })
  }

  return Response.json({ improvedPrompt: result.text.trim() })
}))
```

**Step 2: Verify the file compiles**

Run: `cd ~/.config/superpowers/worktrees/Creative-lovable/ai-gateway && npx tsc app/api/improve-prompt/route.ts --noEmit --skipLibCheck`

Expected: No errors

**Step 3: Commit**

```bash
git add app/api/improve-prompt/route.ts
git commit -m "feat(api): integrate AI Gateway in improve-prompt route"
```

---

## Task 6: Update Environment Example

**Files:**
- Modify: `.env.example` (if exists) or create documentation

**Step 1: Document the new environment variable**

Add to `.env.example` or create if it doesn't exist:

```bash
# AI Gateway (optional - uses Vercel OIDC in production)
AI_GATEWAY_API_KEY=

# Direct provider API keys (fallback)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

**Step 2: Commit**

```bash
git add .env.example 2>/dev/null || echo "No .env.example to add"
git commit -m "docs: add AI_GATEWAY_API_KEY to environment example" --allow-empty
```

---

## Task 7: Verify Build

**Step 1: Run build to check for errors**

Run: `cd ~/.config/superpowers/worktrees/Creative-lovable/ai-gateway && pnpm build`

Expected: Build succeeds (or only has pre-existing issues)

**Step 2: If build fails, fix any type errors**

Address any TypeScript errors that arise from the changes.

**Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build errors from AI Gateway integration"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create provider module | `lib/ai/providers.ts` |
| 2 | Update agent module | `lib/ai/agent.ts` |
| 3 | Update chat route | `app/api/chat/route.ts` |
| 4 | Update generate-title route | `app/api/generate-title/route.ts` |
| 5 | Update improve-prompt route | `app/api/improve-prompt/route.ts` |
| 6 | Document env vars | `.env.example` |
| 7 | Verify build | N/A |
