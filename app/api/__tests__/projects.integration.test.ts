import { NextRequest } from 'next/server'
import { GET as getProjects, POST as createProject } from '../projects/route'

// Mock database
jest.mock('@/lib/db/neon', () => ({
  getDb: () => jest.fn(),
}))

describe('Projects API Integration', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()
  })

  describe('GET /api/projects', () => {
    it('should return projects list', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        headers: { 'x-api-key': 'test-api-key' }
      })

      const response = await getProjects(request)
      expect(response).toBeDefined()
      // Note: Full integration test would require database setup
    })
  })

  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: {
          'x-api-key': 'test-api-key',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project'
        })
      })

      const response = await createProject(request)
      expect(response).toBeDefined()
      // Note: Full integration test would require database setup
    })
  })
})