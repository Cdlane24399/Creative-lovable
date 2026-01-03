# Creative-lovable Project Overview

## Purpose
Creative-lovable is an AI-powered web development assistant that builds real, working applications using E2B sandboxes, Next.js 15, and AI SDK v6. It features a layered architecture with proper separation of concerns.

## Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **UI Components**: shadcn/ui, Framer Motion, Lucide Icons
- **AI**: AI SDK v6 (Vercel), Claude/GPT-4o/Gemini support
- **Database**: Neon (PostgreSQL serverless) with `@neondatabase/serverless`
- **Sandboxes**: E2B for isolated code execution
- **Cache**: Vercel KV (optional)
- **Auth**: Supabase (in progress)

## Key Dependencies
- `ai`: ^6.0.5 (Vercel AI SDK)
- `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`: AI providers
- `@e2b/code-interpreter`, `e2b`: Sandbox execution
- `@neondatabase/serverless`: Database
- `@supabase/ssr`, `@supabase/supabase-js`: Authentication
- `@vercel/kv`: Caching
- `react`: 19.2.3, `next`: ^16.1.1

## Environment Variables (Required)
- `E2B_API_KEY` - E2B sandbox API key
- `NEON_DATABASE_URL` or `DATABASE_URL` - Neon database URL
- At least one AI provider key (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)

## Environment Variables (Optional)
- `E2B_TEMPLATE_ID` - Custom template for faster startup
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` - Vercel KV cache
- `API_KEY` - API authentication key
