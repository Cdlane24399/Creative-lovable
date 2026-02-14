"use client";

import { ChatPanel } from "./chat-panel";
import { PreviewPanel } from "./preview-panel";
import { EditorHeader } from "./editor-header";
import { ErrorBoundary } from "./error-boundary";
import {
  EditorProvider,
  useEditor,
} from "@/components/contexts/editor-context";
import { type ModelProvider } from "@/lib/ai/agent";

interface EditorLayoutProps {
  projectId?: string;
  initialPrompt?: string | null;
  initialModel?: ModelProvider;
}

export function EditorLayout({
  projectId,
  initialPrompt,
  initialModel,
}: EditorLayoutProps) {
  return (
    <EditorProvider
      projectId={projectId}
      initialPrompt={initialPrompt}
      initialModel={initialModel}
    >
      <EditorLayoutShell />
    </EditorProvider>
  );
}

/**
 * Thin layout shell -- all state comes from EditorContext.
 * Children (EditorHeader, ChatPanel, PreviewPanel) consume
 * context directly via useEditor(), eliminating prop drilling.
 *
 * Each panel is wrapped in its own ErrorBoundary so a crash in one
 * does not take down the entire editor.
 */
function EditorLayoutShell() {
  const { meta } = useEditor();

  return (
    <div className="flex h-screen w-full flex-col bg-[#111111]">
      {/* Header */}
      <EditorHeader />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Chat UI */}
        <div className="flex w-[450px] flex-shrink-0 flex-col">
          <ErrorBoundary
            fallback={
              <div className="flex flex-1 items-center justify-center p-4 text-zinc-400 text-sm">
                Chat panel crashed. Click &ldquo;Try again&rdquo; to recover.
              </div>
            }
          >
            <ChatPanel ref={meta.chatRef} />
          </ErrorBoundary>
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1">
          <ErrorBoundary
            fallback={
              <div className="flex flex-1 items-center justify-center p-4 text-zinc-400 text-sm">
                Preview panel crashed. Click &ldquo;Try again&rdquo; to recover.
              </div>
            }
          >
            <PreviewPanel ref={meta.previewRef} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
