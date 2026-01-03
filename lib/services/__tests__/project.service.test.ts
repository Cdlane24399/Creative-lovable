/**
 * ProjectService Unit Tests
 * 
 * Tests for business logic in the project service layer.
 * Mocks repositories and cache to test service logic in isolation.
 */

import { ValidationError, NotFoundError } from '@/lib/errors'

// =============================================================================
// Mocks - Must be defined before imports that use them
// =============================================================================

// Mock the repository factory
const mockProjectRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  ensureExists: jest.fn(),
  toggleStarred: jest.fn(),
  updateLastOpened: jest.fn(),
  updateSandbox: jest.fn(),
  saveFilesSnapshot: jest.fn(),
  getFilesSnapshot: jest.fn(),
  getSandboxId: jest.fn(),
  findBySandboxId: jest.fn(),
}

const mockMessageRepo = {
  findByProjectId: jest.fn(),
}

const mockContextRepo = {
  delete: jest.fn(),
}

jest.mock('@/lib/db/repositories', () => ({
  getProjectRepository: () => mockProjectRepo,
  getMessageRepository: () => mockMessageRepo,
  getContextRepository: () => mockContextRepo,
}))

// Mock cache
const mockProjectCache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
}

const mockMessagesCache = {
  get: jest.fn(),
  set: jest.fn(),
}

const mockProjectsListCache = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
}

const mockInvalidateProjectCache = jest.fn()

jest.mock('@/lib/cache', () => ({
  projectCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  messagesCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  projectsListCache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  invalidateProjectCache: jest.fn(),
}))

// Import after mocks are set up
import { ProjectService, getProjectService } from '../project.service'
import { projectCache, messagesCache, projectsListCache, invalidateProjectCache } from '@/lib/cache'

// =============================================================================
// Test Data
// =============================================================================

const mockProject = {
  id: 'project-123',
  name: 'Test Project',
  description: 'A test project',
  user_id: 'user-456',
  starred: false,
  sandbox_id: null,
  sandbox_url: null,
  files_snapshot: null,
  dependencies: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  last_opened_at: null,
}

const mockMessages = [
  { id: 'msg-1', project_id: 'project-123', role: 'user', content: 'Hello', model: 'anthropic', created_at: new Date() },
  { id: 'msg-2', project_id: 'project-123', role: 'assistant', content: 'Hi there!', model: 'anthropic', created_at: new Date() },
]

// =============================================================================
// Tests
// =============================================================================

