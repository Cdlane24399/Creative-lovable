import { parseToolOutputs } from "@/lib/parsers/tool-outputs"

describe("parseToolOutputs", () => {
  it("extracts filesReady info when success is omitted", () => {
    const processedIds = new Set<string>()
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-writeFile",
            toolCallId: "t1",
            state: "output-available",
            output: {
              filesReady: true,
              projectName: "demo-project",
              sandboxId: "sandbox-123",
            },
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.filesReadyInfo).toEqual({
      projectName: "demo-project",
      sandboxId: "sandbox-123",
    })
    expect(processedIds.has("t1")).toBe(true)
  })

  it("ignores tool outputs that explicitly fail", () => {
    const processedIds = new Set<string>()
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-writeFile",
            toolCallId: "t1",
            state: "output-available",
            output: {
              success: false,
              filesReady: true,
              projectName: "should-not-be-used",
            },
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.filesReadyInfo).toBeNull()
    expect(processedIds.size).toBe(0)
  })

  it("extracts preview URL from JSON string output", () => {
    const processedIds = new Set<string>()
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-runCommand",
            toolCallId: "t1",
            state: "output-available",
            output: JSON.stringify({
              previewUrl: "https://3000-sandboxid.e2b.app",
            }),
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.latestPreviewUrl).toBe("https://3000-sandboxid.e2b.app")
  })

  it("normalizes host-only preview URLs to https", () => {
    const processedIds = new Set<string>()
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-runCommand",
            toolCallId: "t1",
            state: "output-available",
            output: {
              previewUrl: "3000-sandboxid.e2b.app",
            },
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.latestPreviewUrl).toBe("https://3000-sandboxid.e2b.app")
  })

  it("normalizes localhost preview URLs to http", () => {
    const processedIds = new Set<string>()
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-runCommand",
            toolCallId: "t1",
            state: "output-available",
            output: {
              previewUrl: "localhost:3000",
            },
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.latestPreviewUrl).toBe("http://localhost:3000")
  })

  it("ignores invalid preview URLs", () => {
    const processedIds = new Set<string>()
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-runCommand",
            toolCallId: "t1",
            state: "output-available",
            output: {
              previewUrl: "https://hello-world-test.lovable.app",
            },
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.latestPreviewUrl).toBeNull()
  })

  it("ignores generic url field even when present", () => {
    const processedIds = new Set<string>()
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-runCommand",
            toolCallId: "t1",
            state: "output-available",
            output: {
              url: "https://3000-sandboxid.e2b.app",
            },
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.latestPreviewUrl).toBeNull()
  })
})
