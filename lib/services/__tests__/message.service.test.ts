/**
 * MessageService Unit Tests
 * 
 * Tests for message persistence and retrieval logic.
 */

// =============================================================================
// Mocks - Must be defined before imports that use them
// =============================================================================

const mockMessageRepo = {
  findByProjectId: jest.fn(),
  findRecentByProjectId: jest.fn(),
  create: jest.fn(),
  saveConversation: jest.fn(),
  createBatch: jest.fn(),
  deleteByProjectId: jest.fn(),
  countByProjectId: jest.fn(),
}

jest.mock('@/lib/db/repositories', () => ({
  getMessageRepository: () => mockMessageRepo,
}))

jest.mock('@/lib/cache', () => ({
  messagesCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
}))

// Import after mocks are set up
import { MessageService, getMessageService } from '../message.service'
import { messagesCache } from '@/lib/cache'

// =============================================================================
// Test Data
// =============================================================================

const mockMessages = [
  {
    id: 'msg-1',
    project_id: 'project-123',
    role: 'user' as const,
    content: 'Hello',
    parts: null,
    model: 'anthropic',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'msg-2',
    project_id: 'project-123',
    role: 'assistant' as const,
    content: 'Hi there!',
    parts: null,
    model: 'anthropic',
    created_at: '2026-01-01T00:00:00.000Z',
  },
]

// =============================================================================
// Tests
// =============================================================================

