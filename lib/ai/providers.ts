import { createGateway, wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

/**
 * AI SDK v6 Gateway + Fallback Pattern
 *
 * The AI Gateway is always the **default and primary** provider for every model.
 * Direct provider SDKs (e.g. @ai-sdk/google) are used as **runtime fallbacks**
 * that activate automatically when the gateway returns an authentication error
 * for a specific provider.
 *
 * Gateway authenticates via:
 * - AI_GATEWAY_API_KEY (explicit API key, local dev or self-hosted)
 * - Vercel OIDC (automatic in Vercel deployments)
 *
 * Runtime fallback for Google / Gemini:
 * - If the gateway request fails with a 401 / 403 / auth error AND
 *   GOOGLE_GENERATIVE_AI_API_KEY is set as an env var, the call is retried
 *   transparently via @ai-sdk/google without changing the caller's code.
 * - This resolves "Authentication Error" in production when Google is not yet
 *   configured in the Vercel AI Gateway dashboard but a raw API key is present.
 *
 * Priority (always):
 * 1. AI Gateway (AI_GATEWAY_API_KEY or Vercel OIDC)       ← default
 * 2. @ai-sdk/google direct (GOOGLE_GENERATIVE_AI_API_KEY) ← automatic fallback
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
  /**
   * Direct @ai-sdk/google model ID.
   * When set AND GOOGLE_GENERATIVE_AI_API_KEY is available, this model is used
   * as a runtime fallback if the gateway call fails with an auth error.
   */
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
    directGoogleModelId: 'gemini-2.0-flash',
  },
  googlePro: {
    gatewayId: 'google/gemini-3.1-pro-preview',
    providerOrder: ['google', 'vertex', 'openrouter'] as const,
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

// ── Direct Google provider client (fallback only) ─────────────────────────────
// This client is created lazily and used only when the AI Gateway returns an
// authentication error for a Google model.
// Singleton pattern is safe here: env vars don't change between requests.
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
 * Returns true if the AI Gateway returned an authentication / authorisation error.
 * These error patterns are used to trigger the direct-provider fallback.
 */
function isGatewayAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('api key') ||
    msg.includes('api_key') ||
    msg.includes('authentication') ||
    msg.includes('permission_denied')
  )
}

/** Language model instance returned by @ai-sdk/google provider factory. */
type GoogleLanguageModel = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>

/**
 * Creates AI SDK middleware that retries a failed gateway call with a direct
 * provider model when the failure is an authentication / authorisation error.
 *
 * This lets the AI Gateway remain the primary (default) path while still
 * recovering gracefully when a provider (e.g. Google) is not yet configured
 * in the gateway dashboard but its API key is present in the environment.
 *
 * Both doGenerate (non-streaming) and doStream (streaming) are covered so the
 * fallback fires regardless of the call mode.
 */
function createGatewayAuthFallbackMiddleware(
  fallbackModel: GoogleLanguageModel,
): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',

    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate()
      } catch (error) {
        if (isGatewayAuthError(error)) {
          return await fallbackModel.doGenerate(params)
        }
        throw error
      }
    },

    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream()
      } catch (error) {
        if (isGatewayAuthError(error)) {
          return await fallbackModel.doStream(params)
        }
        throw error
      }
    },
  }
}

/**
 * Get a model instance.
 *
 * The AI Gateway is **always the primary provider**.
 * For Google / Gemini models, if GOOGLE_GENERATIVE_AI_API_KEY is available
 * the returned model is wrapped with fallback middleware: if the gateway call
 * fails with an authentication error the request is automatically retried
 * using @ai-sdk/google directly, without any change to the calling code.
 *
 * @param key - Model identifier from MODEL_CONFIG
 * @returns Language model instance (gateway with optional direct-SDK fallback)
 */
export function getModel(key: ModelKey) {
  const config = MODEL_CONFIG[key] as ModelConfigEntry

  // AI Gateway is always the primary model for every key.
  const gatewayModel = aiGateway(config.gatewayId)

  // For Google models: attach a fallback so that auth errors from the gateway
  // automatically retry via @ai-sdk/google if the API key is configured.
  if (config.directGoogleModelId) {
    const googleClient = getGoogleDirectClient()
    if (googleClient) {
      const directFallback = googleClient(config.directGoogleModelId)
      return wrapLanguageModel({
        model: gatewayModel,
        middleware: createGatewayAuthFallbackMiddleware(directFallback),
      })
    }
  }

  return gatewayModel
}

/**
 * Get Gateway provider options for a model.
 *
 * Since the AI Gateway is always the primary provider, these options are
 * returned for every model key to configure provider routing and fallback order.
 *
 * @param key - Model identifier from MODEL_CONFIG
 * @returns Provider options with fallback order
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
  return {
    gateway: {
      order: [...MODEL_CONFIG[key].providerOrder],
    },
  }
}

/**
 * Get Gateway provider options with web search enabled.
 *
 * AI SDK v6: Enables AI Gateway's built-in web search capability.
 * The model can use search to look up documentation, APIs, and more.
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
