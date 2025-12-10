"use client"

import { useState } from "react"
import { LandingPage } from "@/components/landing-page"
import { EditorLayout } from "@/components/editor-layout"
import type { ModelProvider } from "@/lib/ai/agent"

interface EditorState {
  initialPrompt?: string
  initialModel?: ModelProvider
}

export default function Home() {
  const [currentPage, setCurrentPage] = useState<"landing" | "editor">("landing")
  const [editorState, setEditorState] = useState<EditorState>({})

  const handleNavigateToEditor = (prompt?: string, model?: ModelProvider) => {
    setEditorState({ initialPrompt: prompt, initialModel: model })
    setCurrentPage("editor")
  }

  if (currentPage === "editor") {
    return (
      <EditorLayout
        onNavigateHome={() => {
          setEditorState({})
          setCurrentPage("landing")
        }}
        initialPrompt={editorState.initialPrompt}
        initialModel={editorState.initialModel}
      />
    )
  }

  return <LandingPage onNavigateToEditor={handleNavigateToEditor} />
}
