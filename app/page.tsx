"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { LandingPage } from "@/components/landing-page"
import { type ModelProvider } from "@/lib/ai/agent"

const EditorLayout = dynamic(
  () => import("@/components/editor-layout").then((mod) => mod.EditorLayout),
  {
    ssr: false,
    loading: () => <div className="min-h-screen bg-[#09090B]" />,
  },
)

const createProjectId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function Home() {
  const [currentPage, setCurrentPage] = useState<"landing" | "editor">("landing")
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null)
  const [initialModel, setInitialModel] = useState<ModelProvider>("anthropic")
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)

  const handleNavigateToEditor = useCallback((projectId?: string, prompt?: string, model?: ModelProvider) => {
    // If opening an existing project, use that ID
    // Otherwise generate a new project ID
    const targetProjectId = projectId || createProjectId()

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
