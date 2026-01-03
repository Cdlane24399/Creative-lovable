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

  describe('chatMessageSchema', () => {
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

  describe('chatRequestSchema', () => {
    it('should accept valid chat requests', () => {
      const validRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      }
      const result = chatRequestSchema.parse(validRequest)
      expect(result.messages).toHaveLength(1)
      expect(result.projectId).toBe('default')
      expect(result.model).toBe('anthropic')
    })

    it('should require at least one message', () => {
      expect(() => chatRequestSchema.parse({ messages: [] })).toThrow()
    })

    it('should reject too many messages', () => {
      const tooManyMessages = Array(101).fill({ role: 'user', content: 'test' })
      expect(() => chatRequestSchema.parse({ messages: tooManyMessages })).toThrow()
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
