"use client"

import { useState } from "react"
import { LandingPage } from "@/components/landing-page"
import { EditorLayout } from "@/components/editor-layout"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<"landing" | "editor">("landing")
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null)

  const handleNavigateToEditor = (prompt?: string) => {
    setInitialPrompt(prompt || null)
    setCurrentPage("editor")
  }

  if (currentPage === "editor") {
    return (
      <EditorLayout
        onNavigateHome={() => {
          setInitialPrompt(null)
          setCurrentPage("landing")
        }}
        initialPrompt={initialPrompt}
      />
    )
  }

  return <LandingPage onNavigateToEditor={handleNavigateToEditor} />
}
