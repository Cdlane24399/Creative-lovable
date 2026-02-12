# Environment Variables & AI Models Reference

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `E2B_API_KEY` | API key for E2B sandboxes. | Yes |
| `AI_GATEWAY_API_KEY` | AI Gateway authentication key used by AI SDK `createGateway()`. | Recommended |
| `AI_GATEWAY_URL` | AI Gateway endpoint URL override. | Optional |
| `ANTHROPIC_API_KEY` | API key for Anthropic models. | Fallback |
| `OPENAI_API_KEY` | API key for OpenAI models. | Fallback |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API key for Google models. | Fallback |
| `DATABASE_URL` | PostgreSQL connection string. | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Public URL for your Supabase project. | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key for your Supabase project. | Yes |
| `E2B_TEMPLATE` | Custom E2B template ID/name for faster startup. | Recommended |
| `E2B_TEMPLATE_ID` | Legacy alias for `E2B_TEMPLATE`. | Fallback |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint for caching/rate limiting. | Recommended |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST authentication token. | Recommended |
| `REDIS_URL` | Alternative name for Redis endpoint. | Fallback |
| `REDIS_TOKEN` | Alternative name for Redis token. | Fallback |

See `.env.example` for complete configuration options.

## Available Models (via AI Gateway)

Defined in `lib/ai/providers.ts` via `MODEL_CONFIG`.

| Key | Model | Description |
|---|---|---|
| `anthropic` | Claude Sonnet 4.5 | Fast and capable (default) |
| `opus` | Claude Opus 4.6 | Most capable, best reasoning |
| `google` | Gemini 3 Flash Preview | Fast, great for tool use |
| `googlePro` | Gemini 3 Pro Preview | Best multimodal understanding |
| `openai` | GPT-5.2 | Latest OpenAI model |
| `haiku` | Claude 3.5 Haiku | Title generation |
| `minimax` | MiniMax M2.1 | Advanced Chinese LLM with strong reasoning |
| `moonshot` | Kimi K2.5 | Long context specialist |
| `glm` | GLM-4.7 | General Language Model from Zhipu AI |

## Rate Limiting Pattern

```typescript
import { checkChatRateLimit } from "@/lib/rate-limit"

export const POST = withAuth(async (req: Request) => {
  const rateLimit = checkChatRateLimit(req)
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimit.headers }
    )
  }
  // ... handler logic
})
```
