import type { UIMessage } from "ai";
import {
  deriveProjectNameFromMessages,
  deriveProjectNameFromPrompt,
  isPlaceholderProjectName,
} from "@/lib/ai/project-naming";

function createUserMessage(text: string): UIMessage {
  return {
    id: "msg-1",
    role: "user",
    parts: [{ type: "text", text }],
  } as UIMessage;
}

describe("project naming helpers", () => {
  it("derives concise names from prompts", () => {
    expect(
      deriveProjectNameFromPrompt("build me a dog walker landing page"),
    ).toBe("Dog Walker");
  });

  it("falls back safely when prompt is empty", () => {
    expect(deriveProjectNameFromPrompt("")).toBe("Untitled Project");
  });

  it("detects placeholder project names", () => {
    expect(isPlaceholderProjectName("Untitled Project")).toBe(true);
    expect(
      isPlaceholderProjectName("73f8755f-8d54-4e32-9127-63940d507f92"),
    ).toBe(true);
    expect(
      isPlaceholderProjectName(
        "custom-id",
        "custom-id",
      ),
    ).toBe(true);
    expect(isPlaceholderProjectName("Coffee Shop Website")).toBe(false);
  });

  it("derives names from first user message", () => {
    const messages = [
      createUserMessage("Create a portfolio website for a photographer"),
    ];

    expect(deriveProjectNameFromMessages(messages)).toBe("Portfolio");
  });
});
