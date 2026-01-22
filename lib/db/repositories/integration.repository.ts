import { BaseRepository, BaseEntity } from "./base.repository"
import { DatabaseError } from "@/lib/errors"

export interface Integration extends BaseEntity {
  user_id: string
  provider: string
  access_token?: string
  refresh_token?: string
  expires_at?: string
  scope?: string
  updated_at: string
}

export type CreateIntegrationData = Omit<Integration, "id" | "created_at" | "updated_at">

export class IntegrationRepository extends BaseRepository<Integration> {
  constructor() {
    super("integrations")
  }

  /**
   * Find integration by ID
   */
  async findById(id: string): Promise<Integration | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select("*")
        .eq("id", id)
        .single()

      if (error) {
        if (error.code === "PGRST116") return null // Not found
        throw error
      }

      return data as Integration
    } catch (error) {
      this.handleError(error, "findById")
    }
    return null // Unreachable due to handleError
  }

  /**
   * Find integration by user and provider
   */
  async findByUserAndProvider(userId: string, provider: string): Promise<Integration | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select("*")
        .eq("user_id", userId)
        .eq("provider", provider)
        .single()

      if (error) {
        if (error.code === "PGRST116") return null // Not found
        throw error
      }

      return data as Integration
    } catch (error) {
      this.handleError(error, "findByUserAndProvider")
    }
    return null
  }

  /**
   * Check if integration exists
   */
  async exists(id: string): Promise<boolean> {
    const integration = await this.findById(id)
    return !!integration
  }

  /**
   * Delete integration
   */
  async delete(id: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { error } = await client
        .from(this.tableName)
        .delete()
        .eq("id", id)

      if (error) throw error
      return true
    } catch (error) {
      this.handleError(error, "delete")
    }
    return false
  }

  /**
   * Delete integration by user and provider
   */
  async deleteByUserAndProvider(userId: string, provider: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { error } = await client
        .from(this.tableName)
        .delete()
        .eq("user_id", userId)
        .eq("provider", provider)

      if (error) throw error
      return true
    } catch (error) {
      this.handleError(error, "deleteByUserAndProvider")
    }
    return false
  }

  /**
   * Count total integrations
   */
  async count(): Promise<number> {
    try {
      const client = await this.getClient()
      const { count, error } = await client
        .from(this.tableName)
        .select("*", { count: "exact", head: true })

      if (error) throw error
      return count || 0
    } catch (error) {
      this.handleError(error, "count")
    }
    return 0
  }

  /**
   * Upsert integration (create or update)
   * Note: This method expects encrypted tokens to be passed in
   */
  async upsertIntegration(data: CreateIntegrationData): Promise<Integration> {
    try {
      const client = await this.getClient()

      // Upsert based on user_id and provider (UNIQUE constraint)
      const { data: result, error } = await client
        .from(this.tableName)
        .upsert(
          {
            ...data,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id,provider" }
        )
        .select()
        .single()

      if (error) throw error
      return result as Integration
    } catch (error) {
      this.handleError(error, "upsertIntegration")
    }
    throw new DatabaseError("Failed to upsert integration")
  }
}

// Singleton instance
let integrationRepository: IntegrationRepository | null = null

export function getIntegrationRepository(): IntegrationRepository {
  if (!integrationRepository) {
    integrationRepository = new IntegrationRepository()
  }
  return integrationRepository
}