describe('MessageService', () => {
  let service: MessageService
  const mockCache = messagesCache as jest.Mocked<typeof messagesCache>

  beforeEach(() => {
    jest.clearAllMocks()
    service = new MessageService()
  })

  describe('getMessages', () => {
    it('should return cached messages when available', async () => {
      mockCache.get.mockResolvedValue(mockMessages)

      const result = await service.getMessages('project-123')

      expect(result).toEqual(mockMessages)
      expect(mockMessageRepo.findByProjectId).not.toHaveBeenCalled()
    })

    it('should fetch from database when cache miss', async () => {
      mockCache.get.mockResolvedValue(null)
      mockMessageRepo.findByProjectId.mockResolvedValue(mockMessages)

      const result = await service.getMessages('project-123')

      expect(result).toEqual(mockMessages)
      expect(mockMessageRepo.findByProjectId).toHaveBeenCalledWith('project-123', {})
      expect(mockCache.set).toHaveBeenCalledWith('project-123', mockMessages)
    })

    it('should bypass cache when options provided', async () => {
      mockMessageRepo.findByProjectId.mockResolvedValue(mockMessages)

      const result = await service.getMessages('project-123', { limit: 10 })

      expect(result).toEqual(mockMessages)
      expect(mockCache.get).not.toHaveBeenCalled()
      expect(mockCache.set).not.toHaveBeenCalled()
    })
  })

  describe('getRecentMessages', () => {
    it('should fetch recent messages from repository', async () => {
      mockMessageRepo.findRecentByProjectId.mockResolvedValue(mockMessages)

      const result = await service.getRecentMessages('project-123', 10)

      expect(result).toEqual(mockMessages)
      expect(mockMessageRepo.findRecentByProjectId).toHaveBeenCalledWith('project-123', 10)
    })

    it('should use default count of 20', async () => {
      mockMessageRepo.findRecentByProjectId.mockResolvedValue(mockMessages)

      await service.getRecentMessages('project-123')

      expect(mockMessageRepo.findRecentByProjectId).toHaveBeenCalledWith('project-123', 20)
    })
  })

  describe('saveMessage', () => {
    it('should save message and invalidate cache', async () => {
      const newMessage = { ...mockMessages[0] }
      mockMessageRepo.create.mockResolvedValue(newMessage)

      const result = await service.saveMessage('project-123', {
        role: 'user',
        content: 'Hello',
        model: 'anthropic',
      })

      expect(result).toEqual(newMessage)
      expect(mockMessageRepo.create).toHaveBeenCalledWith({
        projectId: 'project-123',
        role: 'user',
        content: 'Hello',
        parts: undefined,
        model: 'anthropic',
      })
      expect(mockCache.invalidate).toHaveBeenCalledWith('project-123')
    })

    it('should extract content from parts if not provided', async () => {
      const newMessage = { ...mockMessages[0] }
      mockMessageRepo.create.mockResolvedValue(newMessage)

      await service.saveMessage('project-123', {
        role: 'user',
        parts: [{ type: 'text', text: 'Hello from parts' }],
      })

      expect(mockMessageRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello from parts',
        })
      )
    })
  })

  describe('saveConversation', () => {
    it('should append only new messages and update cache', async () => {
      const existingMessage = mockMessages[0]
      const savedMessages = [mockMessages[0], mockMessages[1]]
      mockMessageRepo.countByProjectId.mockResolvedValue(1)
      mockMessageRepo.findRecentByProjectId.mockResolvedValue([existingMessage])
      mockMessageRepo.createBatch.mockResolvedValue([mockMessages[1]])
      mockMessageRepo.findByProjectId.mockResolvedValue(savedMessages)

      const result = await service.saveConversation('project-123', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ])

      expect(result).toEqual(savedMessages)
      expect(mockMessageRepo.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-123',
          messages: [
            expect.objectContaining({
              role: 'assistant',
              content: 'Hi there!',
            }),
          ],
        }),
      )
      expect(mockCache.invalidate).toHaveBeenCalledWith('project-123')
      expect(mockCache.set).toHaveBeenCalledWith('project-123', savedMessages)
      expect(mockMessageRepo.saveConversation).not.toHaveBeenCalled()
    })

    it('should return empty array for empty messages', async () => {
      const result = await service.saveConversation('project-123', [])

      expect(result).toEqual([])
      expect(mockMessageRepo.saveConversation).not.toHaveBeenCalled()
    })

    it('should fallback to rewrite when history does not match', async () => {
      mockMessageRepo.countByProjectId.mockResolvedValue(1)
      mockMessageRepo.findRecentByProjectId.mockResolvedValue([
        { ...mockMessages[0], content: 'Different content' },
      ])
      mockMessageRepo.saveConversation.mockResolvedValue(mockMessages)

      const result = await service.saveConversation('project-123', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ])

      expect(result).toEqual(mockMessages)
      expect(mockMessageRepo.saveConversation).toHaveBeenCalled()
    })
  })

  describe('appendMessages', () => {
    it('should append messages and invalidate cache', async () => {
      mockMessageRepo.createBatch.mockResolvedValue(mockMessages)

      const result = await service.appendMessages('project-123', [
        { role: 'user', content: 'Another message' },
      ])

      expect(result).toEqual(mockMessages)
      expect(mockCache.invalidate).toHaveBeenCalledWith('project-123')
    })

    it('should return empty array for empty messages', async () => {
      const result = await service.appendMessages('project-123', [])

      expect(result).toEqual([])
      expect(mockMessageRepo.createBatch).not.toHaveBeenCalled()
    })
  })

  describe('toUIMessages', () => {
    it('should convert messages to UIMessage format', () => {
      const result = service.toUIMessages(mockMessages)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        parts: [{ type: 'text', text: 'Hello' }],
        createdAt: expect.any(Date),
      })
    })
  })

  describe('deleteMessages', () => {
    it('should delete messages and invalidate cache', async () => {
      mockMessageRepo.deleteByProjectId.mockResolvedValue(2)

      await service.deleteMessages('project-123')

      expect(mockMessageRepo.deleteByProjectId).toHaveBeenCalledWith('project-123')
      expect(mockCache.invalidate).toHaveBeenCalledWith('project-123')
    })
  })

  describe('getMessageCount', () => {
    it('should return message count from repository', async () => {
      mockMessageRepo.countByProjectId.mockResolvedValue(42)

      const result = await service.getMessageCount('project-123')

      expect(result).toBe(42)
      expect(mockMessageRepo.countByProjectId).toHaveBeenCalledWith('project-123')
    })
  })
})

describe('getMessageService', () => {
  it('should return singleton instance', () => {
    const instance1 = getMessageService()
    const instance2 = getMessageService()

    expect(instance1).toBe(instance2)
  })
})
