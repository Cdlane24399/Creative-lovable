/**
 * File writing utilities for the web builder agent.
 *
 * This module provides functions to write pages and components
 * to the sandbox filesystem.
 */

import { executeCommand, writeFile as writeFileToSandbox, createSandbox } from "@/lib/e2b/sandbox"
import { normalizeSandboxRelativePath } from "../utils"
import { updateFileInContext } from "../agent-context"
import type { PageDefinition, ComponentDefinition } from "../schemas/tool-schemas"

/**
 * Writes pages to the app directory.
 */
export async function writePages(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  projectDir: string,
  appDir: string,
  pages: readonly PageDefinition[],
  projectId: string
): Promise<void> {
  for (const page of pages) {
    const action = page.action || "create"
    const normalizedPagePath = normalizeSandboxRelativePath(page.path, "app/")
    const pagePath = `${projectDir}/${appDir}/${normalizedPagePath}`

    if (action === "delete") {
      await executeCommand(sandbox, `rm -f "${pagePath}"`)
      updateFileInContext(projectId, `${appDir}/${normalizedPagePath}`, undefined, "deleted")
    } else {
      const pageDir = pagePath.substring(0, pagePath.lastIndexOf("/"))
      if (pageDir !== `${projectDir}/${appDir}`) {
        await executeCommand(sandbox, `mkdir -p "${pageDir}"`)
      }
      await writeFileToSandbox(sandbox, pagePath, page.content)
      updateFileInContext(projectId, `${appDir}/${normalizedPagePath}`, page.content, action === "create" ? "created" : "updated")
    }
  }
}

/**
 * Writes components to the components directory.
 */
export async function writeComponents(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  projectDir: string,
  components: readonly ComponentDefinition[],
  projectId: string
): Promise<void> {
  for (const component of components) {
    const action = component.action || "create"
    const normalizedComponentName = normalizeSandboxRelativePath(component.name, "components/")
    const componentPath = `${projectDir}/components/${normalizedComponentName}`

    if (action === "delete") {
      await executeCommand(sandbox, `rm -f "${componentPath}"`)
      updateFileInContext(projectId, `components/${normalizedComponentName}`, undefined, "deleted")
    } else {
      const componentDir = componentPath.substring(0, componentPath.lastIndexOf("/"))
      if (componentDir !== `${projectDir}/components`) {
        await executeCommand(sandbox, `mkdir -p "${componentDir}"`)
      }
      await writeFileToSandbox(sandbox, componentPath, component.content)
      updateFileInContext(projectId, `components/${normalizedComponentName}`, component.content, action === "create" ? "created" : "updated")
    }
  }
}
