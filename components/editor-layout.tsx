"use client"

import { useState } from "react"
import { ChatPanel } from "./chat-panel"
import { PreviewPanel } from "./preview-panel"
import { EditorHeader } from "./editor-header"

interface EditorLayoutProps {
  onNavigateHome?: () => void
  projectId?: string
}

export function EditorLayout({ onNavigateHome, projectId }: EditorLayoutProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null)

  return (
    <div className="flex h-screen w-full flex-col bg-[#111111]">
      <EditorHeader onNavigateHome={onNavigateHome} />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Chat UI */}
        <div className="flex w-[450px] flex-shrink-0 flex-col">
          <ChatPanel projectId={projectId} onPreviewUpdate={setPreviewContent} />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1">
          <PreviewPanel content={previewContent} />
        </div>
      </div>
    </div>
  )
}
