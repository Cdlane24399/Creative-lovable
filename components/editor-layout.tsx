"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ChatPanel, ChatPanelHandle } from "./chat-panel"
import { PreviewPanel, PreviewPanelHandle } from "./preview-panel"
import { EditorHeader, type EditorView } from "./editor-header"
import { useProject } from "@/hooks/use-projects"
import { useDevServer } from "@/hooks/use-dev-server"
import { generatePlaceholderImage } from "@/lib/utils/screenshot"

import { type ModelProvider } from "@/lib/ai/agent"

interface EditorLayoutProps {
  onNavigateHome?: () => void
  projectId?: string
  initialPrompt?: string | null
  initialModel?: ModelProvider
}

export function EditorLayout({ onNavigateHome, projectId, initialPrompt, initialModel }: EditorLayoutProps) {
  const [currentView, setCurrentView] = useState<EditorView>("preview")
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [projectName, setProjectName] = useState<string>("Untitled Project")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)
  const [pendingServerStart, setPendingServerStart] = useState<string | null>(null)
  const [pendingSandboxId, setPendingSandboxId] = useState<string | null>(null)
  const [isFilesLoading, setIsFilesLoading] = useState(false)
  const previewRef = useRef<PreviewPanelHandle>(null)
  const chatRef = useRef<ChatPanelHandle>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedUrlRef = useRef<string | null>(null)
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const titleGeneratedRef = useRef(false)

  // Debug: Log sandboxUrl state changes
  useEffect(() => {
    console.log("[EditorLayout] sandboxUrl state changed:", sandboxUrl)
  }, [sandboxUrl])

  // Load existing project data
  const { project, messages: savedMessages, isLoading: isProjectLoading, updateProject, saveScreenshot, refetchProject } = useProject(projectId || null)

  // Dev server management - only enable polling when actively starting a server
  const [isPollingEnabled, setIsPollingEnabled] = useState(false)

  const {
    status: devServerStatus,
    isStarting: isDevServerStarting,
    start: startDevServer,
  } = useDevServer({
    projectId: projectId || null,
    projectName: pendingServerStart || (projectName !== "Untitled Project" ? projectName : null),
    sandboxId: pendingSandboxId,
    enabled: isPollingEnabled,
    onReady: (url) => {
      console.log("[EditorLayout] onReady callback triggered with url:", url)
      console.log("[EditorLayout] Current sandboxUrl state:", sandboxUrl)
      
      // Debounce URL updates to prevent race conditions
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current)
      }
      
      urlUpdateTimeoutRef.current = setTimeout(() => {
        setSandboxUrl(url)
        console.log("[EditorLayout] setSandboxUrl called with:", url)
        setIsPreviewLoading(false)
        setPendingServerStart(null)
        // Stop polling once server is ready
        setIsPollingEnabled(false)
        console.log("[EditorLayout] onReady completed")
      }, 100) // Small delay to batch state updates
    },
    onError: (errors) => {
      console.error("[EditorLayout] Dev server errors:", errors)
      setIsPreviewLoading(false)
      // Stop polling on error
      setIsPollingEnabled(false)
    },
  })

  // Track if we've started the dev server for the current project
  const devServerStartedRef = useRef<string | null>(null)

  // Sync sandbox URL from dev server status updates (covers missed onReady events)
  useEffect(() => {
    if (!devServerStatus.url) return
    if (devServerStatus.url === sandboxUrl) return

    console.log("[EditorLayout] Syncing sandbox URL from status:", devServerStatus.url)
    
    // Debounce to avoid rapid state changes
    if (urlUpdateTimeoutRef.current) {
      clearTimeout(urlUpdateTimeoutRef.current)
    }
    
    urlUpdateTimeoutRef.current = setTimeout(() => {
      setSandboxUrl(devServerStatus.url)
      setIsPreviewLoading(false)
      setPendingServerStart(null)
      // Stop polling since we have a URL
      setIsPollingEnabled(false)
    }, 100)
  }, [devServerStatus.url, sandboxUrl])

  // Start dev server when pending project name is set (only once per project)
  useEffect(() => {
    if (!pendingServerStart || !projectId) return
    if (devServerStartedRef.current === pendingServerStart) return

    console.log("[EditorLayout] Starting dev server for:", pendingServerStart, "projectId:", projectId, "sandboxId:", pendingSandboxId)
    devServerStartedRef.current = pendingServerStart
    
    // Enable polling which will trigger status checks
    setIsPollingEnabled(true)
    
    // Call startDevServer directly - the hook should now have the correct projectName
    startDevServer()
  }, [pendingServerStart, projectId, pendingSandboxId, startDevServer])

  // Track if sandbox validation is in progress
  const validatingSandboxRef = useRef(false)

  // Restore project state when loading an existing project
  useEffect(() => {
    if (project) {
      setProjectName(project.name)
      // Mark title as already generated if project has a non-default name
      if (project.name && project.name !== "Untitled Project") {
        titleGeneratedRef.current = true
      }
      if (project.sandbox_url && !validatingSandboxRef.current) {
        lastSavedUrlRef.current = project.sandbox_url
        // Don't immediately set the sandbox URL - validate it first
        // by checking if the sandbox is still accessible
        console.log("[EditorLayout] Validating saved sandbox URL:", project.sandbox_url)
        validatingSandboxRef.current = true

        // Check if sandbox is still valid by checking restore status
        // If we can restore (files exist), sandbox may have expired
        fetch(`/api/projects/${project.id}/restore`)
          .then((res) => res.json())
          .then((data) => {
            if (data.canRestore && data.fileCount > 0) {
              // Project has saved files - trigger restoration to ensure sandbox has them
              console.log("[EditorLayout] Project has saved files, triggering restoration...")
              // Don't set sandbox URL yet - let restoration handle it
            } else {
              // No files to restore, use saved URL directly
              console.log("[EditorLayout] No files to restore, using saved sandbox URL")
              setSandboxUrl(project.sandbox_url)
            }
            validatingSandboxRef.current = false
          })
          .catch(() => {
            // On error, try to use saved URL
            console.log("[EditorLayout] Validation failed, using saved sandbox URL")
            setSandboxUrl(project.sandbox_url)
            validatingSandboxRef.current = false
          })
      }
    }
  }, [project])

  // Track restoration attempts
  const restorationAttemptedRef = useRef(false)

  // Restore sandbox when opening an existing project without a working preview
  const restoreSandbox = useCallback(async () => {
    if (!projectId || restorationAttemptedRef.current) return
    if (initialPrompt) return // New project, don't try to restore

    restorationAttemptedRef.current = true
    console.log("[EditorLayout] Attempting to restore project sandbox...")
    setIsPreviewLoading(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (response.ok) {
        const data = await response.json()
        console.log("[EditorLayout] Sandbox restored:", data)
        
        if (data.sandboxId) {
          setPendingSandboxId(data.sandboxId)
        }
        
        // Trigger dev server start - use project name or projectId as fallback
        const serverName = project?.name || projectId
        console.log("[EditorLayout] Starting dev server for restored sandbox:", serverName)
        setPendingServerStart(serverName)
      } else if (response.status === 422) {
        // No files to restore - this is a project without saved files
        console.log("[EditorLayout] No files to restore for this project")
        setIsPreviewLoading(false)
      } else {
        console.warn("[EditorLayout] Failed to restore sandbox:", await response.text())
        setIsPreviewLoading(false)
      }
    } catch (error) {
      console.error("[EditorLayout] Error restoring sandbox:", error)
      setIsPreviewLoading(false)
    }
  }, [projectId, initialPrompt, project?.name])

  // Trigger restoration when opening an existing project
  useEffect(() => {
    // Only try to restore if:
    // 1. We have a project (loaded from DB)
    // 2. No sandbox URL is currently active
    // 3. Not a new project (no initialPrompt)
    if (project && !sandboxUrl && !initialPrompt) {
      // Wait a bit for the project data to fully load
      const timer = setTimeout(restoreSandbox, 500)
      return () => clearTimeout(timer)
    }
  }, [project, sandboxUrl, initialPrompt, restoreSandbox])

  // Auto-generate project title when sandbox is ready
  const generateProjectTitle = useCallback(async () => {
    if (!initialPrompt || !projectId) return
    if (titleGeneratedRef.current) return
    if (projectName !== "Untitled Project" && projectName !== projectId) return

    titleGeneratedRef.current = true
    console.log("[EditorLayout] Generating project title...")

    try {
      const response = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: initialPrompt, projectId }),
      })

      if (response.ok) {
        const { title } = await response.json()
        if (title) {
          console.log("[EditorLayout] Generated title:", title)
          setProjectName(title)
        }
      }
    } catch (error) {
      console.error("Failed to generate title:", error)
    }
  }, [initialPrompt, projectId, projectName])

  // Trigger title generation when sandbox URL becomes available
  useEffect(() => {
    if (sandboxUrl && initialPrompt && !titleGeneratedRef.current) {
      // Small delay to ensure project exists in DB first
      const timer = setTimeout(generateProjectTitle, 1000)
      return () => clearTimeout(timer)
    }
  }, [sandboxUrl, initialPrompt, generateProjectTitle])

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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current)
      }
    }
  }, [])

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

          // Capture and save a screenshot
          captureAndSaveScreenshot(newProject.name, sandboxUrl)
        }
      } else if (response.ok) {
        // Update existing project
        await updateProject({
          sandbox_url: sandboxUrl,
        })
        lastSavedUrlRef.current = sandboxUrl
        setHasUnsavedChanges(false)

        // Capture and save a screenshot
        captureAndSaveScreenshot(projectName, sandboxUrl)
      }
    } catch (error) {
      console.error("Failed to save project:", error)
    }
  }, [projectId, sandboxUrl, projectName, initialPrompt, updateProject])

  // Capture screenshot from sandbox URL using the screenshot API
  // Uses E2B Desktop SDK for native screenshot capability when projectId is available
  const captureAndSaveScreenshot = useCallback(async (name: string, url: string) => {
    try {
      const response = await fetch("/api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url, 
          projectName: name,
          projectId: projectId || undefined, // Pass projectId to enable E2B Desktop screenshots
        }),
      })

      if (response.ok) {
        const { screenshot_base64, source } = await response.json()
        if (screenshot_base64) {
          await saveScreenshot(screenshot_base64, url)
          console.log(`[EditorLayout] Screenshot saved for ${name} (source: ${source || 'unknown'})`)
        }
      }
    } catch (error) {
      // Fall back to placeholder on error
      console.warn("Screenshot capture failed, using placeholder:", error)
      const placeholder = generatePlaceholderImage(name)
      await saveScreenshot(placeholder, url)
    }
  }, [saveScreenshot, projectId])

  // Manual screenshot capture handler
  const handleManualScreenshot = useCallback(async () => {
    if (!sandboxUrl || !projectName) return
    console.log("[EditorLayout] Manual screenshot capture triggered")
    await captureAndSaveScreenshot(projectName, sandboxUrl)
    // Refetch to show updated screenshot
    await refetchProject()
  }, [sandboxUrl, projectName, captureAndSaveScreenshot, refetchProject])

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

  const handleRefresh = useCallback(() => {
    if (previewRef.current) {
      previewRef.current.refresh()
      setIsPreviewLoading(true)
      setTimeout(() => setIsPreviewLoading(false), 500)
    }
  }, [])

  // Handle when AI reports project name (from createWebsite tool result)
  const handleFilesReady = useCallback((newProjectName: string, sandboxId?: string) => {
    console.log("[EditorLayout] Files ready, project:", newProjectName, "sandboxId:", sandboxId)
    if (newProjectName) {
      setProjectName(newProjectName)
      setIsPreviewLoading(true)
      // Store sandboxId for dev server to use
      if (sandboxId) {
        setPendingSandboxId(sandboxId)
      }
      // Trigger dev server start with the project name
      setPendingServerStart(newProjectName)

      // Mark files as loading until we refetch
      setIsFilesLoading(true)

      // Refetch project to get updated files_snapshot for Code Tab
      // Small delay to ensure files are saved to DB
      setTimeout(async () => {
        console.log("[EditorLayout] Refetching project to get files_snapshot...")
        await refetchProject()
        setIsFilesLoading(false)
      }, 2000)
    }
  }, [refetchProject])

  // Handle sandbox URL update (from createWebsite tool result)
  const handleSandboxUrlUpdate = useCallback((url: string | null) => {
    console.log("[EditorLayout] Sandbox URL update requested:", url)
    
    // Debounce to prevent race conditions with dev server status updates
    if (urlUpdateTimeoutRef.current) {
      clearTimeout(urlUpdateTimeoutRef.current)
    }
    
    urlUpdateTimeoutRef.current = setTimeout(() => {
      console.log("[EditorLayout] Applying sandbox URL:", url)
      setSandboxUrl(url)
      setIsPreviewLoading(false)
      
      // Stop polling since we have a URL directly from the tool
      if (url) {
        setIsPollingEnabled(false)
        setPendingServerStart(null)
      }

      // Update project name from prompt if still untitled
      if (url && projectName.includes("Untitled")) {
        const extractedName = extractProjectName(initialPrompt)
        if (extractedName !== "Untitled Project") {
          setProjectName(extractedName)
        }
      }
    }, 150) // Slightly longer delay for direct URL updates
  }, [initialPrompt, projectName])

  return (
    <div className="flex h-screen w-full flex-col bg-[#111111]">
      {/* Header */}
      <EditorHeader
        onNavigateHome={onNavigateHome}
        projectName={projectName}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={saveProject}
        sandboxUrl={sandboxUrl}
        currentView={currentView}
        onViewChange={setCurrentView}
        isRefreshing={isPreviewLoading || isDevServerStarting}
        onRefresh={handleRefresh}
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
            savedMessages={savedMessages}
          />
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1">
          <PreviewPanel
            ref={previewRef}
            content={previewContent}
            sandboxUrl={sandboxUrl}
            isLoading={isPreviewLoading || isDevServerStarting}
            project={project}
            currentView={currentView}
            onCaptureScreenshot={handleManualScreenshot}
          />
        </div>
      </div>
    </div>
  )
}
