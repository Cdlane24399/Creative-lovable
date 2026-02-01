/**
 * Validation Schema Tests
 */

import { z } from 'zod'
import {
  projectIdSchema,
  modelProviderSchema,
  chatMessageSchema,
  chatRequestSchema,
  createProjectSchema,
  updateProjectSchema,
  improvePromptSchema,
  validateRequest,
  ValidationError,
  createValidationErrorResponse,
  // AI SDK v6 new schemas
  textPartSchema,
  toolInvocationPartSchema,
  toolResultPartSchema,
  messagePartSchema,
  uiMessageSchema,
  uiMessageRoleSchema,
  flexibleMessageSchema,
  saveMessageSchema,
  saveMessagesSchema,
} from '../validations'

describe('Validation Schemas', () => {
  describe('projectIdSchema', () => {
    it('should accept valid project IDs', () => {
      expect(() => projectIdSchema.parse('project-123')).not.toThrow()
      expect(() => projectIdSchema.parse('my_project')).not.toThrow()
      expect(() => projectIdSchema.parse('Test123')).not.toThrow()
    })

    it('should reject invalid project IDs', () => {
      expect(() => projectIdSchema.parse('')).toThrow()
      expect(() => projectIdSchema.parse('a'.repeat(101))).toThrow()
      expect(() => projectIdSchema.parse('project@123')).toThrow()
      expect(() => projectIdSchema.parse('project 123')).toThrow()
    })
  })

  describe('modelProviderSchema', () => {
    it('should accept valid providers', () => {
      expect(modelProviderSchema.parse('anthropic')).toBe('anthropic')
      expect(modelProviderSchema.parse('openai')).toBe('openai')
      expect(modelProviderSchema.parse('google')).toBe('google')
    })

    it('should default to anthropic', () => {
      expect(modelProviderSchema.parse(undefined)).toBe('anthropic')
    })

    it('should reject invalid providers', () => {
      expect(() => modelProviderSchema.parse('invalid')).toThrow()
    })
  })

  describe('chatMessageSchema (Legacy)', () => {
    it('should accept valid messages', () => {
      const validMessage = {
        role: 'user',
        content: 'Hello',
      }
      expect(() => chatMessageSchema.parse(validMessage)).not.toThrow()
    })

    it('should accept all roles', () => {
      const roles = ['user', 'assistant', 'system', 'tool']
      roles.forEach(role => {
        expect(() => chatMessageSchema.parse({ role, content: 'test' })).not.toThrow()
      })
    })

    it('should reject content that is too long', () => {
      const longContent = 'a'.repeat(100001)
      expect(() => chatMessageSchema.parse({ role: 'user', content: longContent })).toThrow()
    })
  })

  describe('chatRequestSchema (AI SDK v6)', () => {
    it('should accept valid chat requests with parts array', () => {
      const validRequest = {
        messages: [{
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        }],
      }
      const result = chatRequestSchema.parse(validRequest)
      expect(result.messages).toHaveLength(1)
    })

    it('should require at least one message', () => {
      expect(() => chatRequestSchema.parse({ messages: [] })).toThrow()
    })

    it('should reject too many messages', () => {
      const tooManyMessages = Array(101).fill({
        role: 'user',
        parts: [{ type: 'text', text: 'test' }],
      })
      expect(() => chatRequestSchema.parse({ messages: tooManyMessages })).toThrow()
    })

    it('should reject empty messages array', () => {
      expect(() => chatRequestSchema.parse({ messages: [] })).toThrow()
    })

    it('should reject messages array that is too large', () => {
      expect(() => chatRequestSchema.parse({
        messages: Array(101).fill({ role: 'user' }),
      })).toThrow()
    })
  })

  describe('createProjectSchema', () => {
    it('should accept valid project creation', () => {
      const result = createProjectSchema.parse({ name: 'My Project' })
      expect(result.name).toBe('My Project')
    })

    it('should trim whitespace from name', () => {
      const result = createProjectSchema.parse({ name: '  Trimmed  ' })
      expect(result.name).toBe('Trimmed')
    })

    it('should reject empty name', () => {
      expect(() => createProjectSchema.parse({ name: '' })).toThrow()
    })

    it('should reject name that is too long', () => {
      expect(() => createProjectSchema.parse({ name: 'a'.repeat(201) })).toThrow()
    })
  })

  describe('updateProjectSchema', () => {
    it('should accept partial updates', () => {
      const result = updateProjectSchema.parse({ starred: true })
      expect(result.starred).toBe(true)
    })

    it('should accept files_snapshot as record', () => {
      const result = updateProjectSchema.parse({
        files_snapshot: { 'index.ts': 'content' },
      })
      expect(result.files_snapshot).toEqual({ 'index.ts': 'content' })
    })
  })

  describe('improvePromptSchema', () => {
    it('should accept valid prompt', () => {
      const result = improvePromptSchema.parse({ prompt: 'Build a website' })
      expect(result.prompt).toBe('Build a website')
    })

    it('should require prompt', () => {
      expect(() => improvePromptSchema.parse({})).toThrow()
    })

    it('should reject empty prompt', () => {
      expect(() => improvePromptSchema.parse({ prompt: '' })).toThrow()
    })

    it('should reject prompt that is too long', () => {
      expect(() => improvePromptSchema.parse({ prompt: 'a'.repeat(50001) })).toThrow()
    })
  })

  // =============================================================================
  // AI SDK v6 UIMessage Schema Tests
  // =============================================================================

  describe('textPartSchema', () => {
    it('should accept valid text part', () => {
      const result = textPartSchema.parse({ type: 'text', text: 'Hello world' })
      expect(result).toEqual({ type: 'text', text: 'Hello world' })
    })

    it('should reject text part without type', () => {
      expect(() => textPartSchema.parse({ text: 'Hello' })).toThrow()
    })

    it('should reject text part with wrong type', () => {
      expect(() => textPartSchema.parse({ type: 'image', text: 'Hello' })).toThrow()
    })

    it('should reject text part that is too long', () => {
      expect(() => textPartSchema.parse({ type: 'text', text: 'a'.repeat(100001) })).toThrow()
    })
  })

  describe('toolInvocationPartSchema', () => {
    it('should accept valid tool invocation part', () => {
      const result = toolInvocationPartSchema.parse({
        type: 'tool-invocation',
        toolInvocationId: 'call-123',
        toolName: 'writeFile',
        args: { path: 'test.txt', content: 'hello' },
      })
      expect(result).toEqual({
        type: 'tool-invocation',
        toolInvocationId: 'call-123',
        toolName: 'writeFile',
        args: { path: 'test.txt', content: 'hello' },
      })
    })

    it('should accept args as any type', () => {
      expect(() => toolInvocationPartSchema.parse({
        type: 'tool-invocation',
        toolInvocationId: 'call-123',
        toolName: 'test',
        args: null,
      })).not.toThrow()

      expect(() => toolInvocationPartSchema.parse({
        type: 'tool-invocation',
        toolInvocationId: 'call-123',
        toolName: 'test',
        args: undefined,
      })).not.toThrow()

      expect(() => toolInvocationPartSchema.parse({
        type: 'tool-invocation',
        toolInvocationId: 'call-123',
        toolName: 'test',
        args: ['array', 'of', 'args'],
      })).not.toThrow()
    })

    it('should reject tool invocation with wrong type', () => {
      expect(() => toolInvocationPartSchema.parse({
        type: 'tool-result',
        toolInvocationId: 'call-123',
        toolName: 'test',
        args: {},
      })).toThrow()
    })
  })

  describe('toolResultPartSchema', () => {
    it('should accept valid tool result part', () => {
      const result = toolResultPartSchema.parse({
        type: 'tool-result',
        toolInvocationId: 'call-123',
        result: { success: true },
      })
      expect(result).toEqual({
        type: 'tool-result',
        toolInvocationId: 'call-123',
        result: { success: true },
      })
    })

    it('should accept result as any type', () => {
      expect(() => toolResultPartSchema.parse({
        type: 'tool-result',
        toolInvocationId: 'call-123',
        result: 'string result',
      })).not.toThrow()

      expect(() => toolResultPartSchema.parse({
        type: 'tool-result',
        toolInvocationId: 'call-123',
        result: null,
      })).not.toThrow()

      expect(() => toolResultPartSchema.parse({
        type: 'tool-result',
        toolInvocationId: 'call-123',
        result: [1, 2, 3],
      })).not.toThrow()
    })

    it('should reject tool result with wrong type', () => {
      expect(() => toolResultPartSchema.parse({
        type: 'tool-invocation',
        toolInvocationId: 'call-123',
        result: {},
      })).toThrow()
    })
  })

  describe('messagePartSchema (Discriminated Union)', () => {
    it('should accept text part', () => {
      const result = messagePartSchema.parse({ type: 'text', text: 'Hello' })
      expect(result.type).toBe('text')
    })

    it('should accept tool-invocation part', () => {
      const result = messagePartSchema.parse({
        type: 'tool-invocation',
        toolInvocationId: 'call-123',
        toolName: 'test',
        args: {},
      })
      expect(result.type).toBe('tool-invocation')
    })

    it('should accept tool-result part', () => {
      const result = messagePartSchema.parse({
        type: 'tool-result',
        toolInvocationId: 'call-123',
        result: {},
      })
      expect(result.type).toBe('tool-result')
    })

    it('should reject unknown part type', () => {
      expect(() => messagePartSchema.parse({
        type: 'unknown',
        someField: 'value',
      })).toThrow()
    })

    it('should provide good error messages for invalid parts', () => {
      try {
        messagePartSchema.parse({ type: 'text' })
        fail('Should have thrown')
      } catch (error: any) {
        expect(error.errors).toBeDefined()
        expect(error.errors[0].message).toContain('Required')
      }
    })
  })

  describe('uiMessageRoleSchema', () => {
    it('should accept valid roles', () => {
      expect(uiMessageRoleSchema.parse('user')).toBe('user')
      expect(uiMessageRoleSchema.parse('assistant')).toBe('assistant')
      expect(uiMessageRoleSchema.parse('system')).toBe('system')
    })

    it('should reject tool role (not in AI SDK v6 UIMessage)', () => {
      expect(() => uiMessageRoleSchema.parse('tool')).toThrow()
    })

    it('should reject invalid roles', () => {
      expect(() => uiMessageRoleSchema.parse('admin')).toThrow()
      expect(() => uiMessageRoleSchema.parse('')).toThrow()
    })
  })

  describe('uiMessageSchema', () => {
    it('should accept valid UIMessage with text parts', () => {
      const result = uiMessageSchema.parse({
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      })
      expect(result.role).toBe('user')
      expect(result.parts).toHaveLength(1)
    })

    it('should accept valid UIMessage with multiple parts', () => {
      const result = uiMessageSchema.parse({
        id: 'msg-123',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'I will help you' },
          {
            type: 'tool-invocation',
            toolInvocationId: 'call-1',
            toolName: 'writeFile',
            args: { path: 'test.txt' },
          },
        ],
        createdAt: new Date('2024-01-01'),
      })
      expect(result.parts).toHaveLength(2)
      expect(result.id).toBe('msg-123')
    })

    it('should reject message without parts', () => {
      expect(() => uiMessageSchema.parse({
        role: 'user',
      })).toThrow()
    })

    it('should reject message with empty parts array', () => {
      expect(() => uiMessageSchema.parse({
        role: 'user',
        parts: [],
      })).toThrow()
    })

    it('should reject message with invalid part', () => {
      expect(() => uiMessageSchema.parse({
        role: 'user',
        parts: [{ type: 'invalid', text: 'Hello' }],
      })).toThrow()
    })

    it('should accept all valid roles', () => {
      ['user', 'assistant', 'system'].forEach(role => {
        expect(() => uiMessageSchema.parse({
          role,
          parts: [{ type: 'text', text: 'test' }],
        })).not.toThrow()
      })
    })

    it('should reject tool role', () => {
      expect(() => uiMessageSchema.parse({
        role: 'tool',
        parts: [{ type: 'text', text: 'test' }],
      })).toThrow()
    })

    it('should reject content field (not in UIMessage)', () => {
      expect(() => uiMessageSchema.parse({
        role: 'user',
        content: 'Hello',
        parts: [{ type: 'text', text: 'Hello' }],
      })).toThrow()
    })
  })

  describe('saveMessageSchema', () => {
    it('should accept message with parts', () => {
      const result = saveMessageSchema.parse({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
      })
      expect(result.parts).toHaveLength(1)
    })

    it('should accept message with content (backward compatibility)', () => {
      const result = saveMessageSchema.parse({
        role: 'assistant',
        content: 'Hello',
      })
      expect(result.content).toBe('Hello')
    })

    it('should accept message with both content and parts', () => {
      const result = saveMessageSchema.parse({
        role: 'assistant',
        content: 'Hello',
        parts: [{ type: 'text', text: 'Hello' }],
      })
      expect(result.content).toBe('Hello')
      expect(result.parts).toHaveLength(1)
    })

    it('should accept message with model', () => {
      const result = saveMessageSchema.parse({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
        model: 'claude-3-sonnet',
      })
      expect(result.model).toBe('claude-3-sonnet')
    })

    it('should accept message with id', () => {
      const result = saveMessageSchema.parse({
        id: 'msg-123',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      })
      expect(result.id).toBe('msg-123')
    })

    it('should reject invalid role', () => {
      expect(() => saveMessageSchema.parse({
        role: 'tool',
        parts: [{ type: 'text', text: 'Hello' }],
      })).toThrow()
    })
  })

  describe('saveMessagesSchema', () => {
    it('should accept valid array of messages', () => {
      const result = saveMessagesSchema.parse({
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
          { role: 'assistant', parts: [{ type: 'text', text: 'Hi!' }] },
        ],
      })
      expect(result.messages).toHaveLength(2)
    })

    it('should reject empty messages array', () => {
      expect(() => saveMessagesSchema.parse({ messages: [] })).toThrow()
    })

    it('should reject too many messages', () => {
      const tooManyMessages = Array(101).fill({
        role: 'user',
        parts: [{ type: 'text', text: 'test' }],
      })
      expect(() => saveMessagesSchema.parse({ messages: tooManyMessages })).toThrow()
    })
  })

  describe('flexibleMessageSchema', () => {
    it('should accept UIMessage format (new)', () => {
      const result = flexibleMessageSchema.parse({
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      })
      expect(result.parts).toHaveLength(1)
    })

    it('should accept legacy format with content', () => {
      const result = flexibleMessageSchema.parse({
        role: 'user',
        content: 'Hello',
      })
      expect(result.parts).toHaveLength(1)
      expect(result.parts?.[0]).toEqual({ type: 'text', text: 'Hello' })
    })

    it('should transform legacy format correctly', () => {
      const result = flexibleMessageSchema.parse({
        id: 'msg-123',
        role: 'assistant',
        content: 'Hello world',
        createdAt: new Date('2024-01-01'),
      })
      expect(result.role).toBe('assistant')
      expect(result.parts).toEqual([{ type: 'text', text: 'Hello world' }])
    })
  })
})

