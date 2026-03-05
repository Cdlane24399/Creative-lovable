/**
 * Unit tests for AI provider model selection logic.
 *
 * These tests verify the gateway-first + runtime-fallback design:
 * 1. The AI Gateway is always the primary provider for every model.
 * 2. For Google models, if GOOGLE_GENERATIVE_AI_API_KEY is available the returned
 *    model is wrapped with fallback middleware (wrapLanguageModel).
 * 3. getGatewayProviderOptions always returns gateway routing options because the
 *    gateway is always primary.
 * 4. The fallback middleware catches gateway auth errors and retries with the
 *    direct @ai-sdk/google SDK transparently.
 */

const mockGatewayModelFactory = jest.fn()
const mockGatewayModel = { source: 'gateway', doGenerate: jest.fn(), doStream: jest.fn() }
mockGatewayModelFactory.mockReturnValue(mockGatewayModel)

const mockGoogleDirectModelFactory = jest.fn()
const mockGoogleDirectModel = {
  source: 'google-direct',
  doGenerate: jest.fn(),
  doStream: jest.fn(),
}
mockGoogleDirectModelFactory.mockReturnValue(mockGoogleDirectModel)

const mockWrappedModel = { source: 'wrapped' }
const mockWrapLanguageModel = jest.fn().mockReturnValue(mockWrappedModel)

jest.mock('ai', () => ({
  createGateway: jest.fn(() => mockGatewayModelFactory),
  wrapLanguageModel: mockWrapLanguageModel,
}))

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn((opts: { apiKey: string }) => {
    return (modelId: string) => ({ ...mockGoogleDirectModel, modelId, apiKey: opts.apiKey })
  }),
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
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

