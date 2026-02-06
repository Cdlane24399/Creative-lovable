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
              previewUrl: "https://example.test",
            }),
          },
        ],
      },
    ] as any

    const result = parseToolOutputs(messages, processedIds)
    expect(result.latestPreviewUrl).toBe("https://example.test")
  })
})
