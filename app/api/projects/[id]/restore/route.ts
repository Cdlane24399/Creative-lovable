import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import { projectCache } from "@/lib/cache"
import { getProjectRepository } from "@/lib/db/repositories"
import {
  createSandbox,
  getProjectSnapshot,
  getHostUrl,
  getSandbox,
} from "@/lib/e2b/sandbox"

/**
 * POST /api/projects/[id]/restore
 * Restores a project's sandbox from saved files when the sandbox has expired.
 * Creates a new sandbox and restores files from snapshot.
 * The dev server should be started separately via the dev-server API.
 */
export const POST = withAuth(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params

  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
  }

  console.log(`[Restore] Starting restoration for project ${projectId}`)

  try {
    // Get project from database
    const projectRepo = getProjectRepository()
    const [project, snapshot] = await Promise.all([
      projectRepo.findById(projectId),
      getProjectSnapshot(projectId),
    ])

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Check if we have files to restore
    const fileCount = snapshot ? Object.keys(snapshot.files_snapshot).length : 0

    if (!snapshot || fileCount === 0) {
      const existingSandbox = await getSandbox(projectId)
      if (existingSandbox) {
        const previewUrl = getHostUrl(existingSandbox, 3000)
        return NextResponse.json({
          success: true,
          projectId,
          sandboxId: existingSandbox.sandboxId,
          previewUrl,
          filesRestored: 0,
          dependenciesCount: 0,
          message:
            "No snapshot files found, but an existing sandbox is available. Starting dev server should resume the preview.",
        })
      }

      return NextResponse.json(
        { 
          error: "No files to restore", 
          message: "This project has no saved files. You may need to rebuild it." 
        },
        { status: 422 }
      )
    }

    console.log(`[Restore] Found ${fileCount} files to restore for project ${projectId}`)

    // Create new sandbox with file restoration enabled
    // The createSandbox function will automatically restore files if:
    // 1. There was a previous sandbox ID in the database (indicates sandbox expired)
    // 2. The restoreFromSnapshot option is true (default)
    const sandbox = await createSandbox(projectId)

    console.log(`[Restore] Sandbox created/restored: ${sandbox.sandboxId}`)

    // Update project with new sandbox ID
    await projectRepo.update(projectId, {
      sandbox_id: sandbox.sandboxId,
    })
    await projectCache.invalidate(projectId)

    // Get the preview URL (port 3000 is default for Next.js)
    const previewUrl = getHostUrl(sandbox, 3000)

    return NextResponse.json({
      success: true,
      projectId,
      sandboxId: sandbox.sandboxId,
      previewUrl,
      filesRestored: fileCount,
      dependenciesCount: snapshot.dependencies ? Object.keys(snapshot.dependencies).length : 0,
      message: `Project restored with ${fileCount} files. Start the dev server to see the preview.`,
    })
  } catch (error) {
    console.error(`[Restore] Failed to restore project ${projectId}:`, error)
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Failed to restore project",
        details: "The sandbox could not be created or files could not be restored."
      },
      { status: 500 }
    )
  }
})

/**
 * GET /api/projects/[id]/restore
 * Check if a project can be restored (has saved files).
 */
export const GET = withAuth(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params

  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
  }

  try {
    const snapshot = await getProjectSnapshot(projectId)
    const fileCount = snapshot ? Object.keys(snapshot.files_snapshot).length : 0
    const dependencyCount = snapshot?.dependencies ? Object.keys(snapshot.dependencies).length : 0

    return NextResponse.json({
      canRestore: fileCount > 0,
      fileCount,
      dependencyCount,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check restore status" },
      { status: 500 }
    )
  }
})