describe('ProjectService', () => {
  let service: ProjectService

  beforeEach(() => {
    jest.clearAllMocks()
    // Create a new instance for each test
    service = new ProjectService()
  })

  describe('listProjects', () => {
    it('should return cached projects when available', async () => {
      const cachedResult = { projects: [mockProject] }
      ;(projectsListCache.get as jest.Mock).mockResolvedValue(cachedResult)

      const result = await service.listProjects()

      expect(result).toEqual(cachedResult)
      expect(mockProjectRepo.findAll).not.toHaveBeenCalled()
    })

    it('should fetch from database when cache miss', async () => {
      ;(projectsListCache.get as jest.Mock).mockResolvedValue(null)
      mockProjectRepo.findAll.mockResolvedValue([mockProject])

      const result = await service.listProjects()

      expect(result.projects).toEqual([mockProject])
      expect(mockProjectRepo.findAll).toHaveBeenCalled()
      expect(projectsListCache.set).toHaveBeenCalled()
    })

    it('should throw ValidationError for invalid limit', async () => {
      await expect(service.listProjects({ limit: 0 }))
        .rejects.toThrow(ValidationError)

      await expect(service.listProjects({ limit: 101 }))
        .rejects.toThrow(ValidationError)
    })

    it('should throw ValidationError for negative offset', async () => {
      await expect(service.listProjects({ offset: -1 }))
        .rejects.toThrow(ValidationError)
    })
  })

  describe('getProject', () => {
    it('should return cached project when available', async () => {
      ;(projectCache.get as jest.Mock).mockResolvedValue({ project: mockProject })

      const result = await service.getProject('project-123')

      expect(result).toEqual(mockProject)
      expect(mockProjectRepo.findById).not.toHaveBeenCalled()
    })

    it('should fetch from database when cache miss', async () => {
      ;(projectCache.get as jest.Mock).mockResolvedValue(null)
      mockProjectRepo.findById.mockResolvedValue(mockProject)

      const result = await service.getProject('project-123')

      expect(result).toEqual(mockProject)
      expect(mockProjectRepo.findById).toHaveBeenCalledWith('project-123')
      expect(projectCache.set).toHaveBeenCalled()
    })

    it('should throw NotFoundError when project not found', async () => {
      ;(projectCache.get as jest.Mock).mockResolvedValue(null)
      mockProjectRepo.findById.mockResolvedValue(null)

      await expect(service.getProject('nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('getProjectWithMessages', () => {
    it('should return project with cached messages', async () => {
      mockProjectRepo.findById.mockResolvedValue(mockProject)
      mockProjectRepo.updateLastOpened.mockResolvedValue(undefined)
      ;(messagesCache.get as jest.Mock).mockResolvedValue(mockMessages)

      const result = await service.getProjectWithMessages('project-123')

      expect(result.project).toEqual(mockProject)
      expect(result.messages).toEqual(mockMessages)
      expect(mockMessageRepo.findByProjectId).not.toHaveBeenCalled()
    })

    it('should fetch messages from database when cache miss', async () => {
      mockProjectRepo.findById.mockResolvedValue(mockProject)
      mockProjectRepo.updateLastOpened.mockResolvedValue(undefined)
      ;(messagesCache.get as jest.Mock).mockResolvedValue(null)
      mockMessageRepo.findByProjectId.mockResolvedValue(mockMessages)

      const result = await service.getProjectWithMessages('project-123')

      expect(result.project).toEqual(mockProject)
      expect(result.messages).toEqual(mockMessages)
      expect(mockMessageRepo.findByProjectId).toHaveBeenCalledWith('project-123')
      expect(messagesCache.set).toHaveBeenCalled()
    })

    it('should throw NotFoundError when project not found', async () => {
      mockProjectRepo.findById.mockResolvedValue(null)

      await expect(service.getProjectWithMessages('nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('createProject', () => {
    it('should create project with valid data', async () => {
      mockProjectRepo.create.mockResolvedValue(mockProject)

      const result = await service.createProject({ name: 'Test Project' })

      expect(result).toEqual(mockProject)
      expect(mockProjectRepo.create).toHaveBeenCalledWith({ name: 'Test Project' })
      expect(projectsListCache.invalidate).toHaveBeenCalled()
    })

    it('should throw ValidationError for empty name', async () => {
      await expect(service.createProject({ name: '' }))
        .rejects.toThrow(ValidationError)

      await expect(service.createProject({ name: '   ' }))
        .rejects.toThrow(ValidationError)
    })

    it('should throw ValidationError for name too long', async () => {
      const longName = 'a'.repeat(256)
      await expect(service.createProject({ name: longName }))
        .rejects.toThrow(ValidationError)
    })
  })

  describe('updateProject', () => {
    it('should update project with valid data', async () => {
      const updatedProject = { ...mockProject, name: 'Updated Name' }
      mockProjectRepo.update.mockResolvedValue(updatedProject)

      const result = await service.updateProject('project-123', { name: 'Updated Name' })

      expect(result).toEqual(updatedProject)
      expect(mockProjectRepo.update).toHaveBeenCalledWith('project-123', { name: 'Updated Name' })
    })

    it('should throw ValidationError for empty name', async () => {
      await expect(service.updateProject('project-123', { name: '' }))
        .rejects.toThrow(ValidationError)
    })

    it('should throw NotFoundError when project not found', async () => {
      mockProjectRepo.update.mockResolvedValue(null)

      await expect(service.updateProject('nonexistent', { name: 'New Name' }))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('deleteProject', () => {
    it('should delete project and invalidate cache', async () => {
      mockContextRepo.delete.mockResolvedValue(undefined)
      mockProjectRepo.delete.mockResolvedValue(true)

      await service.deleteProject('project-123')

      expect(mockContextRepo.delete).toHaveBeenCalledWith('project-123')
      expect(mockProjectRepo.delete).toHaveBeenCalledWith('project-123')
    })

    it('should throw NotFoundError when project not found', async () => {
      mockContextRepo.delete.mockResolvedValue(undefined)
      mockProjectRepo.delete.mockResolvedValue(false)

      await expect(service.deleteProject('nonexistent'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('toggleStarred', () => {
    it('should toggle starred status', async () => {
      mockProjectRepo.toggleStarred.mockResolvedValue(true)

      const result = await service.toggleStarred('project-123')

      expect(result).toBe(true)
      expect(mockProjectRepo.toggleStarred).toHaveBeenCalledWith('project-123')
    })
  })

  describe('ensureProjectExists', () => {
    it('should call repository ensureExists', async () => {
      mockProjectRepo.ensureExists.mockResolvedValue(mockProject)

      const result = await service.ensureProjectExists('project-123', 'Default Name')

      expect(result).toEqual(mockProject)
      expect(mockProjectRepo.ensureExists).toHaveBeenCalledWith('project-123', 'Default Name')
    })
  })
})

describe('getProjectService', () => {
  it('should return singleton instance', () => {
    const instance1 = getProjectService()
    const instance2 = getProjectService()

    expect(instance1).toBe(instance2)
  })
})
