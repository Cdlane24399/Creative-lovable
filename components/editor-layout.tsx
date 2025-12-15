"use client"

import { useState } from "react"
import { ChatPanel } from "./chat-panel"
import { PreviewPanel } from "./preview-panel"
import { EditorHeader } from "./editor-header"

interface EditorLayoutProps {
  onNavigateHome?: () => void
  projectId?: string
  initialPrompt?: string | null
}

export function EditorLayout({ onNavigateHome, projectId, initialPrompt }: EditorLayoutProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)

  return (
    <div className="flex h-screen w-full flex-col bg-[#111111]">
      {/* Header */}
      <EditorHeader onNavigateHome={onNavigateHome} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Chat UI */}
        <div className="flex w-[450px] flex-shrink-0 flex-col">
          <ChatPanel
            projectId={projectId}
            onPreviewUpdate={setPreviewContent}
            onSandboxUrlUpdate={setSandboxUrl}
            initialPrompt={initialPrompt}
          />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1">
          <PreviewPanel content={previewContent} sandboxUrl={sandboxUrl} />
        </div>
      </div>
    </div>
  )
}
