/**
 * Message Repository
 * 
 * Handles all database operations for the messages table.
 * Implements AI SDK v6 best practices for message persistence:
 * - Stores messages in UIMessage format
 * - Server-side ID generation for consistency
 * - Proper parts serialization
 * 
 * Features:
 * - CRUD operations for messages
 * - Batch operations for efficient saves
 * - Message pagination for large conversations
 * - Proper type conversions for JSONB parts field
 */

import { BaseRepository, generateId, parseJsonSafe, toJsonString } from "./base.repository"
import type { Message, MessagePart } from "../types"
import { DatabaseError } from "@/lib/errors"

// =============================================================================
// Types
// =============================================================================

/**
 * Message row as returned from database
 */
interface MessageRow {
  id: string
  project_id: string
  role: "user" | "assistant" | "system"
  content: string
  parts: string | MessagePart[] | null
  model: string | null
  created_at: string
}

/**
 * Data for creating a new message
 */
export interface CreateMessageData {
  projectId: string
  role: "user" | "assistant" | "system"
  content: string
  parts?: MessagePart[]
  model?: string
}

/**
 * Options for querying messages
 */
export interface MessageQueryOptions {
  limit?: number
  offset?: number
  orderDir?: "ASC" | "DESC"
}

/**
 * Batch of messages to save (for efficient multi-message saves)
 */
