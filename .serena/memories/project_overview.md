# Creative-lovable Project Overview

## Purpose
Creative-lovable is an AI-powered web development assistant that builds real, working applications using E2B sandboxes, Next.js 16, and AI SDK v6. It features a layered architecture with proper separation of concerns.

## Tech Stack
- **Frontend**: Next.js 16+ (^16.1.6), React 19.2.4, TypeScript 5.9+, Tailwind CSS 4.x
- **UI Components**: shadcn/ui, Radix UI, Framer Motion 12.x, Lucide Icons
- **AI**: AI SDK v6 (ai@^6.0.73) with AI Gateway via `createGateway()`
- **AI Providers (8)**: Claude Sonnet 4.5, Claude Opus 4.6, Gemini 3 Flash, Gemini 3 Pro, GPT-5.2, Claude 3.5 Haiku, MiniMax M2.1, Kimi K2.5, GLM-4.7
- **Database**: Neon (PostgreSQL serverless) with `@neondatabase/serverless`
- **Sandboxes**: E2B Code Interpreter 2.x + `@vercel/sandbox`
- **Cache**: `@upstash/redis` with in-memory LRU fallback
- **Auth**: Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Testing**: Jest 30, Playwright 1.58
- **Package Manager**: pnpm

## Key Dependencies
- `ai`: ^6.0.73 (Vercel AI SDK v6)
- `@ai-sdk/anthropic`: ^3.0.37, `@ai-sdk/google`: ^3.0.21, `@ai-sdk/openai`: ^3.0.25
- `@ai-sdk/react`: 3.0.75
- `@e2b/code-interpreter`: ^2.3.3, `e2b`: ^2.12.0
- `@vercel/sandbox`: ^1.4.1
- `@neondatabase/serverless`: ^1.0.2
- `@supabase/ssr`: ^0.8.0, `@supabase/supabase-js`: ^2.95.2
- `@upstash/redis`: ^1.36.2
- `next`: ^16.1.6, `react`: 19.2.4
- `framer-motion`: ^12.33.0
- `zod`: 4.3.6
- `jest`: ^30.2.0, `@playwright/test`: ^1.58.1
- `typescript`: ^5.9.3

## AI Model Providers
| Key | Model | Display Name |
|-----|-------|-------------|
| `anthropic` | claude-sonnet-4-5 | Claude Sonnet 4.5 |
| `opus` | claude-opus-4-6 | Claude Opus 4.6 |
| `google` | gemini-3-flash-preview | Gemini 3 Flash |
| `googlePro` | gemini-3-pro-preview | Gemini 3 Pro |
| `openai` | gpt-5.2 | GPT-5.2 |
| `haiku` | claude-3-5-haiku-20241022 | Claude 3.5 Haiku |
| `minimax` | minimax-m2.1 | MiniMax M2.1 |
| `moonshot` | kimi-k2.5 | Kimi K2.5 |
| `glm` | glm-4.7 | GLM-4.7 |

## Environment Variables (Required)
- `E2B_API_KEY` - E2B sandbox API key
- `NEON_DATABASE_URL` or `DATABASE_URL` - Neon database URL
- At least one AI provider key (ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

## Environment Variables (Optional)
- `E2B_TEMPLATE_ID` - Custom E2B template for faster startup
- `AI_GATEWAY_URL` - AI Gateway endpoint URL
- `AI_GATEWAY_TOKEN` or `AI_GATEWAY_API_KEY` - AI Gateway auth token
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis cache
- `REDIS_URL` + `REDIS_TOKEN` - Alternative Redis config
- `API_KEY` - API authentication key
