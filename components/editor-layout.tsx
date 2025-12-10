"use client"

import { useState } from "react"
import { ChatPanel } from "./chat-panel"
import { PreviewPanel } from "./preview-panel"
import { EditorHeader } from "./editor-header"
import type { ModelProvider } from "@/lib/ai/agent"

interface EditorLayoutProps {
  onNavigateHome?: () => void
  projectId?: string
  initialPrompt?: string
  initialModel?: ModelProvider
}

export function EditorLayout({ onNavigateHome, projectId, initialPrompt, initialModel }: EditorLayoutProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 flex flex-col bg-[#111111] overflow-hidden">
      <EditorHeader onNavigateHome={onNavigateHome} />

      {/* Main content area - flex row, no overflow */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Chat UI */}
        <div className="w-[450px] flex-shrink-0 min-h-0 flex flex-col">
          <ChatPanel
            projectId={projectId}
            onPreviewUpdate={setPreviewContent}
            initialPrompt={initialPrompt}
            initialModel={initialModel}
          />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 min-h-0">
          <PreviewPanel content={previewContent} />
        </div>
      </div>
    </div>
  )
}
