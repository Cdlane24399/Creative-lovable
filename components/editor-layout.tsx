"use client";

import { ChatPanel } from "./chat-panel";
import { PreviewPanel } from "./preview-panel";
import { EditorHeader } from "./editor-header";
import {
  EditorProvider,
  useEditor,
} from "@/components/contexts/editor-context";
import { type ModelProvider } from "@/lib/ai/agent";

interface EditorLayoutProps {
  onNavigateHome?: () => void;
  projectId?: string;
  initialPrompt?: string | null;
  initialModel?: ModelProvider;
}

export function EditorLayout({
  onNavigateHome,
  projectId,
  initialPrompt,
  initialModel,
}: EditorLayoutProps) {
  return (
    <EditorProvider
      projectId={projectId}
      initialPrompt={initialPrompt}
      initialModel={initialModel}
      onNavigateHome={onNavigateHome}
    >
      <EditorLayoutShell />
    </EditorProvider>
  );
}

/**
 * Thin layout shell -- all state comes from EditorContext.
 * Children (EditorHeader, ChatPanel, PreviewPanel) consume
 * context directly via useEditor(), eliminating prop drilling.
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
          <ChatPanel ref={meta.chatRef} />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1">
          <PreviewPanel ref={meta.previewRef} />
        </div>
      </div>
    </div>
  );
}
