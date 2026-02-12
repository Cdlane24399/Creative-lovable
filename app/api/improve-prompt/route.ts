import { generateText } from "ai"
import { withAuth } from "@/lib/auth"
import { asyncErrorHandler } from "@/lib/errors"
import {
  getModel,
  getGatewayProviderOptions,
  getOpenRouterModel,
  hasOpenRouterFallback,
} from "@/lib/ai/providers"
import { improvePromptSchema, createValidationErrorResponse, ValidationError as ZodValidationError } from "@/lib/validations"
import { logger } from "@/lib/logger"

export const maxDuration = 30

const PROMPT_IMPROVER_SYSTEM = `Rewrite the user's web app prompt to be clearer and more implementation-ready.
- Keep the original intent.
- Add concrete UI structure, interactions, and key components.
- Keep it concise: 2-3 sentences, plain language.
- Return only the improved prompt text.`

const IMPROVE_PROMPT_CACHE_TTL_MS = 10 * 60 * 1000
const IMPROVE_PROMPT_CACHE_MAX_ENTRIES = 200
const improvePromptCache = new Map<
  string,
  { value: string; expiresAt: number }
>()

function normalizePromptCacheKey(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ").toLowerCase()
}

function getCachedImprovedPrompt(prompt: string): string | null {
  const key = normalizePromptCacheKey(prompt)
  const entry = improvePromptCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    improvePromptCache.delete(key)
    return null
  }
  return entry.value
}

function cacheImprovedPrompt(prompt: string, improved: string): void {
  const key = normalizePromptCacheKey(prompt)
  improvePromptCache.set(key, {
    value: improved,
    expiresAt: Date.now() + IMPROVE_PROMPT_CACHE_TTL_MS,
  })

  if (improvePromptCache.size <= IMPROVE_PROMPT_CACHE_MAX_ENTRIES) {
    return
  }

  // Drop oldest entry.
  const oldestKey = improvePromptCache.keys().next().value
  if (oldestKey) {
    improvePromptCache.delete(oldestKey)
  }
}

export const POST = withAuth(asyncErrorHandler(async (req: Request) => {
  const requestId = req.headers.get('x-request-id') ?? 'unknown'
  const log = logger.child({ requestId, operation: 'improve-prompt' })
  
  const body = await req.json()
  
  // Validate with Zod schema
  const validation = improvePromptSchema.safeParse(body)
  if (!validation.success) {
    return createValidationErrorResponse(
      new ZodValidationError('Invalid improve-prompt request', validation.error.issues)
    )
  }
  
  const { prompt } = validation.data
  log.info('Improving prompt', { promptLength: prompt.length })

  const cached = getCachedImprovedPrompt(prompt)
  if (cached) {
    return Response.json({ improvedPrompt: cached })
  }

  let result: Awaited<ReturnType<typeof generateText>>
  try {
    result = await generateText({
      model: getModel('google'),
      providerOptions: getGatewayProviderOptions('google'),
      system: PROMPT_IMPROVER_SYSTEM,
      prompt: prompt,
      maxOutputTokens: 180,
    })
  } catch (gatewayError) {
    if (!hasOpenRouterFallback()) {
      throw gatewayError
    }

    log.warn('Gateway failed, retrying improve-prompt with OpenRouter fallback', {
      error:
        gatewayError instanceof Error
          ? gatewayError.message
          : String(gatewayError),
    })

    result = await generateText({
      model: getOpenRouterModel('google'),
      system: PROMPT_IMPROVER_SYSTEM,
      prompt: prompt,
      maxOutputTokens: 180,
    })
  }

  const improvedPrompt = result.text.trim()
  cacheImprovedPrompt(prompt, improvedPrompt)
  return Response.json({ improvedPrompt })
}))