export interface MessageBatch {
  projectId: string
  messages: Array<{
    id?: string  // Optional - server generates if not provided
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

  /**
   * Transform database row to Message type
   * Handles JSONB parts field parsing
   */
  private transformRow(row: MessageRow): Message {
    return {
      ...row,
      parts: parseJsonSafe<MessagePart[] | null>(row.parts, null),
    }
  }

  /**
   * Find message by ID
   */
  async findById(id: string): Promise<Message | null> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT * FROM messages
        WHERE id = ${id}
        LIMIT 1
      ` as unknown as MessageRow[]

      if (result.length === 0) {
        return null
      }

      return this.transformRow(result[0])
    }, "findById")
  }

  /**
   * Check if message exists
   */
  async exists(id: string): Promise<boolean> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT 1 FROM messages
        WHERE id = ${id}
        LIMIT 1
      ` as unknown as { "?column?"?: number }[]

      return result.length > 0
    }, "exists")
  }

  /**
   * Delete message by ID
   */
  async delete(id: string): Promise<boolean> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        DELETE FROM messages
        WHERE id = ${id}
        RETURNING id
      ` as unknown as { id: string }[]

      return result.length > 0
    }, "delete")
  }

  /**
   * Count all messages
   */
  async count(): Promise<number> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT COUNT(*) as count FROM messages
      ` as unknown as { count: string }[]

      return parseInt(result[0]?.count || "0", 10)
    }, "count")
  }

  /**
   * Find all messages for a project
   */
  async findByProjectId(
    projectId: string,
    options: MessageQueryOptions = {}
  ): Promise<Message[]> {
    const { 
      limit = 1000, 
      offset = 0, 
      orderDir = "ASC" 
    } = options

    return this.executeQuery(async (sql) => {
      // Order by created_at to maintain conversation flow
      // ASC = oldest first (natural conversation order)
      let result: MessageRow[]

      if (orderDir === "DESC") {
        result = await sql`
          SELECT * FROM messages
          WHERE project_id = ${projectId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        ` as unknown as MessageRow[]
      } else {
        result = await sql`
          SELECT * FROM messages
          WHERE project_id = ${projectId}
          ORDER BY created_at ASC
          LIMIT ${limit} OFFSET ${offset}
        ` as unknown as MessageRow[]
      }

      return result.map(row => this.transformRow(row))
    }, "findByProjectId")
  }

  /**
   * Find the most recent messages for a project
   * Useful for getting recent context without loading full history
   */
  async findRecentByProjectId(
    projectId: string, 
    count: number = 10
  ): Promise<Message[]> {
    return this.executeQuery(async (sql) => {
      // Get most recent messages, then reverse to maintain order
      const result = await sql`
        SELECT * FROM messages
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
        LIMIT ${count}
      ` as unknown as MessageRow[]

      // Reverse to get chronological order
      return result.reverse().map(row => this.transformRow(row))
    }, "findRecentByProjectId")
  }

  /**
   * Create a single message with server-side ID generation
   * Following AI SDK v6 best practice for persistence
   */
  async create(data: CreateMessageData): Promise<Message> {
    const id = generateId() // Server-side ID generation

    return this.executeQuery(async (sql) => {
      const result = await sql`
        INSERT INTO messages (
          id, 
          project_id, 
          role, 
          content, 
          parts, 
          model
        )
        VALUES (
          ${id}, 
          ${data.projectId}, 
          ${data.role}, 
          ${data.content}, 
          ${data.parts ? toJsonString(data.parts) : null}, 
          ${data.model || null}
        )
        RETURNING *
      ` as unknown as MessageRow[]

      return this.transformRow(result[0])
    }, "create")
  }

  /**
   * Create multiple messages in a batch
   * More efficient than individual inserts for saving conversation history
   */
  async createBatch(batch: MessageBatch): Promise<Message[]> {
    if (batch.messages.length === 0) {
      return []
    }

    return this.executeQuery(async (sql) => {
      const createdMessages: Message[] = []

      // Insert messages sequentially to maintain order
      // (Parallel insert would lose ordering)
      for (const msg of batch.messages) {
        const id = msg.id || generateId()
        
        const result = await sql`
          INSERT INTO messages (
            id, 
            project_id, 
            role, 
            content, 
            parts, 
            model
          )
          VALUES (
            ${id}, 
            ${batch.projectId}, 
            ${msg.role}, 
            ${msg.content}, 
            ${msg.parts ? toJsonString(msg.parts) : null}, 
            ${msg.model || null}
          )
          RETURNING *
        ` as unknown as MessageRow[]

        createdMessages.push(this.transformRow(result[0]))
      }

      return createdMessages
    }, "createBatch")
  }

  /**
   * Save conversation messages (replaces all messages for a project)
   * Used when syncing full conversation state from client
   * 
   * @param projectId - Project ID
   * @param messages - Array of UIMessage objects
   * @returns Created messages
   */
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
    return this.executeQuery(async (sql) => {
      // Delete existing messages for this project
      await sql`DELETE FROM messages WHERE project_id = ${projectId}`

      if (messages.length === 0) {
        return []
      }

      // Insert new messages
      const createdMessages: Message[] = []

      for (const msg of messages) {
        const id = msg.id || generateId()
        
        // Extract content from parts if not provided directly
        const content = msg.content || 
          msg.parts?.filter(p => p.type === "text")
            .map(p => p.text)
            .join("") || 
          ""

        const result = await sql`
          INSERT INTO messages (
            id, 
            project_id, 
            role, 
            content, 
            parts, 
            model
          )
          VALUES (
            ${id}, 
            ${projectId}, 
            ${msg.role}, 
            ${content}, 
            ${msg.parts ? toJsonString(msg.parts) : null}, 
            ${msg.model || null}
          )
          RETURNING *
        ` as unknown as MessageRow[]

        createdMessages.push(this.transformRow(result[0]))
      }

      return createdMessages
    }, "saveConversation")
  }

  /**
   * Append a message to a conversation
   * Used for streaming completions where we add the assistant response
   */
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

  /**
   * Update a message's content and parts
   * Used for updating streaming messages or editing
   */
  async updateContent(
    id: string,
    content: string,
    parts?: MessagePart[]
  ): Promise<Message | null> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        UPDATE messages
        SET 
          content = ${content},
          parts = ${parts ? toJsonString(parts) : null}
        WHERE id = ${id}
        RETURNING *
      ` as unknown as MessageRow[]

      if (result.length === 0) {
        return null
      }

      return this.transformRow(result[0])
    }, "updateContent")
  }

  /**
   * Delete all messages for a project
   */
  async deleteByProjectId(projectId: string): Promise<number> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        DELETE FROM messages
        WHERE project_id = ${projectId}
        RETURNING id
      ` as unknown as { id: string }[]

      return result.length
    }, "deleteByProjectId")
  }

  /**
   * Count messages for a project
   */
  async countByProjectId(projectId: string): Promise<number> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT COUNT(*) as count FROM messages
        WHERE project_id = ${projectId}
      ` as unknown as { count: string }[]

      return parseInt(result[0]?.count || "0", 10)
    }, "countByProjectId")
  }

  /**
   * Get the last message for a project
   */
  async findLastByProjectId(projectId: string): Promise<Message | null> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT * FROM messages
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC
        LIMIT 1
      ` as unknown as MessageRow[]

      if (result.length === 0) {
        return null
      }

      return this.transformRow(result[0])
    }, "findLastByProjectId")
  }

  /**
   * Find messages by role for a project
   * Useful for extracting just user or assistant messages
   */
  async findByRole(
    projectId: string,
    role: "user" | "assistant" | "system"
  ): Promise<Message[]> {
    return this.executeQuery(async (sql) => {
      const result = await sql`
        SELECT * FROM messages
        WHERE project_id = ${projectId}
        AND role = ${role}
        ORDER BY created_at ASC
      ` as unknown as MessageRow[]

      return result.map(row => this.transformRow(row))
    }, "findByRole")
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let messageRepositoryInstance: MessageRepository | null = null

/**
 * Get the singleton MessageRepository instance
 */
export function getMessageRepository(): MessageRepository {
  if (!messageRepositoryInstance) {
    messageRepositoryInstance = new MessageRepository()
  }
  return messageRepositoryInstance
}
