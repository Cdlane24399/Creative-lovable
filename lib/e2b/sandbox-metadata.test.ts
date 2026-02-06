import { buildSandboxMetadata } from "@/lib/e2b/sandbox-metadata"

describe("buildSandboxMetadata", () => {
  it("returns only string values and includes required keys", () => {
    const now = new Date("2026-02-06T12:00:00.000Z")
    const metadata = buildSandboxMetadata(
      {
        projectId: "proj-123",
        purpose: "website",
        template: "tpl-abc",
      },
      now
    )

    expect(metadata).toEqual({
      projectId: "proj-123",
      purpose: "website",
      template: "tpl-abc",
      createdAtIso: "2026-02-06T12:00:00.000Z",
    })

    for (const value of Object.values(metadata)) {
      expect(typeof value).toBe("string")
    }
  })

  it("omits template when undefined", () => {
    const metadata = buildSandboxMetadata({
      projectId: "proj-456",
      purpose: "code-execution",
    })

    expect(metadata.projectId).toBe("proj-456")
    expect(metadata.purpose).toBe("code-execution")
    expect(metadata.template).toBeUndefined()
    expect(typeof metadata.createdAtIso).toBe("string")
  })
})
