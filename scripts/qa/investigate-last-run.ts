#!/usr/bin/env tsx

import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  deriveProjectNameFromPrompt,
  isPlaceholderProjectName,
} from "../../lib/ai/project-naming";
import { MODEL_SETTINGS } from "../../lib/ai/agent";

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  sandbox_id: string | null;
  sandbox_url: string | null;
  screenshot_base64: string | null;
  screenshot_url: string | null;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  created_at: string;
  content: string;
  parts: unknown;
}

interface TokenUsageRow {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
  step_number: number | null;
  timestamp: string;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function loadRuntimeEnv(rootDir: string): void {
  loadEnv({ path: path.join(rootDir, ".env.local"), quiet: true });
  loadEnv({ path: path.join(rootDir, ".env"), override: false, quiet: true });
}

function assertRequiredEnv(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing required env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local.",
    );
  }

  return { supabaseUrl, serviceRoleKey };
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
  const partText = parseParts(message.parts)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("")
    .trim();
  if (partText.length > 0) return partText;
  return (message.content || "").trim();
}

function formatMs(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) return "n/a";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function hasPngSignature(data: Buffer): boolean {
  if (data.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (data[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function analyzeTokenRuns(rows: TokenUsageRow[]): {
  latestRunDurationMs: number | null;
  latestRunRecords: number;
  latestRunTokens: number;
} {
  if (rows.length === 0) {
    return { latestRunDurationMs: null, latestRunRecords: 0, latestRunTokens: 0 };
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const runs: TokenUsageRow[][] = [];
  let current: TokenUsageRow[] = [];

  for (const row of sorted) {
    const prev = current[current.length - 1];
    if (!prev) {
      current.push(row);
      continue;
    }

    const gapMs =
      new Date(row.timestamp).getTime() - new Date(prev.timestamp).getTime();
    const prevStep = prev.step_number ?? 0;
    const nextStep = row.step_number ?? 0;
    const stepReset =
      (nextStep === 1 && prevStep > 0) || (nextStep > 0 && prevStep > 0 && nextStep < prevStep);
    const longGap = gapMs > 5 * 60 * 1000;

    if (stepReset || longGap) {
      runs.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }

  if (current.length > 0) {
    runs.push(current);
  }

  const latest = runs[runs.length - 1] || [];
  if (latest.length === 0) {
    return { latestRunDurationMs: null, latestRunRecords: 0, latestRunTokens: 0 };
  }

  const start = new Date(latest[0].timestamp).getTime();
  const end = new Date(latest[latest.length - 1].timestamp).getTime();
  const latestRunTokens = latest.reduce((sum, row) => sum + (row.total_tokens || 0), 0);

  return {
    latestRunDurationMs: Math.max(0, end - start),
    latestRunRecords: latest.length,
    latestRunTokens,
  };
}

function analyzeScreenshot(project: ProjectRow): {
  status: string;
  detail: string;
} {
  if (project.screenshot_url) {
    return { status: "remote", detail: "screenshot_url is set" };
  }

  if (!project.screenshot_base64) {
    return { status: "missing", detail: "No screenshot data stored" };
  }

  if (project.screenshot_base64.startsWith("data:image/png;base64,")) {
    const data = Buffer.from(
      project.screenshot_base64.replace("data:image/png;base64,", ""),
      "base64",
    );
    if (!hasPngSignature(data)) {
      return { status: "invalid", detail: "PNG base64 exists but signature is invalid" };
    }
    return { status: "ok", detail: `Valid PNG (${data.length} bytes)` };
  }

  if (project.screenshot_base64.startsWith("data:image/svg+xml;base64,")) {
    return { status: "placeholder", detail: "SVG placeholder screenshot stored" };
  }

  return { status: "unknown", detail: "Unsupported screenshot mime type" };
}

function findLatestTurnLatency(messages: MessageRow[]): number | null {
  const lastUserIndex = [...messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.role === "user")?.index;

  if (lastUserIndex === undefined) return null;
  const userTimestamp = new Date(messages[lastUserIndex].created_at).getTime();
  const firstAssistantAfter = messages
    .slice(lastUserIndex + 1)
    .find((message) => message.role === "assistant");

  if (!firstAssistantAfter) return null;

  return (
    new Date(firstAssistantAfter.created_at).getTime() -
    userTimestamp
  );
}

async function main() {
  const rootDir = path.resolve(__dirname, "../..");
  loadRuntimeEnv(rootDir);
  const { supabaseUrl, serviceRoleKey } = assertRequiredEnv();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const explicitProjectId = process.argv[2];

  let project: ProjectRow | null = null;
  if (explicitProjectId) {
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,name,created_at,updated_at,sandbox_id,sandbox_url,screenshot_base64,screenshot_url",
      )
      .eq("id", explicitProjectId)
      .maybeSingle();
    if (error) throw error;
    project = (data as ProjectRow | null) ?? null;
  } else {
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,name,created_at,updated_at,sandbox_id,sandbox_url,screenshot_base64,screenshot_url",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    project = (data as ProjectRow | null) ?? null;
  }

  if (!project) {
    console.log("No projects found.");
    return;
  }

  const [{ data: messagesData, error: messagesError }, { data: tokenData, error: tokenError }] =
    await Promise.all([
      supabase
        .from("messages")
        .select("id,role,created_at,content,parts")
        .eq("project_id", project.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("token_usage")
        .select(
          "model,prompt_tokens,completion_tokens,total_tokens,cost_usd,step_number,timestamp",
        )
        .eq("project_id", project.id)
        .order("timestamp", { ascending: true }),
    ]);

  if (messagesError) throw messagesError;
  if (tokenError) throw tokenError;

  const messages = (messagesData ?? []) as MessageRow[];
  const tokenRows = (tokenData ?? []) as TokenUsageRow[];

  const totalPrompt = tokenRows.reduce((sum, row) => sum + (row.prompt_tokens || 0), 0);
  const totalCompletion = tokenRows.reduce(
    (sum, row) => sum + (row.completion_tokens || 0),
    0,
  );
  const totalTokens = tokenRows.reduce((sum, row) => sum + (row.total_tokens || 0), 0);
  const totalCostUsd = tokenRows.reduce((sum, row) => sum + (row.cost_usd || 0), 0);

  const modelSummary = new Map<
    string,
    { records: number; tokens: number; costUsd: number }
  >();
  for (const row of tokenRows) {
    const key = row.model || "unknown";
    const current = modelSummary.get(key) ?? { records: 0, tokens: 0, costUsd: 0 };
    current.records += 1;
    current.tokens += row.total_tokens || 0;
    current.costUsd += row.cost_usd || 0;
    modelSummary.set(key, current);
  }

  const assistantMessages = messages.filter((message) => message.role === "assistant");
  let toolOutputErrors = 0;
  let toolFailureOutputs = 0;
  let assistantNoTextCount = 0;

  for (const message of assistantMessages) {
    const text = getMessageText(message);
    if (!text) assistantNoTextCount += 1;

    const parts = parseParts(message.parts);
    for (const part of parts) {
      if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
      if (part.state === "output-error") toolOutputErrors += 1;
      if (typeof part.errorText === "string" && part.errorText.trim()) toolOutputErrors += 1;
      if (part.output && typeof part.output === "object") {
        const output = part.output as Record<string, unknown>;
        if ("success" in output && output.success === false) {
          toolFailureOutputs += 1;
        }
      }
    }
  }

  const latestTurnLatencyMs = findLatestTurnLatency(messages);
  const tokenRunStats = analyzeTokenRuns(tokenRows);
  const durationLikelyCompressed =
    tokenRunStats.latestRunRecords > 1 &&
    tokenRunStats.latestRunDurationMs === 0;
  const messageLatencyLikelyUnavailable =
    latestTurnLatencyMs === 0 && messages.length <= 2;
  const dominantModel = [...modelSummary.entries()].sort(
    (a, b) => b[1].tokens - a[1].tokens,
  )[0]?.[0];
  const dominantModelMaxSteps =
    dominantModel && dominantModel in MODEL_SETTINGS
      ? MODEL_SETTINGS[dominantModel as keyof typeof MODEL_SETTINGS]?.maxSteps ?? null
      : null;
  const likelyStepLimitStop =
    typeof dominantModelMaxSteps === "number" &&
    dominantModelMaxSteps > 0 &&
    tokenRunStats.latestRunRecords >= dominantModelMaxSteps;
  const screenshot = analyzeScreenshot(project);
  const nameIsPlaceholder = isPlaceholderProjectName(project.name, project.id);
  const latestUserPrompt = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const latestUserText = latestUserPrompt ? getMessageText(latestUserPrompt) : "";
  const suggestedName = latestUserText
    ? deriveProjectNameFromPrompt(latestUserText, "Untitled Project")
    : "Untitled Project";

  console.log(`# Last Run Investigation`);
  console.log(`Project ID: ${project.id}`);
  console.log(`Project Name: ${project.name}`);
  console.log(`Created: ${project.created_at}`);
  console.log(`Updated: ${project.updated_at}`);
  console.log("");

  console.log("## Token Usage");
  console.log(`Records: ${tokenRows.length}`);
  console.log(`Prompt Tokens: ${totalPrompt}`);
  console.log(`Completion Tokens: ${totalCompletion}`);
  console.log(`Total Tokens: ${totalTokens}`);
  console.log(`Estimated Cost USD: ${totalCostUsd.toFixed(6)}`);
  console.log(
    `Latest Run (by step/gap segmentation): ${tokenRunStats.latestRunRecords} records, ${tokenRunStats.latestRunTokens} tokens, ${formatMs(tokenRunStats.latestRunDurationMs)}`,
  );
  if (likelyStepLimitStop) {
    console.log(
      `Likely early stop reason: step limit reached (${tokenRunStats.latestRunRecords}/${dominantModelMaxSteps} steps on ${dominantModel}).`,
    );
  }
  if (durationLikelyCompressed) {
    console.log(
      "Note: latest run duration appears compressed (legacy batch records had identical timestamps).",
    );
  }
  if (modelSummary.size > 0) {
    console.log("Model Breakdown:");
    for (const [model, summary] of [...modelSummary.entries()].sort(
      (a, b) => b[1].tokens - a[1].tokens,
    )) {
      console.log(
        `- ${model}: ${summary.records} records, ${summary.tokens} tokens, $${summary.costUsd.toFixed(6)}`,
      );
    }
  }
  console.log("");

  console.log("## Speed Signals");
  console.log(`Messages in project: ${messages.length}`);
  console.log(`Latest User -> Assistant Latency: ${formatMs(latestTurnLatencyMs)}`);
  if (messageLatencyLikelyUnavailable) {
    console.log(
      "Note: message-level latency is likely unavailable for this run (conversation persisted as a single batch with near-identical timestamps).",
    );
  }
  console.log("");

  console.log("## Error Signals");
  console.log(`Tool output-error count: ${toolOutputErrors}`);
  console.log(`Tool outputs with success=false: ${toolFailureOutputs}`);
  console.log(`Assistant messages without text: ${assistantNoTextCount}`);
  console.log("");

  console.log("## Screenshot Health");
  console.log(`Status: ${screenshot.status}`);
  console.log(`Detail: ${screenshot.detail}`);
  console.log("");

  console.log("## Auto Naming Health");
  console.log(`Placeholder-like name: ${nameIsPlaceholder ? "yes" : "no"}`);
  if (latestUserText) {
    console.log(`Latest user prompt snippet: ${latestUserText.slice(0, 140)}`);
    if (nameIsPlaceholder) {
      console.log(`Suggested name from prompt: ${suggestedName}`);
    }
  }
}

main().catch((error) => {
  console.error("Failed to investigate last run:", error);
  process.exitCode = 1;
});
