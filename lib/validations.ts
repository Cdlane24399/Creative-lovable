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
// Chat API Schemas
// =============================================================================

/**
 * Chat message role enum
 */
export const messageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])

/**
 * Basic chat message schema (simplified for API input)
 */
export const chatMessageSchema = z.object({
  id: z.string().optional(),
  role: messageRoleSchema,
  content: z.string().max(100000, 'Message content too long'), // 100KB limit
  createdAt: z.coerce.date().optional(),
})

/**
 * Chat API request body schema
 */
export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1, 'At least one message required').max(100, 'Too many messages'),
  projectId: projectIdSchema.optional().default('default'),
  model: modelProviderSchema,
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

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
// Generate Title API Schema
// =============================================================================

export const generateTitleSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
})

export type GenerateTitleRequest = z.infer<typeof generateTitleSchema>

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
