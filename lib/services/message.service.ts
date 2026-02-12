/**
 * Message Service
 * 
 * Business logic layer for message operations.
 * Implements AI SDK v6 best practices for message persistence.
 * 
 * Key Features:
 * - Server-side message ID generation
 * - Proper UIMessage format storage
 * - Conversation save/load with caching
 * - Message validation support
 */

import {
  getMessageRepository,
  type CreateMessageData,
  type MessageQueryOptions,
} from "@/lib/db/repositories"
import { messagesCache } from "@/lib/cache"
import type { Message, MessagePart } from "@/lib/db/types"

// =============================================================================
// Types (AI SDK v6 Compatible)
// =============================================================================

/**
 * UIMessage format from AI SDK v6
 * This is what we receive from useChat and should store
 * 
 * Note: AI SDK v6 UIMessage uses 'parts' array instead of 'content' string
 */
export interface UIMessage {
  id?: string
  role: "user" | "assistant" | "system"
  content?: string
  parts: MessagePart[]
  createdAt?: Date
  metadata?: Record<string, unknown>
}

/**
 * UIMessage part types (AI SDK v6)
 */
export type UIMessagePart =
  | { type: "text"; text: string }
  | {
      type: "tool-invocation"
      toolInvocationId: string
      toolName: string
      args: unknown
    }
  | { type: "tool-result"; toolInvocationId: string; result: unknown }

/**
 * Message for saving (from AI SDK stream completion)
 * More flexible than UIMessage - allows optional parts and content
 */
export interface MessageToSave {
  id?: string
  role: "user" | "assistant" | "system"
  content?: string // Optional, extracted from parts if not provided
  parts?: MessagePart[]
  model?: string
}

// =============================================================================
// Service Implementation
// =============================================================================

export class MessageService {
  private readonly messageRepo = getMessageRepository()

  private isTextPart(
    part: MessagePart
  ): part is MessagePart & { type: "text"; text: string } {
    return part.type === "text" && typeof part.text === "string"
  }

  private buildPersistedMessage(message: MessageToSave): {
    id?: string
    role: "user" | "assistant" | "system"
    content: string
    parts?: MessagePart[]
    model?: string
  } {
    return {
      id: message.id,
      role: message.role,
      content: message.content ?? this.extractTextFromParts(message.parts),
      parts: message.parts,
      model: message.model,
    }
  }

  private buildCreateMessageData(
    projectId: string,
    message: MessageToSave
  ): CreateMessageData {
    const persistedMessage = this.buildPersistedMessage(message)
    return {
      projectId,
      role: persistedMessage.role,
      content: persistedMessage.content,
      parts: persistedMessage.parts,
      model: persistedMessage.model,
    }
  }

