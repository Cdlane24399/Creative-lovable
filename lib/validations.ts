/**
 * Zod validation schemas for API routes
 * 
 * These schemas provide runtime validation for API inputs,
 * ensuring type safety and protection against malformed data.
 */

import { z } from 'zod'

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * UUID v4 format validation
 */
export const uuidSchema = z.string().uuid()

/**
 * Project ID validation - allows UUID or simple string IDs
 */
export const projectIdSchema = z.string().min(1).max(100).regex(
  /^[a-zA-Z0-9_-]+$/,
  'Project ID must contain only alphanumeric characters, underscores, and hyphens'
)

/**
 * Model provider enum
 */
export const modelProviderSchema = z.enum(['anthropic', 'openai', 'google']).default('anthropic')

// =============================================================================
// Chat API Schemas (AI SDK v6 UIMessage Format)
// =============================================================================

/**
 * Chat message role enum (legacy - includes 'tool')
 * @deprecated Use uiMessageRoleSchema for AI SDK v6
 */
export const messageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])

/**
 * UIMessage role (AI SDK v6 - excludes 'tool')
 */
export const uiMessageRoleSchema = z.enum(['user', 'assistant', 'system'])

// =============================================================================
// Message Part Schemas (AI SDK v6 Compatible)
// =============================================================================

/**
 * Base part schema - all parts have a type
 */
const basePartSchema = z.object({
  type: z.string(),
})

/**
 * Text part schema - { type: 'text', text: string }
 */
export const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(100000, 'Text content too long'), // 100KB limit
})

/**
 * Tool invocation part schema
 * Note: AI SDK v6 uses flexible typing for tool parts
 */
export const toolInvocationPartSchema = z.object({
  type: z.string().regex(/^tool-/, 'Tool type must start with "tool-"'),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
})

/**
 * Tool result part schema
 */
export const toolResultPartSchema = z.object({
  type: z.string().regex(/^tool-/, 'Tool type must start with "tool-"'),
  toolCallId: z.string(),
  result: z.unknown(),
})

/**
 * Message part schema - discriminated union for AI SDK v6
 * AI SDK v6 uses parts with 'type' as the discriminator
 */
export const messagePartSchema = z.union([
  textPartSchema,
  toolInvocationPartSchema,
  toolResultPartSchema,
  // Allow any other part type for forward compatibility
  z.object({
    type: z.string(),
  }).passthrough(),
])

export type MessagePart = z.infer<typeof messagePartSchema>

// =============================================================================
// Message Schemas
// =============================================================================

/**
 * Legacy chat message schema (backward compatibility)
 * Uses 'content' string instead of 'parts'
 * @deprecated Use uiMessageSchema for new implementations
 */
export const chatMessageSchema = z.object({
  id: z.string().optional(),
  role: messageRoleSchema,
  content: z.string().max(100000, 'Message content too long'), // 100KB limit
  createdAt: z.coerce.date().optional(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>

/**
 * AI SDK v6 UIMessage schema
 * Uses 'parts' array instead of 'content' string
 * Note: id is required for AI SDK v6 compatibility
 */
export const uiMessageSchema = z.object({
  id: z.string(),
  role: uiMessageRoleSchema,
  parts: z.array(z.record(z.string(), z.unknown())).min(1, 'At least one message part required'),
  createdAt: z.coerce.date().optional(),
})

export type UIMessage = z.infer<typeof uiMessageSchema>

/**
 * Flexible message schema that accepts both legacy and new formats
 * Used for backward compatibility during migration
 */
export const flexibleMessageSchema = z.union([
  // New UIMessage format (preferred)
  uiMessageSchema,
  // Legacy format (for backward compatibility)
  chatMessageSchema.transform((message) => ({
    id: message.id || '',
    ...message,
    parts: [{ type: 'text' as const, text: message.content }],
  })),
])

export type FlexibleMessage = z.infer<typeof flexibleMessageSchema>

// =============================================================================
// Chat Request Schemas
// =============================================================================

/**
 * Chat API request body schema (AI SDK v6 compatible)
 * Uses UIMessage format with 'parts' array
 */
export const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1, 'At least one message required').max(100, 'Too many messages'),
  projectId: projectIdSchema.optional().default('default'),
  model: modelProviderSchema,
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

/**
 * Legacy chat request schema (backward compatibility)
 * @deprecated Use chatRequestSchema for new implementations
 */
export const legacyChatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message required').max(100, 'Too many messages'),
  projectId: projectIdSchema.optional().default('default'),
  model: modelProviderSchema,
})

