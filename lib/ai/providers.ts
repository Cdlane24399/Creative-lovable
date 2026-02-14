import { createGateway } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

// Gateway instance - uses AI_GATEWAY_API_KEY locally, Vercel OIDC in production
const aiGateway = createGateway()

// Model configuration with Gateway IDs and provider routing
type ModelConfigEntry = {
  gatewayId: string
  providerOrder: readonly string[]
  openRouterId?: string
}

const MODEL_CONFIG = {
  anthropic: {
    gatewayId: 'anthropic/claude-sonnet-4-5',
    providerOrder: ['anthropic', 'vertex', 'openrouter'] as const,
  },
  opus: {
    gatewayId: 'anthropic/claude-opus-4-6',
    providerOrder: ['anthropic', 'vertex', 'openrouter'] as const,
  },
  google: {
    gatewayId: 'google/gemini-3-flash-preview',
    providerOrder: ['google', 'vertex', 'openrouter'] as const,
  },
  googlePro: {
    gatewayId: 'google/gemini-3-pro-preview',
    providerOrder: ['google', 'vertex', 'openrouter'] as const,
  },
  openai: {
    gatewayId: 'openai/gpt-5.2',
    providerOrder: ['openai', 'openrouter'] as const,
  },
  haiku: {
    gatewayId: 'anthropic/claude-3-5-haiku-20241022',
    providerOrder: ['anthropic', 'vertex', 'openrouter'] as const,
  },
  minimax: {
    gatewayId: 'minimax/minimax-m2.5',
    providerOrder: ['minimax'] as const,
  },
  moonshot: {
    gatewayId: 'moonshotai/kimi-k2.5',
    providerOrder: ['moonshotai'] as const,
  },
  glm: {
    gatewayId: 'zai/glm-5',
    providerOrder: ['zai'] as const,
    openRouterId: 'z-ai/glm-5',
  },
} as const satisfies Record<string, ModelConfigEntry>

export type ModelKey = keyof typeof MODEL_CONFIG

const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'

let openRouterClient: ReturnType<typeof createOpenAI> | null = null

function getOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'OpenRouter fallback requested but OPENROUTER_API_KEY is not configured',
    )
  }

  if (!openRouterClient) {
    const headers: Record<string, string> = {}

    if (process.env.OPENROUTER_HTTP_REFERER) {
      headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER
    }
    if (process.env.OPENROUTER_APP_NAME) {
      headers['X-Title'] = process.env.OPENROUTER_APP_NAME
    }

    openRouterClient = createOpenAI({
      name: 'openrouter',
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    })
  }

  return openRouterClient
}

function getOpenRouterModelId(key: ModelKey) {
  const config = MODEL_CONFIG[key] as ModelConfigEntry
  return config.openRouterId ?? config.gatewayId
}

export function hasOpenRouterFallback() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

/**
 * Get a model instance via OpenRouter (direct provider fallback path).
 */
export function getOpenRouterModel(key: ModelKey) {
  const openRouter = getOpenRouterClient()
  return openRouter(getOpenRouterModelId(key))
}

/**
 * Get a model instance via AI Gateway
 */
export function getModel(key: ModelKey) {
  const config = MODEL_CONFIG[key]
  return aiGateway(config.gatewayId)
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
