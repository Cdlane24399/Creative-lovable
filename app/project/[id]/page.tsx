"use client"

import { use } from "react"
import dynamic from "next/dynamic"
import { type ModelProvider } from "@/lib/ai/agent"
import { useSearchParams } from "next/navigation"

const EditorLayout = dynamic(
  () => import("@/components/editor-layout").then((mod) => mod.EditorLayout),
  {
    ssr: false,
    loading: () => <div className="min-h-screen bg-[#09090B]" />,
  },
)

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const prompt = searchParams.get("prompt")
  const model = (searchParams.get("model") as ModelProvider) || "anthropic"

  return (
    <EditorLayout
      projectId={id}
      initialPrompt={prompt}
      initialModel={model}
    />
  )
}
