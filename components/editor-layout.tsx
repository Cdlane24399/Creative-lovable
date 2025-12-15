"use client"

import { useState, useRef } from "react"
import { ChatPanel } from "./chat-panel"
import { PreviewPanel, PreviewPanelHandle } from "./preview-panel"
import { EditorHeader } from "./editor-header"

interface EditorLayoutProps {
  onNavigateHome?: () => void
  projectId?: string
  initialPrompt?: string | null
}

export function EditorLayout({ onNavigateHome, projectId, initialPrompt }: EditorLayoutProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const previewRef = useRef<PreviewPanelHandle>(null)

  const handleRefresh = () => {
    if (previewRef.current) {
      previewRef.current.refresh()
      setIsPreviewLoading(true)
      // Reset loading state after a short delay (iframe will handle actual load)
      setTimeout(() => setIsPreviewLoading(false), 500)
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#111111]">
      {/* Header */}
      <EditorHeader 
        onNavigateHome={onNavigateHome} 
        sandboxUrl={sandboxUrl}
        onRefresh={handleRefresh}
        isPreviewLoading={isPreviewLoading}
      />

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
          <PreviewPanel ref={previewRef} content={previewContent} sandboxUrl={sandboxUrl} />
        </div>
      </div>
    </div>
  )
}
