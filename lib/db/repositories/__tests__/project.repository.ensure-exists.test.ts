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

  it("returns existing project without rewriting it", async () => {
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

    const findByIdSpy = jest
      .spyOn(repo, "findById")
      .mockResolvedValue(existingProject as any);
    const getClientSpy = jest.spyOn(repo as any, "getClient");

    const result = await repo.ensureExists("project-1", "Fallback Name");

    expect(result?.name).toBe("Existing Name");
    expect(findByIdSpy).toHaveBeenCalledWith("project-1");
    expect(getClientSpy).not.toHaveBeenCalled();
    expect(mockClient.from).not.toHaveBeenCalled();
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

    jest.spyOn(repo, "findById").mockResolvedValue(null as any);
    jest.spyOn(repo as any, "getClient").mockResolvedValue(mockClient as any);

    const single = jest.fn().mockResolvedValue({
      data: insertedProject,
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockClient.from.mockReturnValue({ insert });

    const result = await repo.ensureExists("project-2", "Fallback Name");

    expect(result?.name).toBe("Fallback Name");
    expect(mockClient.from).toHaveBeenCalledWith("projects");
    expect(insert).toHaveBeenCalled();
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

    jest
      .spyOn(repo, "findById")
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce(existingProject as any);
    jest.spyOn(repo as any, "getClient").mockResolvedValue(mockClient as any);

    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockClient.from.mockReturnValue({ insert });

    const result = await repo.ensureExists("project-3", "Fallback Name");

    expect(result?.name).toBe("Winner Name");
    expect(insert).toHaveBeenCalled();
  });
});
