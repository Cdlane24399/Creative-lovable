import { ProjectRepository } from "../project.repository";

const mockClient = {
  from: jest.fn(),
};

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => mockClient),
}));

describe("ProjectRepository.ensureExists", () => {
  let repo: ProjectRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new ProjectRepository();
  });

  it("returns existing project via upsert with ignoreDuplicates", async () => {
    const existingProject = {
      id: "project-1",
      name: "Existing Name",
      description: null,
      screenshot_url: null,
      screenshot_base64: null,
      sandbox_id: null,
      sandbox_url: null,
      files_snapshot: {},
      dependencies: {},
      starred: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
      user_id: null,
    };

    jest.spyOn(repo as any, "getClient").mockResolvedValue(mockClient as any);

    // upsert with ignoreDuplicates returns PGRST116 when row already exists
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "no rows returned" },
    });
    const select = jest.fn().mockReturnValue({ single });
    const upsert = jest.fn().mockReturnValue({ select });
    mockClient.from.mockReturnValue({ upsert });

    // Falls back to findById
    jest.spyOn(repo, "findById").mockResolvedValue(existingProject as any);

    const result = await repo.ensureExists("project-1", "Fallback Name");

    expect(result?.name).toBe("Existing Name");
    expect(upsert).toHaveBeenCalled();
    expect(mockClient.from).toHaveBeenCalledWith("projects");
  });

  it("inserts when project is missing", async () => {
    const insertedProject = {
      id: "project-2",
      name: "Fallback Name",
      description: "Auto-created",
      screenshot_url: null,
      screenshot_base64: null,
      sandbox_id: null,
      sandbox_url: null,
      files_snapshot: {},
      dependencies: {},
      starred: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
      user_id: null,
    };

    jest.spyOn(repo as any, "getClient").mockResolvedValue(mockClient as any);

    const single = jest.fn().mockResolvedValue({
      data: insertedProject,
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const upsert = jest.fn().mockReturnValue({ select });
    mockClient.from.mockReturnValue({ upsert });

    const result = await repo.ensureExists("project-2", "Fallback Name");

    expect(result?.name).toBe("Fallback Name");
    expect(mockClient.from).toHaveBeenCalledWith("projects");
    expect(upsert).toHaveBeenCalled();
  });

  it("handles duplicate insert races without overwriting", async () => {
    const existingProject = {
      id: "project-3",
      name: "Winner Name",
      description: null,
      screenshot_url: null,
      screenshot_base64: null,
      sandbox_id: null,
      sandbox_url: null,
      files_snapshot: {},
      dependencies: {},
      starred: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
      user_id: null,
    };

    jest.spyOn(repo as any, "getClient").mockResolvedValue(mockClient as any);

    // upsert with ignoreDuplicates returns PGRST116 (no rows) when existing
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "no rows returned" },
    });
    const select = jest.fn().mockReturnValue({ single });
    const upsert = jest.fn().mockReturnValue({ select });
    mockClient.from.mockReturnValue({ upsert });

    // Falls back to findById and finds the existing record
    jest.spyOn(repo, "findById").mockResolvedValue(existingProject as any);

    const result = await repo.ensureExists("project-3", "Fallback Name");

    expect(result?.name).toBe("Winner Name");
    expect(upsert).toHaveBeenCalled();
  });
});
