# AI Gateway Provider Integration Design

## Overview

Integrate Vercel AI Gateway as the primary API provider with automatic fallback to direct provider SDKs when Gateway is unavailable.

## Goals

1. **Fallback/reliability** - Use AI Gateway as primary, fall back to direct SDK on Gateway failure
2. **Provider flexibility** - Route same model through different providers (e.g., Claude via Anthropic → Vertex)

## Architecture

### Provider Flow

```
Request → AI Gateway (primary)
              ↓
         Provider routing (anthropic → vertex)
              ↓
         [Gateway failure?] → Direct SDK fallback
```

### Fallback Layers

1. **Gateway provider routing** - Same model via different providers (configured via `order` option)
2. **Direct SDK fallback** - Complete Gateway failure triggers direct provider API call

No model fallbacks - only the configured latest models are used.

## Implementation

### New File: `lib/ai/providers.ts`

```typescript
import { createGateway } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Gateway instance (uses AI_GATEWAY_API_KEY or Vercel OIDC automatically)
const aiGateway = createGateway();

// Direct SDK fallbacks (use provider API keys)
const anthropicDirect = createAnthropic();
const openaiDirect = createOpenAI();
const googleDirect = createGoogleGenerativeAI();

// Model configuration
const MODEL_CONFIG = {
  anthropic: {
    gatewayId: 'anthropic/claude-sonnet-4-5',
    directModel: () => anthropicDirect('claude-sonnet-4-5'),
    providerOrder: ['anthropic', 'vertex'],
  },
  opus: {
    gatewayId: 'anthropic/claude-opus-4-5-20251101',
    directModel: () => anthropicDirect('claude-opus-4-5-20251101'),
    providerOrder: ['anthropic', 'vertex'],
  },
  google: {
    gatewayId: 'google/gemini-3-flash-preview',
    directModel: () => googleDirect('gemini-3-flash-preview'),
    providerOrder: ['google', 'vertex'],
  },
  googlePro: {
    gatewayId: 'google/gemini-3-pro-preview',
    directModel: () => googleDirect('gemini-3-pro-preview'),
    providerOrder: ['google', 'vertex'],
  },
  openai: {
    gatewayId: 'openai/gpt-5.2',
    directModel: () => openaiDirect('gpt-5.2'),
    providerOrder: ['openai'],
  },
};

export function getModel(key: ModelProvider) {
  const config = MODEL_CONFIG[key];
  return aiGateway(config.gatewayId);
}

export function getDirectModel(key: ModelProvider) {
  const config = MODEL_CONFIG[key];
  return config.directModel();
}

export function getProviderOrder(key: ModelProvider) {
  return MODEL_CONFIG[key].providerOrder;
}
```

### Modified: `lib/ai/agent.ts`

- Remove direct SDK imports (`createAnthropic`, `createOpenAI`, `createGoogleGenerativeAI`)
- Remove `MODEL_OPTIONS` object
- Keep: `SYSTEM_PROMPT`, `MODEL_SETTINGS`, `MODEL_DISPLAY_NAMES`, `MODEL_DESCRIPTIONS`, `ModelProvider` type

### Modified: `app/api/chat/route.ts`

```typescript
import { getModel, getDirectModel, getProviderOrder } from '@/lib/ai/providers';

// In POST handler:
try {
  const result = streamText({
    model: getModel(model),
    providerOptions: {
      gateway: {
        order: getProviderOrder(model),
      },
    },
    // ... rest of config
  });
  return result.toUIMessageStreamResponse(/* ... */);
} catch (gatewayError) {
  console.warn('Gateway failed, using direct SDK:', gatewayError);

  const result = streamText({
    model: getDirectModel(model),
    // ... same config
  });
  return result.toUIMessageStreamResponse(/* ... */);
}
```

### Modified: `app/api/generate-title/route.ts`

Update to use `getModel()` from providers.ts

### Modified: `app/api/improve-prompt/route.ts`

Update to use `getModel()` from providers.ts

## Environment Variables

### Local Development (.env.local)

```bash
# AI Gateway
AI_GATEWAY_API_KEY=your_gateway_api_key

# Direct provider fallbacks (existing)
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
```

### Vercel Production

- `AI_GATEWAY_API_KEY` not needed - OIDC authentication is automatic
- Keep provider API keys for fallback

## Model Configuration

| Model Key | Gateway ID | Provider Order |
|-----------|-----------|----------------|
| `anthropic` | `anthropic/claude-sonnet-4-5` | `['anthropic', 'vertex']` |
| `opus` | `anthropic/claude-opus-4-5-20251101` | `['anthropic', 'vertex']` |
| `google` | `google/gemini-3-flash-preview` | `['google', 'vertex']` |
| `googlePro` | `google/gemini-3-pro-preview` | `['google', 'vertex']` |
| `openai` | `openai/gpt-5.2` | `['openai']` |

## Files Changed

| File | Change |
|------|--------|
| `lib/ai/providers.ts` | New - Gateway + direct SDK setup |
| `lib/ai/agent.ts` | Remove SDK imports and MODEL_OPTIONS |
| `app/api/chat/route.ts` | Use providers.ts, add fallback wrapper |
| `app/api/generate-title/route.ts` | Use getModel() |
| `app/api/improve-prompt/route.ts` | Use getModel() |
