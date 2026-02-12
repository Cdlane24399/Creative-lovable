import type { UIMessage } from "ai";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERIC_PLACEHOLDERS = new Set([
  "untitled project",
  "project",
  "new project",
  "my project",
  "app",
  "website",
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string): string {
  return normalizeWhitespace(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function truncateProjectName(value: string, maxLength: number = 50): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

export function isPlaceholderProjectName(
  name: string | null | undefined,
  projectId?: string | null,
): boolean {
  if (!name) return true;

  const normalized = normalizeWhitespace(name);
  const lowered = normalized.toLowerCase();

  if (!normalized) return true;
  if (UUID_REGEX.test(normalized)) return true;
  if (projectId && normalized === projectId) return true;
  if (GENERIC_PLACEHOLDERS.has(lowered)) return true;
  if (/^project[-_\s]*\d*$/i.test(normalized)) return true;

  return false;
}

export function deriveProjectNameFromPrompt(
  prompt: string | null | undefined,
  fallback: string = "Untitled Project",
): string {
  if (!prompt || !prompt.trim()) return fallback;

  const input = normalizeWhitespace(prompt);

  const patterns = [
    /(?:create|build|make|design|generate)\s+(?:a|an|the)?\s*(.+?)\s+(?:website|web app|app|landing page|dashboard|site)\b/i,
    /(?:for|about)\s+(.+?)(?:\s|$)/i,
    /(.+?)\s+(?:website|web app|app|landing page|dashboard|site)\b/i,
  ];

  let candidate: string | null = null;
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) {
      candidate = match[1];
      break;
    }
  }

  if (!candidate) {
    candidate = input.split(" ").slice(0, 4).join(" ");
  }

  const cleaned = candidate
    .replace(/^(?:please\s+)?(?:me\s+)?/i, "")
    .replace(/^(?:for me\s+)?/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/^[^a-z0-9]+/i, "")
    .replace(/[^a-z0-9\s-]+/gi, " ")
    .replace(/\b(?:a|an|the)\b\s*$/i, "");

  const titled = truncateProjectName(toTitleCase(cleaned));
  return isPlaceholderProjectName(titled) ? fallback : titled;
}

export function deriveProjectNameFromMessages(
  messages: UIMessage[],
  fallback: string = "Untitled Project",
): string {
  for (const message of messages) {
    if (message.role !== "user") continue;

    const text = normalizeWhitespace(
      message.parts
        ?.filter((part) => part.type === "text")
        .map((part) => ("text" in part ? (part as { text: string }).text : ""))
        .join(" ") || "",
    );

    if (!text) continue;
    return deriveProjectNameFromPrompt(text, fallback);
  }

  return fallback;
}
