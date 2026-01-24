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
