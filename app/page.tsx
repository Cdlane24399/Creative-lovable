"use client"

import { useState, useCallback } from "react"
import { LandingPage } from "@/components/landing-page"
import { EditorLayout } from "@/components/editor-layout"
import { v4 as uuidv4 } from "uuid"
import { type ModelProvider } from "@/lib/ai/agent"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<"landing" | "editor">("landing")
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null)
  const [initialModel, setInitialModel] = useState<ModelProvider>("anthropic")
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)

  const handleNavigateToEditor = useCallback((projectId?: string, prompt?: string, model?: ModelProvider) => {
    // If opening an existing project, use that ID
    // Otherwise generate a new project ID
    const targetProjectId = projectId || uuidv4()

    setCurrentProjectId(targetProjectId)
    setInitialPrompt(prompt || null)
    if (model) {
      setInitialModel(model)
    }
    setCurrentPage("editor")
  }, [])

  const handleNavigateHome = useCallback(() => {
    setInitialPrompt(null)
    setCurrentProjectId(null)
    setCurrentPage("landing")
  }, [])

  if (currentPage === "editor") {
    return (
      <EditorLayout
        onNavigateHome={handleNavigateHome}
        projectId={currentProjectId || undefined}
        initialPrompt={initialPrompt}
        initialModel={initialModel}
      />
    )
  }

  return <LandingPage onNavigateToEditor={handleNavigateToEditor} />
}
