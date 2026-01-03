/**
 * Base Repository Unit Tests
 * 
 * Tests for the abstract BaseRepository class utilities and error handling.
 */

import { DatabaseError, NotFoundError, ValidationError } from '@/lib/errors'

// =============================================================================
// Mock Supabase client
// =============================================================================

const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => mockSupabaseClient),
}))

// Import after mocks
import { BaseRepository, generateId, parseJsonSafe, FindOptions } from '../base.repository'

// =============================================================================
// Test Implementation
// =============================================================================

interface TestEntity {
  id: string
  name: string
  created_at: string
}

class TestRepository extends BaseRepository<TestEntity> {
  constructor() {
    super('test_table')
  }

  async exists(id: string): Promise<boolean> {
    const entity = await this.findById(id)
    return entity !== null
  }

  async delete(id: string): Promise<boolean> {
    return true
  }

  async count(): Promise<number> {
    return 0
  }

  async findById(id: string): Promise<TestEntity | null> {
    try {
      const client = await this.getClient()
      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()
      
      if (error?.code === 'PGRST116') return null
      if (error) throw error
      return data
    } catch (error) {
      this.handleError(error, 'findById')
    }
  }

  // Expose protected method for testing
  testHandleError(error: unknown, operationName: string): never {
    return this.handleError(error, operationName)
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('BaseRepository', () => {
  let repo: TestRepository

  beforeEach(() => {
    jest.clearAllMocks()
    repo = new TestRepository()
  })

  describe('generateId', () => {
    it('should generate a unique ID', () => {
      const id1 = generateId()
      const id2 = generateId()

      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(id1).not.toBe(id2)
    })

    it('should generate IDs of expected length', () => {
      const id = generateId()
      // UUID format: 36 characters with hyphens
      expect(id.length).toBe(36)
      expect(id).toMatch(/^[a-f0-9-]{36}$/)
    })
  })

  describe('parseJsonSafe', () => {
    it('should parse valid JSON strings', () => {
      const result = parseJsonSafe('{"key": "value"}', {})
      expect(result).toEqual({ key: 'value' })
    })

    it('should return default for invalid JSON', () => {
      const result = parseJsonSafe('invalid json', { default: true })
      expect(result).toEqual({ default: true })
    })

    it('should return default for null input', () => {
      const result = parseJsonSafe(null, { default: true })
      expect(result).toEqual({ default: true })
    })

    it('should return default for undefined input', () => {
      const result = parseJsonSafe(undefined, { default: true })
      expect(result).toEqual({ default: true })
    })

    it('should return object as-is if already parsed', () => {
      const obj = { already: 'parsed' }
      const result = parseJsonSafe(obj, {})
      expect(result).toEqual(obj)
    })

    it('should handle nested objects', () => {
      const json = '{"outer": {"inner": "value"}}'
      const result = parseJsonSafe(json, { outer: { inner: '' } })
      expect(result.outer?.inner).toBe('value')
    })

    it('should handle arrays', () => {
      const json = '["a", "b", "c"]'
      const result = parseJsonSafe<string[]>(json, [])
      expect(result).toEqual(['a', 'b', 'c'])
    })
  })

  describe('handleError', () => {
    it('should rethrow DatabaseError as-is', () => {
      const error = new DatabaseError('DB error')
      expect(() => repo.testHandleError(error, 'test')).toThrow(DatabaseError)
      expect(() => repo.testHandleError(error, 'test')).toThrow('DB error')
    })

    it('should rethrow NotFoundError as-is', () => {
      const error = new NotFoundError('Resource not found')
      expect(() => repo.testHandleError(error, 'test')).toThrow(NotFoundError)
    })

    it('should rethrow ValidationError as-is', () => {
      const error = new ValidationError('Invalid input')
      expect(() => repo.testHandleError(error, 'test')).toThrow(ValidationError)
    })

    it('should wrap unknown errors in DatabaseError', () => {
      const error = new Error('Something went wrong')
      expect(() => repo.testHandleError(error, 'findById')).toThrow(DatabaseError)
      expect(() => repo.testHandleError(error, 'findById')).toThrow('findById failed: Something went wrong')
    })

    it('should handle errors without message property', () => {
      const error = { code: 'UNKNOWN' }
      expect(() => repo.testHandleError(error, 'create')).toThrow(DatabaseError)
      expect(() => repo.testHandleError(error, 'create')).toThrow('create failed: Unknown error')
    })
  })

  describe('findByIdOrThrow', () => {
    it('should return entity when found', async () => {
      const mockEntity = { id: '123', name: 'Test', created_at: '2026-01-01' }
      mockSupabaseClient.single.mockResolvedValue({ data: mockEntity, error: null })

      const result = await repo.findByIdOrThrow('123')
      expect(result).toEqual(mockEntity)
    })

    it('should throw NotFoundError when entity not found', async () => {
      mockSupabaseClient.single.mockResolvedValue({ 
        data: null, 
        error: { code: 'PGRST116', message: 'Not found' } 
      })

      await expect(repo.findByIdOrThrow('not-found'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getClient', () => {
    it('should return Supabase client', async () => {
      // Test indirectly through findById
      mockSupabaseClient.single.mockResolvedValue({ 
        data: { id: '1', name: 'Test', created_at: '2026-01-01' }, 
        error: null 
      })

      await repo.findById('1')
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('test_table')
    })
  })
})

describe('FindOptions', () => {
  it('should allow all optional properties', () => {
    const options: FindOptions = {
      limit: 10,
      offset: 0,
      orderBy: 'created_at',
      orderDir: 'DESC',
    }

    expect(options.limit).toBe(10)
    expect(options.orderDir).toBe('DESC')
  })

  it('should allow empty options', () => {
    const options: FindOptions = {}
    expect(options.limit).toBeUndefined()
  })
})
