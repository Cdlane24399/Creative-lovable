/**
 * Token Usage Service
 *
 * Business logic layer for token usage tracking and cost calculation.
 * Coordinates between repository and provides cost analysis functionality.
 *
 * Responsibilities:
 * - Records token usage with automatic cost calculation
 * - Provides aggregated usage statistics
 * - Manages cost calculations based on model rates
 */

import {
  getTokenUsageRepository,
  type TokenUsageQueryOptions,
  type TokenUsageStats,
} from "@/lib/db/repositories/token-usage.repository"
import type { TokenUsageInsert } from "@/lib/db/types"
import { logger } from "@/lib/logger"

// =============================================================================
// Cost Rates Configuration
// =============================================================================

/**
 * Cost rates per 1M tokens in USD
 * These are approximate rates and should be updated as pricing changes
 */
const COST_RATES: Record<string, { input: number; output: number }> = {
  // Anthropic Claude models
  "claude": { input: 3.0, output: 15.0 },
  "claude-3": { input: 3.0, output: 15.0 },
  "claude-3-opus": { input: 15.0, output: 75.0 },
  "claude-3-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku": { input: 0.25, output: 1.25 },

  // OpenAI GPT models
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4o": { input: 5.0, output: 15.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },

  // Google Gemini models
  "gemini": { input: 0.35, output: 1.05 },
  "gemini-pro": { input: 0.5, output: 1.5 },
  "gemini-ultra": { input: 1.5, output: 4.5 },
  "gemini-1.5-pro": { input: 3.5, output: 10.5 },
  "gemini-1.5-flash": { input: 0.35, output: 1.05 },
}

/**
 * Model name mappings for cost calculation
 * Maps model identifiers to their rate keys
 */
const MODEL_MAPPINGS: Record<string, string> = {
  // Anthropic
  "anthropic": "claude",
  "claude": "claude",
  "claude-3-opus-20240229": "claude-3-opus",
  "claude-3-sonnet-20240229": "claude-3-sonnet",
  "claude-3-haiku-20240307": "claude-3-haiku",
  "claude-3-5-sonnet-20240620": "claude-3-5-sonnet",
  "claude-3-5-sonnet-20241022": "claude-3-5-sonnet",
  "claude-3-5-haiku-20241022": "claude-3-5-haiku",

  // OpenAI
  "openai": "gpt-4o",
  "gpt-4": "gpt-4",
  "gpt-4-turbo-preview": "gpt-4-turbo",
  "gpt-4-0125-preview": "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09": "gpt-4-turbo",
  "gpt-4o": "gpt-4o",
  "gpt-4o-2024-05-13": "gpt-4o",
  "gpt-4o-2024-08-06": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18": "gpt-4o-mini",
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125": "gpt-3.5-turbo",

  // Google
  "google": "gemini",
  "gemini": "gemini",
  "gemini-pro": "gemini-pro",
  "gemini-ultra": "gemini-ultra",
  "gemini-1.5-pro": "gemini-1.5-pro",
  "gemini-1.5-pro-latest": "gemini-1.5-pro",
  "gemini-1.5-flash": "gemini-1.5-flash",
  "gemini-1.5-flash-latest": "gemini-1.5-flash",
}

// =============================================================================
// Service Implementation
// =============================================================================

export class TokenUsageService {
  private readonly tokenUsageRepo = getTokenUsageRepository()

  /**
   * Calculate cost in USD based on model and token counts
   */
  private calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    // Normalize model name
    const normalizedModel = model.toLowerCase().trim()

    // Get rate key from mapping or use normalized model
    const rateKey = MODEL_MAPPINGS[normalizedModel] || normalizedModel

    // Get rates for the model
    const rates = COST_RATES[rateKey]

    if (!rates) {
      // Log unknown model for monitoring
      logger.warn(`Unknown model for cost calculation: ${model}`, {
        model,
        normalizedModel,
        rateKey,
      })
      return 0
    }

    // Calculate cost per million tokens
    const inputCost = (promptTokens / 1_000_000) * rates.input
    const outputCost = (completionTokens / 1_000_000) * rates.output

    return Number((inputCost + outputCost).toFixed(6))
  }

  /**
   * Record token usage with automatic cost calculation
   *
   * @param data - Token usage data (cost_usd is optional, will be calculated if not provided)
   * @returns The created token usage record
   */
  async recordTokenUsage(
    data: Omit<TokenUsageInsert, "cost_usd"> & { cost_usd?: number }
  ): Promise<{
    id: string
    project_id: string
    model: string
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    cost_usd: number | null
    timestamp: string
  }> {
    // Calculate cost if not provided
    const costUsd =
      data.cost_usd ??
      this.calculateCost(data.model, data.prompt_tokens, data.completion_tokens)

    const record = await this.tokenUsageRepo.recordUsage({
      ...data,
      cost_usd: costUsd,
    })

    logger.debug("Token usage recorded", {
      projectId: record.project_id,
      model: record.model,
      tokens: record.total_tokens,
      costUsd: record.cost_usd,
    })

    return record
  }

  /**
   * Get project usage statistics with optional date filtering
   *
   * @param projectId - The project ID
   * @param options - Query options including date range
   * @returns Aggregated usage statistics
   */
  async getProjectUsageStats(
    projectId: string,
    options: Omit<TokenUsageQueryOptions, "limit" | "offset"> = {}
  ): Promise<TokenUsageStats> {
    return this.tokenUsageRepo.getTotalUsageByProject(projectId, options)
  }

  /**
   * Get detailed token usage records for a project
   *
   * @param projectId - The project ID
   * @param options - Query options including date range and pagination
   * @returns Array of token usage records
   */
  async getProjectUsageDetails(
    projectId: string,
    options: TokenUsageQueryOptions = {}
  ): Promise<
    Array<{
      id: string
      project_id: string
      model: string
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
      step_number: number | null
      cost_usd: number | null
      timestamp: string
    }>
  > {
    return this.tokenUsageRepo.getUsageByProject(projectId, options)
  }

  /**
   * Get usage summary for multiple projects
   *
   * @param projectIds - Array of project IDs
   * @returns Map of project ID to usage stats
   */
  async getMultiProjectSummary(
    projectIds: string[]
  ): Promise<Map<string, TokenUsageStats>> {
    const results = new Map<string, TokenUsageStats>()

    await Promise.all(
      projectIds.map(async (projectId) => {
        const stats = await this.getProjectUsageStats(projectId)
        results.set(projectId, stats)
      })
    )

    return results
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let tokenUsageService: TokenUsageService | null = null

export function getTokenUsageService(): TokenUsageService {
  if (!tokenUsageService) {
    tokenUsageService = new TokenUsageService()
  }
  return tokenUsageService
}

export function resetTokenUsageService(): void {
  tokenUsageService = null
}
