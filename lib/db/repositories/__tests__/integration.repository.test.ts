import { IntegrationRepository } from "../integration.repository"
import { createAdminClient } from "@/lib/supabase/admin"
import { DatabaseError } from "@/lib/errors"

// Mock the Supabase client
jest.mock("@/lib/supabase/admin")

describe("IntegrationRepository", () => {
  let repository: IntegrationRepository
  let mockSupabase: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      delete: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
    }

    ;(createAdminClient as jest.Mock).mockReturnValue(Promise.resolve(mockSupabase))

    repository = new IntegrationRepository()
  })

  describe("upsertIntegration", () => {
    it("should upsert an integration successfully", async () => {
      const mockData = {
        user_id: "user-123",
        provider: "github",
        access_token: "encrypted-token",
        updated_at: "2023-01-01T00:00:00Z"
      }

      const mockResult = {
        id: "int-123",
        ...mockData,
        created_at: "2023-01-01T00:00:00Z"
      }

      mockSupabase.single.mockResolvedValue({ data: mockResult, error: null })

      const result = await repository.upsertIntegration(mockData)

      expect(mockSupabase.from).toHaveBeenCalledWith("integrations")
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-123",
          provider: "github",
          access_token: "encrypted-token"
        }),
        { onConflict: "user_id,provider" }
      )
      expect(result).toEqual(mockResult)
    })

    it("should throw DatabaseError on failure", async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: "DB Error" }
      })

      await expect(repository.upsertIntegration({
        user_id: "user-123",
        provider: "github"
      })).rejects.toThrow(DatabaseError)
    })
  })

  describe("findByUserAndProvider", () => {
    it("should return integration if found", async () => {
      const mockResult = { id: "int-123", user_id: "user-1", provider: "github" }
      mockSupabase.single.mockResolvedValue({ data: mockResult, error: null })

      const result = await repository.findByUserAndProvider("user-1", "github")

      expect(mockSupabase.from).toHaveBeenCalledWith("integrations")
      expect(mockSupabase.select).toHaveBeenCalledWith("*")
      expect(mockSupabase.eq).toHaveBeenCalledWith("user_id", "user-1")
      expect(mockSupabase.eq).toHaveBeenCalledWith("provider", "github")
      expect(result).toEqual(mockResult)
    })

    it("should return null if not found", async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST116" }
      })

      const result = await repository.findByUserAndProvider("user-1", "github")
      expect(result).toBeNull()
    })
  })
})
