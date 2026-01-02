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
 */
export interface UIMessage {
  id: string
  role: "user" | "assistant" | "system"
  content?: string
  parts?: MessagePart[]
  createdAt?: Date
  metadata?: Record<string, unknown>
}

/**
 * Message for saving (from AI stream completion)
 */
export interface MessageToSave {
  id?: string
  role: "user" | "assistant" | "system"
  content?: string
  parts?: MessagePart[]
  model?: string
}

// =============================================================================
// Service Implementation
// =============================================================================

export class MessageService {
  private readonly messageRepo = getMessageRepository()

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
    // Extract content from parts if not provided
    const content = message.content ||
      message.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("") ||
      ""

    const saved = await this.messageRepo.create({
      projectId,
      role: message.role,
      content,
      parts: message.parts,
      model: message.model,
    })

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

    // Save all messages (replaces existing)
    const saved = await this.messageRepo.saveConversation(
      projectId,
      messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        parts: m.parts,
        model: m.model,
      }))
    )

    // Invalidate and update cache
    await messagesCache.invalidate(projectId)
    await messagesCache.set(projectId, saved)

    return saved
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
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content:
          m.content ||
          m.parts
            ?.filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("") ||
          "",
        parts: m.parts,
        model: m.model,
      })),
    })

    // Invalidate cache
    await messagesCache.invalidate(projectId)

    return saved
  }

  /**
   * Convert stored messages to UIMessage format for useChat
   */
  toUIMessages(messages: Message[]): UIMessage[] {
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: m.parts || undefined,
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
