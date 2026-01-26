# Creative-lovable Development Guide for AI Assistants

This guide provides a comprehensive overview of the Creative-lovable codebase, architecture, and key patterns to help AI assistants understand and contribute to the project effectively.

## 1. Project Overview

Creative-lovable is an AI-powered web development assistant that builds and iterates on real, working Next.js applications in seconds. It leverages E2B sandboxes for secure code execution and the Vercel AI SDK for state-of-the-art agentic workflows.

### 1.1. Core Technologies

| Category | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js | 15+ | App Router, Server Components |
| Language | TypeScript | 5.x | Strict mode enabled |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| UI Components | shadcn/ui, Radix UI | Latest | Pre-installed and configured |
| AI SDK | Vercel AI SDK | v6 Beta | For streaming, tools, and agentic logic |
| Code Execution | E2B Code Interpreter | 2.x | Secure sandbox environment |
| Database | Neon PostgreSQL | | Serverless Postgres |
| Auth | Supabase Auth | | User authentication and management |

---

## 2. Codebase Architecture

The codebase follows a standard Next.js project structure with a clear separation of concerns between UI, application logic, and data layers.

### 2.1. Directory Structure

```
Creative-lovable/
├── app/                  # Next.js App Router (pages and API routes)
│   ├── api/              # API endpoints
│   └── (auth)/           # Authentication routes
├── components/           # Reusable React components
│   ├── ui/               # shadcn/ui components
│   ├── features/         # Feature-specific components
│   └── layout/           # Layout components (Header, Footer, etc.)
├── lib/                  # Core application logic
│   ├── ai/               # AI agent, tools, and prompts
│   ├── db/               # Database repositories and types
│   ├── services/         # Business logic layer
│   ├── e2b/              # E2B sandbox management
│   └── utils/            # Shared utility functions
├── hooks/                # Custom React hooks
├── styles/               # Global CSS styles
└── public/               # Static assets
```

### 2.2. Key Files and Responsibilities

| File Path | Description |
|---|---|
| `lib/ai/web-builder-agent.ts` | Defines the core AI agent tools and logic. **This is the primary file for AI agent development.** |
| `lib/ai/agent.ts` | Contains the main system prompt and model configurations. |
| `app/api/chat/route.ts` | The main API endpoint for handling chat requests and streaming AI responses. |
| `lib/e2b/sandbox.ts` | Manages the lifecycle of E2B sandboxes, including creation, cleanup, and state management. |
| `lib/db/repositories/` | Contains the data access layer for interacting with the database. |
| `lib/services/` | Implements the business logic that coordinates between the API layer and the database. |

---

## 3. Development Workflow

### 3.1. Local Development Setup

1.  **Install Dependencies**: `pnpm install`
2.  **Environment Variables**: Copy `.env.example` to `.env.local` and fill in the required API keys.
3.  **Start Dev Server**: `pnpm dev`

### 3.2. Common Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start the Next.js development server. |
| `pnpm build` | Build the application for production. |
| `pnpm test` | Run the Jest test suite. |
| `pnpm lint` | Run ESLint to check for code quality issues. |

### 3.3. Environment Variables

| Variable | Description | Required |
|---|---|---|
| `E2B_API_KEY` | API key for E2B sandboxes. | Yes |
| `ANTHROPIC_API_KEY` | API key for Anthropic models. | Yes (or other AI provider) |
| `NEON_DATABASE_URL` | Connection string for the Neon database. | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Public URL for your Supabase project. | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key for your Supabase project. | Yes |

---

## 4. AI Agent Instructions

### 4.1. System Prompt

The main system prompt is located in `lib/ai/agent.ts`. It instructs the AI to act as an elite full-stack engineer, building complete, production-ready Next.js applications. Key principles include:

-   **Build Complete Apps**: Architect entire applications, not just single pages.
-   **Componentize Everything**: Break down UI into reusable components.
-   **Interactive by Default**: Ensure all applications have working interactivity.

### 4.2. Available Tools

The AI agent has access to a suite of tools defined in `lib/ai/web-builder-agent.ts`. These tools are context-aware and designed for building web applications. Key tools include:

-   `createWebsite`: Scaffolds a complete Next.js project.
-   `writeFile`: Writes a new file to the sandbox.
-   `editFile`: Makes targeted edits to an existing file.
-   `getProjectStructure`: Scans the project to understand the file structure.
-   `runCommand`: Executes shell commands in the sandbox.

### 4.3. Contributing to the AI Agent

-   **Adding a new tool**: Add a new tool definition to `lib/ai/web-builder-agent.ts` using the `tool()` function from the AI SDK.
-   **Modifying the system prompt**: Edit the `SYSTEM_PROMPT` constant in `lib/ai/agent.ts`.
-   **Improving context awareness**: Enhance the `generateAgenticSystemPrompt` function in `lib/ai/web-builder-agent.ts` to provide more relevant context to the AI.
