#!/usr/bin/env tsx

import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  deriveProjectNameFromPrompt,
  isPlaceholderProjectName,
} from "../../lib/ai/project-naming";

interface ProjectRow {
  id: string;
  name: string;
  screenshot_base64: string | null;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: unknown;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function loadRuntimeEnv(rootDir: string): void {
  loadEnv({ path: path.join(rootDir, ".env.local"), quiet: true });
  loadEnv({ path: path.join(rootDir, ".env"), override: false, quiet: true });
}

function parseParts(parts: unknown): Array<Record<string, unknown>> {
  if (!parts) return [];
  if (Array.isArray(parts)) return parts as Array<Record<string, unknown>>;
  if (typeof parts === "string") {
    try {
      const parsed = JSON.parse(parts) as unknown;
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getMessageText(message: MessageRow): string {
  const textFromParts = parseParts(message.parts)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("")
    .trim();
  return textFromParts || (message.content || "").trim();
}

function hasAssistantText(message: MessageRow): boolean {
  if (getMessageText(message)) return true;
  return false;
}

function buildAssistantFallbackText(messages: MessageRow[]): string {
  let createdFiles = 0;
  let updatedFiles = 0;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const parts = parseParts(message.parts);
    for (const part of parts) {
      if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
      if (part.state !== "output-available") continue;
      if (!part.output || typeof part.output !== "object") continue;

      const output = part.output as Record<string, unknown>;
      if (Array.isArray(output.created)) createdFiles += output.created.length;
      if (Array.isArray(output.updated)) updatedFiles += output.updated.length;
    }
  }

  if (createdFiles > 0 || updatedFiles > 0) {
    return `Completed the requested changes (${createdFiles} files created, ${updatedFiles} files updated).`;
  }

  return "Completed the requested changes and updated the project.";
}

function hasPngSignature(buffer: Buffer): boolean {
  if (buffer.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (buffer[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function hasInvalidPngScreenshot(base64Value: string | null): boolean {
  if (!base64Value) return false;
  if (!base64Value.startsWith("data:image/png;base64,")) return false;
  const bytes = Buffer.from(
    base64Value.slice("data:image/png;base64,".length),
    "base64",
  );
  return bytes.length < 100 || !hasPngSignature(bytes);
}

function createSvgPlaceholderDataUrl(projectName: string): string {
  const safeName = projectName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181B" />
      <stop offset="100%" stop-color="#09090B" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="220" y="180" width="760" height="270" rx="20" fill="#111827" stroke="#374151" />
  <text x="600" y="290" fill="#34D399" font-family="system-ui, sans-serif" font-size="36" text-anchor="middle" font-weight="700">Project Preview</text>
  <text x="600" y="350" fill="#E5E7EB" font-family="system-ui, sans-serif" font-size="30" text-anchor="middle">${safeName}</text>
  <text x="600" y="405" fill="#9CA3AF" font-family="system-ui, sans-serif" font-size="20" text-anchor="middle">Screenshot refresh pending</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

async function main() {
  const rootDir = path.resolve(__dirname, "../..");
  loadRuntimeEnv(rootDir);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.",
    );
  }

  const projectIdArg = process.argv[2];
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const baseQuery = supabase
    .from("projects")
    .select("id,name,screenshot_base64,updated_at");

  const projectResult = projectIdArg
    ? await baseQuery.eq("id", projectIdArg).maybeSingle()
    : await baseQuery.order("updated_at", { ascending: false }).limit(1).maybeSingle();

  if (projectResult.error) throw projectResult.error;
  const project = (projectResult.data as ProjectRow | null) ?? null;
  if (!project) {
    console.log("No project found to repair.");
    return;
  }

  const { data: messageRows, error: messagesError } = await supabase
    .from("messages")
    .select("id,role,content,parts")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true })
    .limit(20);
  if (messagesError) throw messagesError;
  const messages = (messageRows ?? []) as MessageRow[];

  const latestUser = messages.find((message) => message.role === "user");
  const latestUserText = latestUser ? getMessageText(latestUser) : "";
  const derivedName = latestUserText
    ? deriveProjectNameFromPrompt(latestUserText, "Untitled Project")
    : "Untitled Project";

  const updates: Record<string, unknown> = {};
  let appliedNameFix = false;
  let appliedScreenshotFix = false;
  let appliedAssistantTextFix = false;

  if (isPlaceholderProjectName(project.name, project.id) && latestUserText) {
    updates.name = derivedName;
    appliedNameFix = true;
  }

  const targetName =
    (updates.name as string | undefined) ||
    (isPlaceholderProjectName(project.name, project.id) ? derivedName : project.name);
  if (hasInvalidPngScreenshot(project.screenshot_base64) || !project.screenshot_base64) {
    updates.screenshot_base64 = createSvgPlaceholderDataUrl(targetName);
    appliedScreenshotFix = true;
  }

  if (Object.keys(updates).length === 0) {
    // Continue below: message repair may still be needed.
  } else {
    updates.updated_at = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", project.id);
    if (updateError) throw updateError;
  }

  const latestAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  if (latestAssistant && !hasAssistantText(latestAssistant)) {
    const fallbackText = buildAssistantFallbackText(messages);
    const existingParts = parseParts(latestAssistant.parts);
    const nextParts = [...existingParts, { type: "text", text: fallbackText }];
    const { error: messageUpdateError } = await supabase
      .from("messages")
      .update({
        content: fallbackText,
        parts: nextParts,
      })
      .eq("id", latestAssistant.id);
    if (messageUpdateError) throw messageUpdateError;
    appliedAssistantTextFix = true;
  }

  if (!appliedNameFix && !appliedScreenshotFix && !appliedAssistantTextFix) {
    console.log(`No repair needed for project ${project.id}.`);
    return;
  }

  console.log(`Repaired project ${project.id}`);
  if (appliedNameFix) {
    console.log(`- Updated placeholder name -> ${derivedName}`);
  }
  if (appliedScreenshotFix) {
    console.log(`- Stored valid SVG placeholder screenshot`);
  }
  if (appliedAssistantTextFix) {
    console.log(`- Backfilled missing assistant text in latest message`);
  }
}

main().catch((error) => {
  console.error("Failed to repair latest run metadata:", error);
  process.exitCode = 1;
});
