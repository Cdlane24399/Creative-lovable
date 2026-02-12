import type { UIMessage } from "ai";

function hasTextContent(message: UIMessage): boolean {
  return Boolean(
    message.parts?.some(
      (part) =>
        part.type === "text" &&
        "text" in part &&
        typeof (part as { text?: string }).text === "string" &&
        ((part as { text?: string }).text || "").trim().length > 0,
    ),
  );
}

export function buildFallbackAssistantText(messages: UIMessage[]): string {
  let createdFiles = 0;
  let updatedFiles = 0;

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    for (const part of message.parts || []) {
      if (!part.type.startsWith("tool-")) continue;
      if (!("state" in part) || part.state !== "output-available") continue;
      if (!("output" in part)) continue;

      const output = part.output;
      if (!output || typeof output !== "object") continue;

      const created =
        "created" in output && Array.isArray(output.created)
          ? output.created.length
          : 0;
      const updated =
        "updated" in output && Array.isArray(output.updated)
          ? output.updated.length
          : 0;

      createdFiles += created;
      updatedFiles += updated;

      if ("message" in output && typeof output.message === "string") {
        const message = output.message.toLowerCase();
        if (message.includes("file created:")) {
          createdFiles += 1;
        }
        if (message.includes("file updated:")) {
          updatedFiles += 1;
        }
      }
    }
  }

  if (createdFiles > 0 || updatedFiles > 0) {
    return `Completed the requested changes (${createdFiles} files created, ${updatedFiles} files updated).`;
  }

  return "Completed the requested changes and updated the project.";
}

export function ensureAssistantText(messages: UIMessage[]): UIMessage[] {
  const lastAssistantIndex = [...messages]
    .reverse()
    .findIndex((message) => message.role === "assistant");

  if (lastAssistantIndex === -1) return messages;

  const targetIndex = messages.length - 1 - lastAssistantIndex;
  const targetMessage = messages[targetIndex];
  if (hasTextContent(targetMessage)) return messages;

  const fallbackText = buildFallbackAssistantText(messages);
  const updatedMessages = [...messages];
  updatedMessages[targetIndex] = {
    ...targetMessage,
    parts: [...(targetMessage.parts || []), { type: "text", text: fallbackText }],
  };

  return updatedMessages;
}
