import type { UIMessage } from "ai";
import {
  buildFallbackAssistantText,
  ensureAssistantText,
} from "../chat-optimizations";

describe("chat-optimizations", () => {
  it("builds fallback assistant text from tool output file counts", () => {
    const messages = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-batchWriteFiles",
            toolCallId: "tool-1",
            input: {},
            state: "output-available",
            output: { created: ["app/page.tsx"], updated: ["app/layout.tsx"] },
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(buildFallbackAssistantText(messages)).toContain(
      "1 files created, 1 files updated",
    );
  });

  it("counts writeFile style message outputs in fallback text", () => {
    const messages = [
      {
        id: "a2",
        role: "assistant",
        parts: [
          {
            type: "tool-writeFile",
            toolCallId: "tool-3",
            input: {},
            state: "output-available",
            output: { success: true, message: "File created: app/page.tsx" },
          },
          {
            type: "tool-writeFile",
            toolCallId: "tool-4",
            input: {},
            state: "output-available",
            output: { success: true, message: "File updated: app/layout.tsx" },
          },
        ],
      },
    ] as unknown as UIMessage[];

    expect(buildFallbackAssistantText(messages)).toContain(
      "1 files created, 1 files updated",
    );
  });

  it("appends fallback text when last assistant message has no text", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "create app" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-batchWriteFiles",
            toolCallId: "tool-2",
            input: {},
            state: "output-available",
            output: { created: ["app/page.tsx"], updated: [] },
          },
        ],
      },
    ] as unknown as UIMessage[];

    const updated = ensureAssistantText(messages);
    const last = updated[updated.length - 1];
    const textPart = last.parts?.find(
      (part) => part.type === "text" && "text" in part,
    ) as { type: "text"; text: string } | undefined;

    expect(textPart?.text).toContain("Completed the requested changes");
  });
});
