"use client";

import {
  Message as AIMessage,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import type { ToolUIPart } from "ai";
import { Task, TaskContent } from "@/components/ai-elements/task";
import {
  File as FileIcon,
  Pencil,
  FileText,
  Search,
  Terminal,
  Wrench,
  FileX,
  type LucideProps,
} from "lucide-react";
import {
  Confirmation,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";

// Tool approval helpers
const TOOL_LABELS: Record<string, string> = {
  syncProject: "Sync project files to database",
  runCommand: "Run shell command",
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || toolName;
}

function getInputSummary(
  toolName: string,
  input?: Record<string, unknown>,
): string | null {
  if (!input) return null;
  if (toolName === "runCommand" && typeof input.command === "string") {
    return input.command;
  }
  if (toolName === "syncProject") {
    return "Persist all files to cloud storage";
  }
  return null;
}

/** Converts an absolute path to a relative display path. */
function toRelativePath(filePath: string): string {
  let path = filePath.replace(/^\/+/, "");
  const prefixesToStrip = ["home/user/", "home/", "app/", "src/"];
  for (const prefix of prefixesToStrip) {
    if (path.startsWith(prefix)) {
      path = path.slice(prefix.length);
      break;
    }
  }
  return path || filePath;
}

// Local types matching what's used in chat-panel currently
export interface TextPart {
  type: "text";
  text: string;
}

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "approval-requested";

export interface ToolPart {
  type: string;
  state?: ToolState;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | string;
  errorText?: string;
  toolCallId?: string;
  [key: string]: unknown;
}

export type MessagePart = TextPart | ToolPart;

// Tool action types and mapping
type ToolAction =
  | "Edited"
  | "Created"
  | "Read"
  | "Deleted"
  | "Generated"
  | "Searched"
  | "Executed";

const TOOL_ACTION_MAP: Record<string, ToolAction> = {
  writeFile: "Created",
  createFile: "Created",
  batchWriteFiles: "Generated",
  editFile: "Edited",
  readFile: "Read",
  getProjectStructure: "Searched",
  analyzeProjectState: "Searched",
  runCommand: "Executed",
  executeCode: "Executed",
  installPackage: "Executed",
  installDependencies: "Executed",
  getBuildStatus: "Generated",
  planChanges: "Generated",
  markStepComplete: "Generated",
};

function getToolAction(toolName: string): ToolAction {
  return TOOL_ACTION_MAP[toolName] || "Executed";
}

const TOOL_ACTION_ICONS: Record<ToolAction, React.ComponentType<LucideProps>> = {
  Created: FileIcon,
  Edited: Pencil,
  Read: FileText,
  Searched: Search,
  Executed: Terminal,
  Generated: Wrench,
  Deleted: FileX,
};

function ToolActionIcon({ action, ...props }: { action: ToolAction } & LucideProps) {
  const Icon = TOOL_ACTION_ICONS[action] ?? Wrench;
  return <Icon {...props} />;
}

interface TimelineRow {
  action: ToolAction;
  filePath: string;
}

function extractFilePath(
  toolName: string,
  input?: Record<string, unknown>,
): string {
  if (input?.path) return String(input.path);
  if (input?.name) return String(input.name);
  if (input?.command) return String(input.command).slice(0, 50);
  return toolName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function normalizeBatchPath(path: string, baseDir?: string): string {
  const cleanPath = path.replace(/^\/+/, "");

  if (
    cleanPath.startsWith("app/") ||
    cleanPath.startsWith("src/") ||
    cleanPath.startsWith("components/") ||
    cleanPath.startsWith("lib/") ||
    cleanPath.startsWith("public/") ||
    cleanPath.startsWith("styles/") ||
    cleanPath.startsWith("hooks/")
  ) {
    return cleanPath;
  }

  const resolvedBaseDir =
    typeof baseDir === "string" && baseDir.trim().length > 0 ? baseDir : "app";
  return `${resolvedBaseDir}/${cleanPath}`;
}

function toPathSet(paths: string[], baseDir?: string): Set<string> {
  const set = new Set<string>();
  for (const path of paths) {
    set.add(path);
    set.add(normalizeBatchPath(path, baseDir));
  }
  return set;
}

function getBatchAction(
  relativePath: string,
  declaredAction: unknown,
  createdSet: Set<string>,
  updatedSet: Set<string>,
  skippedSet: Set<string>,
): ToolAction {
  if (createdSet.has(relativePath)) return "Created";
  if (updatedSet.has(relativePath)) return "Edited";
  if (skippedSet.has(relativePath)) return "Read";
  if (declaredAction === "update") return "Edited";
  return "Created";
}

function safeStringify(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractToolContent(
  toolName: string,
  input?: Record<string, unknown>,
  output?: Record<string, unknown> | string,
  errorText?: string,
): string | undefined {
  if (toolName === "writeFile" && typeof input?.content === "string") {
    return input.content;
  }

  if (toolName === "editFile" && typeof input?.replace === "string") {
    return input.replace;
  }

  if (typeof output === "string") return output;
  if (!output) return errorText;

  const selectedValue =
    output.diff ??
    output.content ??
    output.result ??
    output.stdout ??
    output.stderr ??
    output.message;

  if (typeof selectedValue === "string") {
    return selectedValue;
  }

  return safeStringify(output) ?? errorText;
}

interface ExpandedToolRow {
  action: ToolAction;
  filePath: string;
  content?: string;
}

function expandBatchWriteToolPart(toolPart: ToolPart): ExpandedToolRow[] {
  if (!isRecord(toolPart.input)) return [];
  const files = Array.isArray(toolPart.input.files) ? toolPart.input.files : [];
  if (files.length === 0) return [];

  const baseDir =
    typeof toolPart.input.baseDir === "string" ? toolPart.input.baseDir : "app";

  const output = isRecord(toolPart.output) ? toolPart.output : {};
  const createdSet = toPathSet(toStringArray(output.created), baseDir);
  const updatedSet = toPathSet(toStringArray(output.updated), baseDir);
  const skippedSet = toPathSet(toStringArray(output.skipped), baseDir);

  const rows: ExpandedToolRow[] = [];
  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string") continue;
    const filePath = normalizeBatchPath(file.path, baseDir);
    rows.push({
      action: getBatchAction(
        filePath,
        file.action,
        createdSet,
        updatedSet,
        skippedSet,
      ),
      filePath,
      content: typeof file.content === "string" ? file.content : undefined,
    });
  }

  const failedItems = Array.isArray(output.failed) ? output.failed : [];
  for (const failed of failedItems) {
    if (!isRecord(failed) || typeof failed.path !== "string") continue;
    rows.push({
      action: "Executed",
      filePath: normalizeBatchPath(failed.path, baseDir),
      content: safeStringify(failed),
    });
  }

  if (isRecord(toolPart.output)) {
    rows.push({
      action: "Generated",
      filePath: "batchWriteFiles/result.json",
      content: safeStringify(toolPart.output),
    });
  }

  return rows;
}

interface MessageProps {
  role: "user" | "assistant" | "system" | "data";
  content?: string;
  parts?: MessagePart[];
  isStreaming?: boolean;
  /** @deprecated Reasoning is now extracted from parts inline. Kept for API compat. */
  thinkingTime?: number;
  /** @deprecated Reasoning is now extracted from parts inline. Kept for API compat. */
  thinkingContent?: string;
  /** Callback to approve a tool call (tool approval flow) */
  onToolApprove?: (toolCallId: string) => void;
  /** Callback to deny a tool call (tool approval flow) */
  onToolDeny?: (toolCallId: string) => void;
}

export function Message({
  role,
  content,
  parts,
  isStreaming = false,
  onToolApprove,
  onToolDeny,
}: MessageProps) {
  if (role === "user") {
    return (
      <AIMessage from="user">
        <MessageContent className="max-w-[85%] rounded-2xl bg-zinc-800/80 px-4 py-2.5 text-sm text-zinc-100 shadow-sm backdrop-blur-sm">
          {parts ? (
            parts.map((part, i) =>
              part.type === "text" ? (
                <span key={i}>{(part as TextPart).text}</span>
              ) : null,
            )
          ) : (
            <span>{content}</span>
          )}
        </MessageContent>
      </AIMessage>
    );
  }

  // Assistant Message
  return (
    <AIMessage from="assistant">
      <MessageContent>
        {parts ? (
          <AssistantMessageParts
            parts={parts}
            isStreaming={isStreaming}
            onToolApprove={onToolApprove}
            onToolDeny={onToolDeny}
          />
        ) : (
          <MessageResponse>{content || ""}</MessageResponse>
        )}
      </MessageContent>
    </AIMessage>
  );
}

// Planning tool types that render in the floating checklist, not inline
const PLAN_TOOL_NAMES = new Set(["planChanges", "markStepComplete"]);

interface ReasoningRow {
  text: string;
  isStreaming: boolean;
}

function AssistantMessageParts({
  parts,
  isStreaming,
  onToolApprove,
  onToolDeny,
}: {
  parts: MessagePart[];
  isStreaming: boolean;
  onToolApprove?: (toolCallId: string) => void;
  onToolDeny?: (toolCallId: string) => void;
}) {
  const elements: React.ReactNode[] = [];
  let currentToolGroup: TimelineRow[] = [];
  let currentReasoningGroup: ReasoningRow[] = [];
  let groupKey = 0;

  function flushToolGroup() {
    if (currentToolGroup.length === 0) return;
    const rows = [...currentToolGroup];
    const key = groupKey++;
    elements.push(
      <Task key={`group-${key}`} defaultOpen>
        <TaskContent>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 text-sm">
              <ToolActionIcon
                action={row.action}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="font-medium">{row.action}</span>
              <span className="truncate text-muted-foreground">
                · {toRelativePath(row.filePath)}
              </span>
            </div>
          ))}
        </TaskContent>
      </Task>,
    );
    currentToolGroup = [];
  }

  function flushReasoningGroup() {
    if (currentReasoningGroup.length === 0) return;
    const rows = [...currentReasoningGroup];
    const key = groupKey++;
    const combinedText = rows.map((r) => r.text).join("\n\n");
    const isAnyStreaming = rows.some((r) => r.isStreaming);
    elements.push(
      <Reasoning key={`reasoning-${key}`} isStreaming={isAnyStreaming} defaultOpen={false}>
        <ReasoningTrigger />
        {combinedText && (
          <ReasoningContent>{combinedText}</ReasoningContent>
        )}
      </Reasoning>,
    );
    currentReasoningGroup = [];
  }

  function flushAll() {
    flushReasoningGroup();
    flushToolGroup();
  }

  parts.forEach((part, index) => {
    // Reasoning parts — render inline as collapsible blocks
    if (part.type === "reasoning") {
      flushToolGroup();
      const rp = part as unknown as { text: string; state?: string };
      currentReasoningGroup.push({
        text: rp.text,
        isStreaming: rp.state === "streaming",
      });
      return;
    }

    if (part.type === "text") {
      if (!(part as TextPart).text.trim()) return;
      flushAll();
      elements.push(
        <div key={`text-${index}`} className="px-1">
          <MessageResponse>{(part as TextPart).text}</MessageResponse>
        </div>,
      );
    } else if (part.type.startsWith("tool-")) {
      flushReasoningGroup();
      const toolPart = part as ToolPart;
      const toolName = toolPart.type.replace("tool-", "");

      // Planning tools render in the floating checklist above the input, skip inline
      if (PLAN_TOOL_NAMES.has(toolName)) return;

      // Show approval UI for tools awaiting user confirmation — breaks the group
      if (
        toolPart.state === "approval-requested" &&
        toolPart.toolCallId &&
        onToolApprove &&
        onToolDeny
      ) {
        flushToolGroup();
        const summary = getInputSummary(toolName, toolPart.input);
        elements.push(
          <Confirmation
            key={`approval-${index}`}
            approval={{ id: toolPart.toolCallId }}
            state={toolPart.state as ToolUIPart["state"]}
          >
            <ConfirmationRequest>
              <div className="flex flex-col gap-0.5">
                <p className="font-medium text-sm">{getToolLabel(toolName)}</p>
                {summary && (
                  <p className="text-xs font-mono text-muted-foreground">
                    {summary}
                  </p>
                )}
              </div>
            </ConfirmationRequest>
            <ConfirmationAccepted>Approved</ConfirmationAccepted>
            <ConfirmationRejected>Denied</ConfirmationRejected>
            <ConfirmationActions>
              <ConfirmationAction
                variant="outline"
                onClick={() => onToolDeny(toolPart.toolCallId!)}
              >
                Deny
              </ConfirmationAction>
              <ConfirmationAction
                onClick={() => onToolApprove(toolPart.toolCallId!)}
              >
                Approve
              </ConfirmationAction>
            </ConfirmationActions>
          </Confirmation>,
        );
        return;
      }

      // Accumulate tool rows into the current timeline group
      if (toolName === "batchWriteFiles") {
        const expandedRows = expandBatchWriteToolPart(toolPart);
        for (const row of expandedRows) {
          // Skip the JSON summary row — only show individual file rows
          if (row.filePath === "batchWriteFiles/result.json") continue;
          currentToolGroup.push({ action: row.action, filePath: row.filePath });
        }
        // Fallback when no files could be expanded
        if (expandedRows.filter((r) => r.filePath !== "batchWriteFiles/result.json").length === 0) {
          currentToolGroup.push({
            action: getToolAction(toolName),
            filePath: extractFilePath(toolName, toolPart.input),
          });
        }
      } else {
        currentToolGroup.push({
          action: getToolAction(toolName),
          filePath: extractFilePath(toolName, toolPart.input),
        });
      }
    }
  });

  flushAll();
  return <>{elements}</>;
}
