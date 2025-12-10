"use client"

import { useState } from "react"
import { LandingPage } from "@/components/landing-page"
import { EditorLayout } from "@/components/editor-layout"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<"landing" | "editor">("landing")

  if (currentPage === "editor") {
    return <EditorLayout onNavigateHome={() => setCurrentPage("landing")} />
  }

  return <LandingPage onNavigateToEditor={() => setCurrentPage("editor")} />
}
