/**
 * Token Usage Repository
 *
 * Handles all database operations for the token_usage table.
 * Tracks AI token consumption per project for cost management and analytics.
 */

import { BaseRepository, generateId } from "./base.repository"
import type { TokenUsage, TokenUsageInsert } from "../types"

// =============================================================================
// Types
// =============================================================================

export interface TokenUsageQueryOptions {
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

export interface TokenUsageStats {
  total_prompt_tokens: number
  total_completion_tokens: number
  total_tokens: number
  total_cost_usd: number
  record_count: number
}

// =============================================================================
// Repository Implementation
// =============================================================================

export class TokenUsageRepository extends BaseRepository<TokenUsage> {
  constructor() {
    super("token_usage")
  }

  private transformRow(row: any): TokenUsage {
    return {
      ...row,
      prompt_tokens: Number(row.prompt_tokens),
      completion_tokens: Number(row.completion_tokens),
      total_tokens: Number(row.total_tokens),
      cost_usd: row.cost_usd ? Number(row.cost_usd) : null,
      created_at: row.timestamp || row.created_at,
    }
  }

  async findById(id: string): Promise<TokenUsage | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select("*")
        .eq("id", id)
        .single()
      if (error) {
        if (error.code === "PGRST116") return null
        throw error
      }
      return this.transformRow(data)
    } catch (error) {
      this.handleError(error, "findById")
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { count, error } = await client
        .from(this.tableName)
        .select("*", { count: "exact", head: true })
        .eq("id", id)
      if (error) throw error
      return (count ?? 0) > 0
    } catch (error) {
      this.handleError(error, "exists")
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { error } = await client.from(this.tableName).delete().eq("id", id)
      if (error) throw error
      return true
    } catch (error) {
      this.handleError(error, "delete")
    }
  }

  async count(): Promise<number> {
    try {
      const client = await this.getClient()
      const { count, error } = await client
        .from(this.tableName)
        .select("*", { count: "exact", head: true })
      if (error) throw error
      return count ?? 0
    } catch (error) {
      this.handleError(error, "count")
    }
  }

  /**
   * Record token usage for a project
   */
  async recordUsage(data: TokenUsageInsert): Promise<TokenUsage> {
    try {
      const id = generateId()
      const client = await this.getClient()

      const { data: result, error } = await client
        .from(this.tableName)
        .insert({
          id,
          project_id: data.project_id,
          model: data.model,
          prompt_tokens: data.prompt_tokens,
          completion_tokens: data.completion_tokens,
          total_tokens: data.total_tokens,
          step_number: data.step_number ?? null,
          cost_usd: data.cost_usd ?? null,
          timestamp: data.timestamp ?? new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      return this.transformRow(result)
    } catch (error) {
      this.handleError(error, "recordUsage")
    }
  }

  /**
   * Get token usage records for a project with optional date filtering
   */
  async getUsageByProject(
    projectId: string,
    options: TokenUsageQueryOptions = {}
  ): Promise<TokenUsage[]> {
    try {
      const client = await this.getClient()
      let query = client
        .from(this.tableName)
        .select("*")
        .eq("project_id", projectId)

      // Apply date filters
      if (options.startDate) {
        query = query.gte("timestamp", options.startDate.toISOString())
      }
      if (options.endDate) {
        query = query.lte("timestamp", options.endDate.toISOString())
      }

      // Apply ordering and pagination
      query = query.order("timestamp", { ascending: false })

      if (options.limit) {
        query = query.limit(options.limit)
      }
      if (options.offset) {
        const limit = options.limit || 100
        query = query.range(
          options.offset,
          options.offset + limit - 1
        )
      }

      const { data, error } = await query
      if (error) throw error
      return data.map((row) => this.transformRow(row))
    } catch (error) {
      this.handleError(error, "getUsageByProject")
    }
  }

  /**
   * Get aggregated token usage statistics for a project
   */
  async getTotalUsageByProject(
    projectId: string,
    options: Omit<TokenUsageQueryOptions, "limit" | "offset"> = {}
  ): Promise<TokenUsageStats> {
    try {
      const client = await this.getClient()
      let query = client
        .from(this.tableName)
        .select("*")
        .eq("project_id", projectId)

      // Apply date filters
      if (options.startDate) {
        query = query.gte("timestamp", options.startDate.toISOString())
      }
      if (options.endDate) {
        query = query.lte("timestamp", options.endDate.toISOString())
      }

      const { data, error } = await query
      if (error) throw error

      // Calculate aggregates
      const stats: TokenUsageStats = {
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_tokens: 0,
        total_cost_usd: 0,
        record_count: data.length,
      }

      for (const row of data) {
        stats.total_prompt_tokens += Number(row.prompt_tokens) || 0
        stats.total_completion_tokens += Number(row.completion_tokens) || 0
        stats.total_tokens += Number(row.total_tokens) || 0
        stats.total_cost_usd += row.cost_usd ? Number(row.cost_usd) : 0
      }

      return stats
    } catch (error) {
      this.handleError(error, "getTotalUsageByProject")
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let tokenUsageRepository: TokenUsageRepository | null = null

export function getTokenUsageRepository(): TokenUsageRepository {
  if (!tokenUsageRepository) {
    tokenUsageRepository = new TokenUsageRepository()
  }
  return tokenUsageRepository
}

export function resetTokenUsageRepository(): void {
  tokenUsageRepository = null
}
