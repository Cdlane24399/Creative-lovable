"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ChatPanel, ChatPanelHandle } from "./chat-panel"
import { PreviewPanel, PreviewPanelHandle } from "./preview-panel"
import { EditorHeader } from "./editor-header"
import { useProject } from "@/hooks/use-projects"
import { generatePlaceholderImage } from "@/lib/utils/screenshot"

import { type ModelProvider } from "@/lib/ai/agent"

interface EditorLayoutProps {
  onNavigateHome?: () => void
  projectId?: string
  initialPrompt?: string | null
  initialModel?: ModelProvider
}

export function EditorLayout({ onNavigateHome, projectId, initialPrompt, initialModel }: EditorLayoutProps) {
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [projectName, setProjectName] = useState<string>("Untitled Project")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)
  const previewRef = useRef<PreviewPanelHandle>(null)
  const chatRef = useRef<ChatPanelHandle>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedUrlRef = useRef<string | null>(null)

  // Load existing project data
  const { project, isLoading: isProjectLoading, updateProject, saveScreenshot } = useProject(projectId || null)

  // Restore project state when loading an existing project
  useEffect(() => {
    if (project) {
      setProjectName(project.name)
      if (project.sandbox_url) {
        lastSavedUrlRef.current = project.sandbox_url
        // Restore the sandbox URL from saved project
        setSandboxUrl(project.sandbox_url)
      }
    }
  }, [project])

  // Auto-save project when sandbox URL changes
  useEffect(() => {
    if (!projectId || !sandboxUrl) return
    if (sandboxUrl === lastSavedUrlRef.current) return

    // Debounce saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    setHasUnsavedChanges(true)

    saveTimeoutRef.current = setTimeout(async () => {
      await saveProject()
    }, 3000) // Save 3 seconds after changes stop

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [sandboxUrl, projectId])

  const saveProject = useCallback(async () => {
    if (!projectId || !sandboxUrl) return

    try {
      // Check if project exists
      const response = await fetch(`/api/projects/${projectId}`)

      if (response.status === 404) {
        // Create new project with the specified ID
        const createResponse = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: projectId, // Use the client-generated ID
            name: projectName || extractProjectName(initialPrompt) || "Untitled Project",
            sandbox_url: sandboxUrl,
          }),
        })

        if (createResponse.ok) {
          const { project: newProject } = await createResponse.json()
          // Update the project ID reference if it was auto-generated
          lastSavedUrlRef.current = sandboxUrl
          setHasUnsavedChanges(false)

          // Generate and save a placeholder screenshot
          const placeholder = generatePlaceholderImage(newProject.name)
          await saveScreenshot(placeholder, sandboxUrl)
        }
      } else if (response.ok) {
        // Update existing project
        await updateProject({
          sandbox_url: sandboxUrl,
        })
        lastSavedUrlRef.current = sandboxUrl
        setHasUnsavedChanges(false)

        // Update screenshot with placeholder
        const placeholder = generatePlaceholderImage(projectName)
        await saveScreenshot(placeholder, sandboxUrl)
      }
    } catch (error) {
      console.error("Failed to save project:", error)
    }
  }, [projectId, sandboxUrl, projectName, initialPrompt, updateProject, saveScreenshot])

  // Extract project name from prompt
  const extractProjectName = (prompt: string | null | undefined): string => {
    if (!prompt) return "Untitled Project"

    // Try to extract a meaningful name from common patterns
    const patterns = [
      /create (?:a |an )?(.+?) (?:website|app|page|landing|dashboard)/i,
      /build (?:a |an )?(.+?) (?:website|app|page|landing|dashboard)/i,
      /make (?:a |an )?(.+?) (?:website|app|page|landing|dashboard)/i,
      /(.+?) (?:website|app|page|landing|dashboard)/i,
    ]

    for (const pattern of patterns) {
      const match = prompt.match(pattern)
      if (match && match[1]) {
        // Clean up and capitalize
        const name = match[1].trim()
        return name.charAt(0).toUpperCase() + name.slice(1)
      }
    }

    // Fall back to first few words
    const words = prompt.split(" ").slice(0, 3).join(" ")
    return words.length > 30 ? words.substring(0, 30) + "..." : words
  }

  // Save on unmount if there are unsaved changes
  useEffect(() => {
    return () => {
      if (hasUnsavedChanges && sandboxUrl && projectId) {
        // Synchronous save attempt before unmount
        saveProject()
      }
    }
  }, [hasUnsavedChanges, sandboxUrl, projectId, saveProject])

  const handleRefresh = () => {
    if (previewRef.current) {
      previewRef.current.refresh()
      setIsPreviewLoading(true)
      setTimeout(() => setIsPreviewLoading(false), 500)
    }
  }

  // Handle when AI reports project name (from createWebsite tool result)
  const handleFilesReady = useCallback((newProjectName: string) => {
    console.log("[EditorLayout] Project created:", newProjectName)
    if (newProjectName && newProjectName !== projectName) {
      setProjectName(newProjectName)
    }
  }, [projectName])

  // Handle sandbox URL update (from createWebsite tool result)
  const handleSandboxUrlUpdate = useCallback((url: string | null) => {
    console.log("[EditorLayout] Sandbox URL updated:", url)
    setSandboxUrl(url)
    setIsPreviewLoading(false)
    
    // Update project name from prompt if still untitled
    if (url && projectName.includes("Untitled")) {
      const extractedName = extractProjectName(initialPrompt)
      if (extractedName !== "Untitled Project") {
        setProjectName(extractedName)
      }
    }
  }, [initialPrompt, projectName])

  return (
    <div className="flex h-screen w-full flex-col bg-[#111111]">
      {/* Header */}
      <EditorHeader
        onNavigateHome={onNavigateHome}
        sandboxUrl={sandboxUrl}
        onRefresh={handleRefresh}
        isPreviewLoading={isPreviewLoading}
        projectName={projectName}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={saveProject}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Chat UI */}
        <div className="flex w-[450px] flex-shrink-0 flex-col">
          <ChatPanel
            ref={chatRef}
            projectId={projectId}
            onPreviewUpdate={setPreviewContent}
            onSandboxUrlUpdate={handleSandboxUrlUpdate}
            onFilesReady={handleFilesReady}
            initialPrompt={initialPrompt}
            initialModel={initialModel}
          />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1">
          <PreviewPanel 
            ref={previewRef} 
            content={previewContent} 
            sandboxUrl={sandboxUrl}
            isLoading={isPreviewLoading}
          />
        </div>
      </div>
    </div>
  )
}