  private partsEqual(
    left: MessagePart[] | null | undefined,
    right: MessagePart[] | undefined,
  ): boolean {
    const normalizedLeft = left ?? []
    const normalizedRight = right ?? []
    return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight)
  }

  private isEquivalentMessage(
    dbMessage: Message,
    persisted: {
      role: "user" | "assistant" | "system"
      content: string
      parts?: MessagePart[]
      model?: string
    },
  ): boolean {
    return (
      dbMessage.role === persisted.role &&
      dbMessage.content === persisted.content &&
      this.partsEqual(dbMessage.parts, persisted.parts)
    )
  }

  /**
   * Get all messages for a project
   * Uses cache when available
   */
  async getMessages(
    projectId: string,
    options: MessageQueryOptions = {}
  ): Promise<Message[]> {
    // Try cache first (only for default options)
    if (!options.limit && !options.offset) {
      const cached = await messagesCache.get(projectId)
      if (cached) {
        return cached as Message[]
      }
    }

    // Fetch from database
    const messages = await this.messageRepo.findByProjectId(projectId, options)

    // Cache if default options
    if (!options.limit && !options.offset) {
      await messagesCache.set(projectId, messages)
    }

    return messages
  }

  /**
   * Get recent messages (for context window)
   */
  async getRecentMessages(projectId: string, count: number = 20): Promise<Message[]> {
    return this.messageRepo.findRecentByProjectId(projectId, count)
  }

  /**
   * Save a single message
   * Used for appending user or assistant messages
   */
  async saveMessage(
    projectId: string,
    message: MessageToSave
  ): Promise<Message> {
    const saved = await this.messageRepo.create(
      this.buildCreateMessageData(projectId, message)
    )

    // Invalidate cache
    await messagesCache.invalidate(projectId)

    return saved
  }

  /**
   * Save complete conversation (from AI SDK onFinish callback)
   * This is the recommended way to persist messages per AI SDK v6
   * 
   * @param projectId - Project ID
   * @param messages - Complete message array from onFinish
   */
  async saveConversation(
    projectId: string,
    messages: MessageToSave[]
  ): Promise<Message[]> {
    if (messages.length === 0) {
      return []
    }

    const persistedMessages = messages.map((message) =>
      this.buildPersistedMessage(message),
    )

    const rewriteConversation = async (): Promise<Message[]> => {
      const saved = await this.messageRepo.saveConversation(
        projectId,
        persistedMessages,
      )
      await messagesCache.invalidate(projectId)
      await messagesCache.set(projectId, saved)
      return saved
    }

    try {
      const existingCount = await this.messageRepo.countByProjectId(projectId)

      if (existingCount > persistedMessages.length) {
        return rewriteConversation()
      }

      if (existingCount > 0) {
        const recent = await this.messageRepo.findRecentByProjectId(projectId, 1)
        const lastExisting = recent[0]
        const matchingIncoming = persistedMessages[existingCount - 1]

        if (
          !lastExisting ||
          !matchingIncoming ||
          !this.isEquivalentMessage(lastExisting, matchingIncoming)
        ) {
          return rewriteConversation()
        }
      }

      if (existingCount === persistedMessages.length) {
        const existingMessages = await this.messageRepo.findByProjectId(projectId)
        await messagesCache.set(projectId, existingMessages)
        return existingMessages
      }

      const newMessages = persistedMessages.slice(existingCount)
      await this.messageRepo.createBatch({
        projectId,
        messages: newMessages,
      })

      const saved = await this.messageRepo.findByProjectId(projectId)
      await messagesCache.invalidate(projectId)
      await messagesCache.set(projectId, saved)
      return saved
    } catch {
      // Fallback to full rewrite for correctness if incremental path fails.
      return rewriteConversation()
    }
  }

  /**
   * Append messages to conversation (incremental save)
   * More efficient when adding messages to existing conversation
   */
  async appendMessages(
    projectId: string,
    messages: MessageToSave[]
  ): Promise<Message[]> {
    if (messages.length === 0) {
      return []
    }

    const saved = await this.messageRepo.createBatch({
      projectId,
      messages: messages.map((message) => this.buildPersistedMessage(message)),
    })

    // Invalidate cache
    await messagesCache.invalidate(projectId)

    return saved
  }

  /**
   * Convert stored messages to UIMessage format for useChat
   * This ensures compatibility with AI SDK v6 client-side
   */
  toUIMessages(messages: Message[]): UIMessage[] {
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: m.parts || [{ type: "text", text: m.content }],
      createdAt: new Date(m.created_at),
    }))
  }

  /**
   * Prepare messages for model (extract text content)
   * Useful when you need plain text messages for AI
   */
  toModelMessages(
    messages: Message[]
  ): Array<{ role: string; content: string }> {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))
  }

  /**
   * Get message count for a project
   */
  async getMessageCount(projectId: string): Promise<number> {
    return this.messageRepo.countByProjectId(projectId)
  }

  /**
   * Get the last message (for context or display)
   */
  async getLastMessage(projectId: string): Promise<Message | null> {
    return this.messageRepo.findLastByProjectId(projectId)
  }

  /**
   * Delete all messages for a project
   */
  async deleteMessages(projectId: string): Promise<number> {
    const count = await this.messageRepo.deleteByProjectId(projectId)
    await messagesCache.invalidate(projectId)
    return count
  }

  /**
   * Filter messages by role
   */
  async getMessagesByRole(
    projectId: string,
    role: "user" | "assistant" | "system"
  ): Promise<Message[]> {
    return this.messageRepo.findByRole(projectId, role)
  }

  /**
   * Utility: Extract text content from UIMessage parts
   */
  extractTextFromParts(parts: MessagePart[] | undefined): string {
    if (!parts || parts.length === 0) {
      return ""
    }
    return parts
      .filter((p) => this.isTextPart(p))
      .map((p) => p.text)
      .join("")
  }

  /**
   * Utility: Convert UIMessage to database format
   */
  toDatabaseFormat(message: MessageToSave, projectId: string = ""): CreateMessageData {
    return this.buildCreateMessageData(projectId, message)
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let messageServiceInstance: MessageService | null = null

/**
 * Get the singleton MessageService instance
 */
export function getMessageService(): MessageService {
  if (!messageServiceInstance) {
    messageServiceInstance = new MessageService()
  }
  return messageServiceInstance
}
