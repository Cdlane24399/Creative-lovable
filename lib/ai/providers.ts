import { createGateway } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

/**
 * AI SDK v6 Gateway Pattern
 *
 * Uses createGateway() for unified model routing with automatic fallback.
 * Gateway authenticates via:
 * - AI_GATEWAY_API_KEY (local development)
 * - Vercel OIDC (production)
 *
 * Direct Provider Fallback:
 * - When AI_GATEWAY_API_KEY is not explicitly set, individual provider API keys
 *   (e.g. GOOGLE_GENERATIVE_AI_API_KEY) are used directly via their SDKs.
 * - This resolves "Authentication Error" in production when a provider is not
 *   configured in the Vercel AI Gateway but its API key is set as an env var.
 *
 * Priority:
 * 1. AI_GATEWAY_API_KEY set → always use gateway (explicit gateway config)
 * 2. GOOGLE_GENERATIVE_AI_API_KEY set (no gateway key) → use @ai-sdk/google
 * 3. Otherwise → use gateway via Vercel OIDC (may fail if provider not configured)
 *
 * Web Search:
 * - Enable via providerOptions.gateway.search in streamText()
 * - Uses AI Gateway's built-in search capability
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-core/gateway
 * @see https://vercel.com/docs/ai-gateway/capabilities/web-search
 */
const aiGateway = createGateway()

// Model configuration with Gateway IDs and provider routing
type ModelConfigEntry = {
  gatewayId: string
  providerOrder: readonly string[]
  openRouterId?: string
  /** Direct @ai-sdk/google model ID used when GOOGLE_GENERATIVE_AI_API_KEY is set without AI_GATEWAY_API_KEY */
  directGoogleModelId?: string
}

const MODEL_CONFIG = {
  anthropic: {
    gatewayId: 'anthropic/claude-sonnet-4-6',
    providerOrder: ['anthropic', 'vertex', 'openrouter'] as const,
  },
  opus: {
    gatewayId: 'anthropic/claude-opus-4-6',
    providerOrder: ['anthropic', 'vertex', 'openrouter'] as const,
  },
  google: {
    gatewayId: 'google/gemini-3-flash-preview',
    providerOrder: ['google', 'vertex', 'openrouter'] as const,
    // Direct model ID used by @ai-sdk/google when not routing through AI Gateway
    directGoogleModelId: 'gemini-2.0-flash',
  },
  googlePro: {
    gatewayId: 'google/gemini-3.1-pro-preview',
    providerOrder: ['google', 'vertex', 'openrouter'] as const,
    // Direct model ID used by @ai-sdk/google when not routing through AI Gateway
    directGoogleModelId: 'gemini-1.5-pro',
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

// ── Direct Google provider (bypasses AI Gateway) ──────────────────────────────
// Used when GOOGLE_GENERATIVE_AI_API_KEY is set and AI_GATEWAY_API_KEY is not.
// This fixes "Authentication Error" in production when Gemini isn't configured
// in the Vercel AI Gateway but the raw API key is present as an env var.
//
// The singleton is intentional: env vars are read once per process/module
// lifecycle, so the API key never changes between requests. This mirrors the
// existing openRouterClient pattern in this file.
let googleDirectClient: ReturnType<typeof createGoogleGenerativeAI> | null = null

function getGoogleDirectClient() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  if (!apiKey) return null

  if (!googleDirectClient) {
    googleDirectClient = createGoogleGenerativeAI({ apiKey })
  }
  return googleDirectClient
}

/**
 * Returns true when the AI Gateway is explicitly configured via API key.
 * On Vercel without AI_GATEWAY_API_KEY the gateway uses OIDC, but only works
 * if the provider (e.g. Google) is configured in the Vercel AI Gateway dashboard.
 */
function isGatewayExplicitlyConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim())
}

/**
 * Returns true when a Google model should use the direct @ai-sdk/google SDK
 * instead of routing through the AI Gateway.
 *
 * Condition: GOOGLE_GENERATIVE_AI_API_KEY is set AND AI_GATEWAY_API_KEY is not
 * explicitly set (i.e. gateway is not the preferred path for this deployment).
 */
