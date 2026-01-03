/**
 * Message Repository
 * 
 * Handles all database operations for the messages table.
 * Uses Supabase Client.
 */

import { BaseRepository, generateId, parseJsonSafe, toJsonString } from "./base.repository"
import type { Message, MessagePart } from "../types"

// =============================================================================
// Types
// =============================================================================

export interface CreateMessageData {
  projectId: string
  role: "user" | "assistant" | "system"
  content: string
  parts?: MessagePart[]
  model?: string
}

export interface MessageQueryOptions {
  limit?: number
  offset?: number
  orderDir?: "ASC" | "DESC"
}

export interface MessageBatch {
  projectId: string
  messages: Array<{
    id?: string
    role: "user" | "assistant" | "system"
    content: string
    parts?: MessagePart[]
    model?: string
  }>
}

// =============================================================================
// Repository Implementation
// =============================================================================

export class MessageRepository extends BaseRepository<Message> {
  constructor() {
    super("messages")
  }

  private transformRow(row: any): Message {
    return {
      ...row,
      parts: parseJsonSafe<MessagePart[] | null>(row.parts, null),
    }
  }

  async findById(id: string): Promise<Message | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client.from(this.tableName).select('*').eq('id', id).single()
      if (error) {
          if (error.code === 'PGRST116') return null
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
      const { count, error } = await client.from(this.tableName).select('*', { count: 'exact', head: true }).eq('id', id)
      if (error) throw error
      return (count ?? 0) > 0
    } catch (error) {
      this.handleError(error, "exists")
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const { error } = await client.from(this.tableName).delete().eq('id', id)
      if (error) throw error
      return true
    } catch (error) {
      this.handleError(error, "delete")
    }
  }

  async count(): Promise<number> {
    try {
      const client = await this.getClient()
      const { count, error } = await client.from(this.tableName).select('*', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    } catch (error) {
      this.handleError(error, "count")
    }
  }

  async findByProjectId(
    projectId: string,
    options: MessageQueryOptions = {}
  ): Promise<Message[]> {
    try {
      const client = await this.getClient()
      let query = client.from(this.tableName).select('*').eq('project_id', projectId)
      
      const orderBy = "created_at"
      const ascending = options.orderDir !== "DESC" // Default ASC
      query = query.order(orderBy, { ascending })

      if (options.limit) query = query.limit(options.limit)
      if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 1000) - 1)

      const { data, error } = await query
      if (error) throw error
      return data.map(row => this.transformRow(row))
    } catch (error) {
      this.handleError(error, "findByProjectId")
    }
  }

  async findRecentByProjectId(
    projectId: string, 
    count: number = 10
  ): Promise<Message[]> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(count)

      if (error) throw error
      // Reverse to get chronological order
      return data.reverse().map(row => this.transformRow(row))
    } catch (error) {
      this.handleError(error, "findRecentByProjectId")
    }
  }

  async create(data: CreateMessageData): Promise<Message> {
    try {
      const id = generateId()
      const client = await this.getClient()
      
      const { data: result, error } = await client.from(this.tableName).insert({
          id,
          project_id: data.projectId,
          role: data.role,
          content: data.content,
          parts: data.parts ? data.parts : null, // Supabase handles JSON
          model: data.model || null
      }).select().single()

      if (error) throw error
      return this.transformRow(result)
    } catch (error) {
      this.handleError(error, "create")
    }
  }

  async createBatch(batch: MessageBatch): Promise<Message[]> {
    if (batch.messages.length === 0) return []
    try {
      const client = await this.getClient()
      const rows = batch.messages.map(msg => ({
          // Always generate proper UUID - AI SDK IDs are not valid UUIDs
          id: generateId(),
          project_id: batch.projectId,
          role: msg.role,
          content: msg.content,
          parts: msg.parts ? msg.parts : null,
          model: msg.model || null
      }))

      const { data, error } = await client.from(this.tableName).upsert(rows, { onConflict: 'id' }).select()
      if (error) throw error
      return data.map(row => this.transformRow(row))
    } catch (error) {
      this.handleError(error, "createBatch")
    }
  }

  async saveConversation(
    projectId: string, 
    messages: Array<{
      id?: string
      role: "user" | "assistant" | "system"
      content?: string
      parts?: MessagePart[]
      model?: string
    }>
  ): Promise<Message[]> {
    try {
      const client = await this.getClient()
      
      // Delete existing
      await client.from(this.tableName).delete().eq('project_id', projectId)

      if (messages.length === 0) return []

      const rows = messages.map(msg => {
          const content = msg.content ||
            msg.parts?.filter(p => p.type === "text").map(p => p.text).join("") || ""

          return {
            // Always generate proper UUID - AI SDK IDs are not valid UUIDs
            id: generateId(),
            project_id: projectId,
            role: msg.role,
            content,
            parts: msg.parts ? msg.parts : null,
            model: msg.model || null
          }
      })

      const { data, error } = await client.from(this.tableName).insert(rows).select()
      if (error) throw error
      return data.map(row => this.transformRow(row))
    } catch (error) {
      this.handleError(error, "saveConversation")
    }
  }

  async appendMessage(
    projectId: string,
    message: {
      id?: string
      role: "user" | "assistant" | "system"
      content: string
      parts?: MessagePart[]
      model?: string
    }
  ): Promise<Message> {
    return this.create({
      projectId,
      role: message.role,
      content: message.content,
      parts: message.parts,
      model: message.model,
    })
  }

  async updateContent(
    id: string,
    content: string,
    parts?: MessagePart[]
  ): Promise<Message | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .update({ 
            content, 
            parts: parts ? parts : null 
        })
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
          if (error.code === 'PGRST116') return null
          throw error
      }
      return this.transformRow(data)
    } catch (error) {
      this.handleError(error, "updateContent")
    }
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    try {
        const client = await this.getClient()
        // Delete returns null data usually unless select() is called
        // But we want count.
        // Actually Supabase delete doesn't return count easily unless we select.
        // We can just delete.
        const { count, error } = await client.from(this.tableName).delete({ count: 'exact' }).eq('project_id', projectId)
        if (error) throw error
        return count ?? 0
    } catch (error) {
        this.handleError(error, "deleteByProjectId")
    }
  }

  async countByProjectId(projectId: string): Promise<number> {
    try {
        const client = await this.getClient()
        const { count, error } = await client.from(this.tableName).select('*', { count: 'exact', head: true }).eq('project_id', projectId)
        if (error) throw error
        return count ?? 0
    } catch (error) {
        this.handleError(error, "countByProjectId")
    }
  }

  async findLastByProjectId(projectId: string): Promise<Message | null> {
    try {
        const client = await this.getClient()
        const { data, error } = await client
            .from(this.tableName)
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
        
        if (error) {
            if (error.code === 'PGRST116') return null
            throw error
        }
        return this.transformRow(data)
    } catch (error) {
        this.handleError(error, "findLastByProjectId")
    }
  }

  async findByRole(
    projectId: string,
    role: "user" | "assistant" | "system"
  ): Promise<Message[]> {
    try {
        const client = await this.getClient()
        const { data, error } = await client
            .from(this.tableName)
            .select('*')
            .eq('project_id', projectId)
            .eq('role', role)
            .order('created_at', { ascending: true })
        
        if (error) throw error
        return data.map(row => this.transformRow(row))
    } catch (error) {
        this.handleError(error, "findByRole")
    }
  }
}

let messageRepositoryInstance: MessageRepository | null = null

export function getMessageRepository(): MessageRepository {
  if (!messageRepositoryInstance) {
    messageRepositoryInstance = new MessageRepository()
  }
  return messageRepositoryInstance
}
