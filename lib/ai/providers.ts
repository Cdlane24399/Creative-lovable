import { createGateway } from 'ai'

// Gateway instance - uses AI_GATEWAY_API_KEY locally, Vercel OIDC in production
const aiGateway = createGateway()

// Model configuration with Gateway IDs and provider routing
const MODEL_CONFIG = {
  anthropic: {
    gatewayId: 'anthropic/claude-sonnet-4-5',
    providerOrder: ['anthropic', 'vertex'] as const,
  },
  opus: {
    gatewayId: 'anthropic/claude-opus-4-5-20251101',
    providerOrder: ['anthropic', 'vertex'] as const,
  },
  google: {
    gatewayId: 'google/gemini-3-flash-preview',
    providerOrder: ['google', 'vertex'] as const,
  },
  googlePro: {
    gatewayId: 'google/gemini-3-pro-preview',
    providerOrder: ['google', 'vertex'] as const,
  },
  openai: {
    gatewayId: 'openai/gpt-5.2',
    providerOrder: ['openai'] as const,
  },
  haiku: {
    gatewayId: 'anthropic/claude-3-5-haiku-20241022',
    providerOrder: ['anthropic', 'vertex'] as const,
  },
} as const

export type ModelKey = keyof typeof MODEL_CONFIG

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