describe('AI providers – gateway-first model selection', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    resetEnv()
    delete process.env.AI_GATEWAY_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  afterAll(() => {
    resetEnv()
    jest.resetModules()
  })

  describe('getModel() – gateway is always primary', () => {
    it('uses gateway for Google models when GOOGLE_GENERATIVE_AI_API_KEY is not set', async () => {
      // No Google key → no fallback wrapping, plain gateway model returned
      const { getModel } = await import('../providers')
      const model = getModel('google')

      // Without a Google key, wrapLanguageModel should NOT be called
      expect(mockWrapLanguageModel).not.toHaveBeenCalled()
      expect(mockGatewayModelFactory).toHaveBeenCalledWith('google/gemini-3-flash-preview')
      expect(model).toBe(mockGatewayModel)
    })

    it('uses gateway for non-Google models regardless of Google key', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

      const { getModel } = await import('../providers')
      getModel('anthropic')

      expect(mockGatewayModelFactory).toHaveBeenCalledWith('anthropic/claude-sonnet-4-6')
      // Non-Google models are never wrapped with Google fallback
      expect(mockWrapLanguageModel).not.toHaveBeenCalled()
    })

    it('wraps gateway model with fallback middleware when GOOGLE_GENERATIVE_AI_API_KEY is set', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key' })

      const { getModel } = await import('../providers')
      const model = getModel('google')

      // Gateway should still be the primary model passed to wrapLanguageModel
      expect(mockGatewayModelFactory).toHaveBeenCalledWith('google/gemini-3-flash-preview')
      // The gateway model should be wrapped with fallback middleware
      expect(mockWrapLanguageModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockGatewayModel,
          middleware: expect.objectContaining({ specificationVersion: 'v3' }),
        }),
      )
      expect(model).toBe(mockWrappedModel)
    })

    it('wraps googlePro gateway model with fallback middleware when GOOGLE_GENERATIVE_AI_API_KEY is set', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key' })

      const { getModel } = await import('../providers')
      const model = getModel('googlePro')

      expect(mockGatewayModelFactory).toHaveBeenCalledWith('google/gemini-3.1-pro-preview')
      expect(mockWrapLanguageModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockGatewayModel,
          middleware: expect.objectContaining({ specificationVersion: 'v3' }),
        }),
      )
      expect(model).toBe(mockWrappedModel)
    })

    it('still uses wrapped gateway model when both AI_GATEWAY_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY are set', async () => {
      // Even with an explicit gateway key, the google fallback is still attached
      // (the gateway key just makes the primary call more likely to succeed)
      setEnv({ AI_GATEWAY_API_KEY: 'gateway-key', GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

      const { getModel } = await import('../providers')
      const model = getModel('google')

      expect(mockGatewayModelFactory).toHaveBeenCalledWith('google/gemini-3-flash-preview')
      // Fallback middleware is still attached (gateway remains primary)
      expect(mockWrapLanguageModel).toHaveBeenCalled()
      expect(model).toBe(mockWrappedModel)
    })
  })

  describe('getGatewayProviderOptions() – always returns gateway options', () => {
    it('returns gateway options for Google model regardless of GOOGLE_GENERATIVE_AI_API_KEY', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'google-key' })

      const { getGatewayProviderOptions } = await import('../providers')
      const opts = getGatewayProviderOptions('google')

      // Gateway is always primary, so options are always defined
      expect(opts).toBeDefined()
      expect((opts as { gateway: { order: string[] } }).gateway.order).toContain('google')
    })

    it('returns gateway options for Anthropic model', async () => {
      const { getGatewayProviderOptions } = await import('../providers')
      const opts = getGatewayProviderOptions('anthropic')

      expect(opts).toBeDefined()
      expect((opts as { gateway: { order: string[] } }).gateway.order).toContain('anthropic')
    })

    it('includes openrouter in the provider order for Google models', async () => {
      const { getGatewayProviderOptions } = await import('../providers')
      const opts = getGatewayProviderOptions('google')

      expect((opts as { gateway: { order: string[] } }).gateway.order).toContain('openrouter')
    })
  })

  describe('fallback middleware – auth error detection', () => {
    it('middleware has specificationVersion v3 and both wrapGenerate and wrapStream', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' })

      const { getModel } = await import('../providers')
      getModel('google')

      const callArgs = mockWrapLanguageModel.mock.calls[0][0]
      const middleware = callArgs.middleware

      expect(middleware.specificationVersion).toBe('v3')
      expect(typeof middleware.wrapGenerate).toBe('function')
      expect(typeof middleware.wrapStream).toBe('function')
    })

    it('wrapGenerate falls back to direct model on 401 auth error', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' })

      const { getModel } = await import('../providers')
      getModel('google')

      const { middleware } = mockWrapLanguageModel.mock.calls[0][0]

      const authError = new Error('401 Unauthorized')
      const doGenerate = jest.fn().mockRejectedValue(authError)
      const directResult = { text: 'direct response' }
      mockGoogleDirectModel.doGenerate.mockResolvedValueOnce(directResult)

      const params = { prompt: [], mode: { type: 'regular' } }
      const result = await middleware.wrapGenerate({ doGenerate, doStream: jest.fn(), params, model: mockGatewayModel })

      expect(doGenerate).toHaveBeenCalledTimes(1)
      expect(mockGoogleDirectModel.doGenerate).toHaveBeenCalledWith(params)
      expect(result).toBe(directResult)
    })

    it('wrapStream falls back to direct model on API_KEY auth error', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' })

      const { getModel } = await import('../providers')
      getModel('google')

      const { middleware } = mockWrapLanguageModel.mock.calls[0][0]

      const authError = new Error('API_KEY_INVALID: The provided API key is invalid.')
      const doStream = jest.fn().mockRejectedValue(authError)
      const directStreamResult = { stream: 'direct stream' }
      mockGoogleDirectModel.doStream.mockResolvedValueOnce(directStreamResult)

      const params = { prompt: [], mode: { type: 'regular' } }
      const result = await middleware.wrapStream({ doGenerate: jest.fn(), doStream, params, model: mockGatewayModel })

      expect(doStream).toHaveBeenCalledTimes(1)
      expect(mockGoogleDirectModel.doStream).toHaveBeenCalledWith(params)
      expect(result).toBe(directStreamResult)
    })

    it('wrapGenerate re-throws non-auth errors without falling back', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' })

      const { getModel } = await import('../providers')
      getModel('google')

      const { middleware } = mockWrapLanguageModel.mock.calls[0][0]

      const networkError = new Error('ECONNREFUSED: Connection refused')
      const doGenerate = jest.fn().mockRejectedValue(networkError)

      const params = { prompt: [], mode: { type: 'regular' } }
      await expect(
        middleware.wrapGenerate({ doGenerate, doStream: jest.fn(), params, model: mockGatewayModel }),
      ).rejects.toThrow('ECONNREFUSED')

      expect(mockGoogleDirectModel.doGenerate).not.toHaveBeenCalled()
    })

    it('wrapStream re-throws non-auth errors without falling back', async () => {
      setEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'test-key' })

      const { getModel } = await import('../providers')
      getModel('google')

      const { middleware } = mockWrapLanguageModel.mock.calls[0][0]

      const serverError = new Error('500 Internal Server Error')
      const doStream = jest.fn().mockRejectedValue(serverError)

      const params = { prompt: [], mode: { type: 'regular' } }
      await expect(
        middleware.wrapStream({ doGenerate: jest.fn(), doStream, params, model: mockGatewayModel }),
      ).rejects.toThrow('500 Internal Server Error')

      expect(mockGoogleDirectModel.doStream).not.toHaveBeenCalled()
    })
  })
})