// =============================================================================
// Save Message Schemas
// =============================================================================

/**
 * Schema for saving a message (from AI SDK v6 onFinish callback)
 * More flexible than uiMessageSchema - allows optional parts
 */
export const saveMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(100000, 'Message content too long').optional(),
  parts: z.array(z.unknown()).optional(),
  model: z.string().optional(),
})

export type SaveMessage = z.infer<typeof saveMessageSchema>

/**
 * Schema for batch saving messages
 */
export const saveMessagesSchema = z.object({
  messages: z.array(saveMessageSchema).min(1).max(100),
})

export type SaveMessages = z.infer<typeof saveMessagesSchema>

// =============================================================================
// Generate Title Schemas
// =============================================================================

/**
 * Generate title request schema (AI SDK v6 compatible)
 */
export const generateTitleSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(50),
})

export type GenerateTitleRequest = z.infer<typeof generateTitleSchema>

/**
 * Legacy generate title schema (backward compatibility)
 * @deprecated Use generateTitleSchema for new implementations
 */
export const legacyGenerateTitleSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
})

// =============================================================================
// Project API Schemas
// =============================================================================

/**
 * Create project request schema
 */
export const createProjectSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  templateId: z.string().optional(),
})

export type CreateProjectRequest = z.infer<typeof createProjectSchema>

/**
 * Update project request schema
 */
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).optional(),
  starred: z.boolean().optional(),
  files_snapshot: z.record(z.string(), z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
})

export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>

// =============================================================================
// Sandbox API Schemas
// =============================================================================

/**
 * Run command request schema
 */
export const runCommandSchema = z.object({
  command: z.string().min(1).max(10000),
  cwd: z.string().optional(),
  timeout: z.number().min(1000).max(300000).optional().default(30000), // 1s to 5min
})

export type RunCommandRequest = z.infer<typeof runCommandSchema>

/**
 * Write file request schema
 */
export const writeFileSchema = z.object({
  path: z.string().min(1).max(500).regex(
    /^[^<>:"|?*\x00-\x1f]+$/,
    'Invalid file path characters'
  ),
  content: z.string().max(10 * 1024 * 1024, 'File content too large (max 10MB)'),
})

export type WriteFileRequest = z.infer<typeof writeFileSchema>

// =============================================================================
// Improve Prompt API Schema
// =============================================================================

export const improvePromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(50000, 'Prompt too long'),
  context: z.string().max(100000).optional(),
})

export type ImprovePromptRequest = z.infer<typeof improvePromptSchema>

// =============================================================================
// Validation Helper
// =============================================================================

/**
 * Validate request body against a Zod schema
 * Returns the parsed data or throws a validation error
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')
    throw new ValidationError(`Invalid request: ${errors}`, result.error.issues)
  }
  return result.data
}

/**
 * Validation error with structured error details
 */
export class ValidationError extends Error {
  public readonly errors: z.ZodIssue[]
  
  constructor(message: string, errors: z.ZodIssue[]) {
    super(message)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

/**
 * Create a JSON response for validation errors
 */
export function createValidationErrorResponse(error: ValidationError): Response {
  return Response.json(
    {
      error: 'Validation Error',
      message: error.message,
      details: error.errors.map((e: z.ZodIssue) => ({
        path: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    },
    { status: 400 }
  )
}
