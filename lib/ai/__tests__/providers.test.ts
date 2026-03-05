/**
 * Unit tests for AI provider model selection logic.
 *
 * These tests verify that:
 * 1. The gateway is used when AI_GATEWAY_API_KEY is set (explicit gateway config).
 * 2. @ai-sdk/google direct SDK is used for Google models when
 *    GOOGLE_GENERATIVE_AI_API_KEY is set but AI_GATEWAY_API_KEY is not.
 * 3. Gateway is used as the fallback when no direct provider key is available.
 * 4. getGatewayProviderOptions returns undefined (not gateway options) for
 *    direct-provider Google models to avoid option leakage.
 */

// Mock the AI SDK modules before importing providers
jest.mock('ai', () => ({
  createGateway: jest.fn(() => jest.fn((modelId: string) => ({ source: 'gateway', modelId }))),
}))

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn((opts: { apiKey: string }) =>
    jest.fn((modelId: string) => ({ source: 'google-direct', modelId, apiKey: opts.apiKey })),
  ),
}))

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn((opts: { apiKey: string }) =>
    jest.fn((modelId: string) => ({ source: 'openai-direct', modelId, apiKey: opts.apiKey })),
  ),
}))

const ORIGINAL_ENV = { ...process.env }

function setEnv(vars: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function resetEnv() {
  // Remove any keys we may have added during the test
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

describe('AI providers – model selection', () => {
  beforeEach(() => {
    // Clear module cache so env changes take effect on each import
    jest.resetModules()
    resetEnv()
    // Remove both keys to start from a clean slate
    delete process.env.AI_GATEWAY_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  afterAll(() => {
    resetEnv()
    jest.resetModules()
  })

  it('uses @ai-sdk/google directly when GOOGLE_GENERATIVE_AI_API_KEY is set and AI_GATEWAY_API_KEY is not', async () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key' })

    const { getModel } = await import('../providers')
    const model = getModel('google') as unknown as { source: string; modelId: string }

    expect(model.source).toBe('google-direct')
    expect(model.modelId).toBe('gemini-2.0-flash')
  })

  it('uses @ai-sdk/google directly for googlePro when GOOGLE_GENERATIVE_AI_API_KEY is set', async () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key' })

    const { getModel } = await import('../providers')
    const model = getModel('googlePro') as unknown as { source: string; modelId: string }

    expect(model.source).toBe('google-direct')
    expect(model.modelId).toBe('gemini-1.5-pro')
  })

  it('routes through AI Gateway when AI_GATEWAY_API_KEY is set, even if GOOGLE_GENERATIVE_AI_API_KEY is also set', async () => {
    setEnv({ AI_GATEWAY_API_KEY: 'gateway-key', GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

    const { getModel } = await import('../providers')
    const model = getModel('google') as unknown as { source: string; modelId: string }

    expect(model.source).toBe('gateway')
    expect(model.modelId).toBe('google/gemini-3-flash-preview')
  })

  it('routes through AI Gateway for non-Google models regardless of Google key', async () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

    const { getModel } = await import('../providers')
    const model = getModel('anthropic') as unknown as { source: string; modelId: string }

    expect(model.source).toBe('gateway')
    expect(model.modelId).toBe('anthropic/claude-sonnet-4-6')
  })

  it('falls back to AI Gateway for Google models when GOOGLE_GENERATIVE_AI_API_KEY is not set', async () => {
    // No env vars set at all

    const { getModel } = await import('../providers')
    const model = getModel('google') as unknown as { source: string; modelId: string }

    expect(model.source).toBe('gateway')
    expect(model.modelId).toBe('google/gemini-3-flash-preview')
  })

  it('returns undefined providerOptions for direct Google provider to avoid gateway option leakage', async () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key' })

    const { getGatewayProviderOptions } = await import('../providers')
    const opts = getGatewayProviderOptions('google')

    expect(opts).toBeUndefined()
  })

  it('returns gateway providerOptions for Google when AI_GATEWAY_API_KEY is set', async () => {
    setEnv({ AI_GATEWAY_API_KEY: 'gateway-key', GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

    const { getGatewayProviderOptions } = await import('../providers')
    const opts = getGatewayProviderOptions('google')

    expect(opts).toBeDefined()
    expect((opts as { gateway: { order: string[] } })?.gateway?.order).toContain('google')
  })

  it('returns gateway providerOptions for Anthropic models regardless of Google key', async () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

    const { getGatewayProviderOptions } = await import('../providers')
    const opts = getGatewayProviderOptions('anthropic')

    expect(opts).toBeDefined()
    expect((opts as { gateway: { order: string[] } })?.gateway?.order).toContain('anthropic')
  })

  it('isUsingDirectGoogleProvider returns true for google with GOOGLE_GENERATIVE_AI_API_KEY and no gateway key', async () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' })

    const { isUsingDirectGoogleProvider } = await import('../providers')

    expect(isUsingDirectGoogleProvider('google')).toBe(true)
    expect(isUsingDirectGoogleProvider('googlePro')).toBe(true)
  })

  it('isUsingDirectGoogleProvider returns false for non-Google models', async () => {
    setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' })

    const { isUsingDirectGoogleProvider } = await import('../providers')

    expect(isUsingDirectGoogleProvider('anthropic')).toBe(false)
    expect(isUsingDirectGoogleProvider('openai')).toBe(false)
    expect(isUsingDirectGoogleProvider('haiku')).toBe(false)
  })

  it('isUsingDirectGoogleProvider returns false when AI_GATEWAY_API_KEY overrides', async () => {
    setEnv({ AI_GATEWAY_API_KEY: 'gateway-key', GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

    const { isUsingDirectGoogleProvider } = await import('../providers')

    expect(isUsingDirectGoogleProvider('google')).toBe(false)
  })
})