describe('validateRequest', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  })

  it('should return parsed data for valid input', () => {
    const result = validateRequest(testSchema, { name: 'John', age: 30 })
    expect(result).toEqual({ name: 'John', age: 30 })
  })

  it('should throw ValidationError for invalid input', () => {
    expect(() => validateRequest(testSchema, { name: '', age: -1 }))
      .toThrow(ValidationError)
  })

  it('should include field errors in ValidationError', () => {
    try {
      validateRequest(testSchema, { name: '', age: -1 })
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).errors).toHaveLength(2)
    }
  })

  describe('with UIMessage schemas', () => {
    it('should validate UIMessage request correctly', () => {
      const request = {
        messages: [{
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        }],
        projectId: 'my-project',
        model: 'anthropic',
      }
      
      const result = validateRequest(chatRequestSchema, request)
      expect(result.messages).toHaveLength(1)
    })

    it('should throw ValidationError for empty messages array', () => {
      const request = {
        messages: [],
      }
      
      expect(() => validateRequest(chatRequestSchema, request)).toThrow(ValidationError)
    })
  })
})

describe('ValidationError', () => {
  it('should store error details', () => {
    const errors = [
      { code: 'too_small', minimum: 1, inclusive: true, path: ['name'], message: 'Required' },
    ] as z.ZodIssue[]
    const error = new ValidationError('Test error', errors)

    expect(error.name).toBe('ValidationError')
    expect(error.message).toBe('Test error')
    expect(error.errors).toEqual(errors)
  })
})

describe('createValidationErrorResponse', () => {
  it('should create 400 response with error details', () => {
    const errors = [
      { code: 'too_small', minimum: 1, inclusive: true, path: ['name'], message: 'Required' },
    ] as z.ZodIssue[]
    const validationError = new ValidationError('Invalid input', errors)

    const response = createValidationErrorResponse(validationError)

    expect(response.status).toBe(400)
  })
})