export function isUsingDirectGoogleProvider(key: ModelKey): boolean {
  const config = MODEL_CONFIG[key] as ModelConfigEntry
  if (!config.directGoogleModelId) return false
  if (isGatewayExplicitlyConfigured()) return false
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim())
}

/**
 * Get a model instance via AI Gateway, or fall back to a direct provider SDK.
 *
 * Priority:
 * 1. AI_GATEWAY_API_KEY set → always use AI Gateway (explicit gateway config).
 * 2. GOOGLE_GENERATIVE_AI_API_KEY set (no gateway key) → use @ai-sdk/google
 *    directly for `google` / `googlePro` models.
 * 3. Otherwise → use AI Gateway via Vercel OIDC.
 *
 * This resolves "Authentication Error" in production when a provider (e.g.
 * Google) is not configured in the Vercel AI Gateway but its API key is set
 * as a plain environment variable.
 *
 * @param key - Model identifier from MODEL_CONFIG
 * @returns Language model instance
 */
export function getModel(key: ModelKey) {
  const config = MODEL_CONFIG[key] as ModelConfigEntry

  // For Google models: prefer direct @ai-sdk/google when key is available
  // and the user hasn't explicitly opted into AI Gateway.
  if (config.directGoogleModelId && !isGatewayExplicitlyConfigured()) {
    const googleClient = getGoogleDirectClient()
    if (googleClient) {
      return googleClient(config.directGoogleModelId)
    }
  }

  // Default: route through AI Gateway (requires AI_GATEWAY_API_KEY or Vercel OIDC)
  return aiGateway(config.gatewayId)
}

/**
 * Get Gateway provider options for a model.
 *
 * Returns empty options when the model is being served directly (not via
 * gateway), so that provider-specific options don't bleed into direct calls.
 *
 * AI SDK v6: Provider fallback order configuration
 * Defines which providers to try in sequence when primary fails
 *
 * @param key - Model identifier from MODEL_CONFIG
 * @returns Provider options with fallback order, or empty object for direct providers
 *
 * @example
 * ```ts
 * const result = streamText({
 *   model: getModel('anthropic'),
 *   providerOptions: getGatewayProviderOptions('anthropic'),
 *   // Will try: anthropic -> vertex -> openrouter
 * })
 * ```
 */
export function getGatewayProviderOptions(key: ModelKey) {
  // When using a direct provider SDK, gateway-specific options are not needed
  // and passing them could confuse the underlying SDK.
  if (isUsingDirectGoogleProvider(key)) {
    return undefined
  }

  return {
    gateway: {
      order: [...MODEL_CONFIG[key].providerOrder],
    },
  }
}

/**
 * Get Gateway provider options with web search enabled
 *
 * AI SDK v6: Enables AI Gateway's built-in web search capability
 * The model can use search to look up documentation, APIs, and more
 *
 * Falls back to plain provider options (no search) when using a direct
 * provider SDK, since search is a gateway-only feature.
 *
 * @param key - Model identifier from MODEL_CONFIG
 * @returns Provider options with web search enabled
 *
 * @example
 * ```ts
 * const result = streamText({
 *   model: getModel('anthropic'),
 *   providerOptions: getGatewayProviderOptionsWithSearch('anthropic'),
 *   // Model can now use search tool to look up information
 * })
 * ```
 * @see https://vercel.com/docs/ai-gateway/capabilities/web-search
 */
export function getGatewayProviderOptionsWithSearch(key: ModelKey) {
  // Direct Google SDK doesn't support gateway search — return undefined (no provider options).
  if (isUsingDirectGoogleProvider(key)) {
    return undefined
  }

  return {
    gateway: {
      order: [...MODEL_CONFIG[key].providerOrder],
      search: {
        // Keep search bounded by default to control latency and provider costs.
        maxSearchCalls: 1,
      },
    },
  }
}
