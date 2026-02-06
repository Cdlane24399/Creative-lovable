import { z } from "zod"
import type { UIMessage } from "ai"

// Zod schemas for tool outputs
const ToolOutputSchema = z.object({
  success: z.boolean().optional(),
  previewUrl: z.string().optional(),
  url: z.string().optional(),
  projectName: z.string().optional(),
  sandboxId: z.string().optional(),
  filesReady: z.boolean().optional(),
})

export type ToolOutput = z.infer<typeof ToolOutputSchema>

export interface ToolOutputSummary {
  latestPreviewUrl: string | null
  filesReadyInfo: { projectName: string; sandboxId?: string } | null
}

interface MessagePart {
  type: string
  toolCallId?: string
  state?: string
  output?: unknown
}

/**
 * Parse tool outputs from AI messages and extract relevant data.
 * Tracks processed tool calls to avoid duplicate processing.
 */
export function parseToolOutputs(
  messages: UIMessage[],
  processedIds: Set<string>
): ToolOutputSummary {
  let latestPreviewUrl: string | null = null
  let filesReadyInfo: { projectName: string; sandboxId?: string } | null = null

  for (const message of messages) {
    if (message.role !== "assistant") continue

    for (const part of (message.parts || []) as MessagePart[]) {
      // Only process tool parts
      if (!part.type?.startsWith("tool-")) continue

      const toolCallId = part.toolCallId || `${message.id}-${part.type}`

      // Skip already processed
      if (processedIds.has(toolCallId)) continue

      // Only process completed tools
      if (part.state !== "output-available") continue

      // Parse and validate output
      const rawOutput = part.output
      if (!rawOutput) continue

      let parsedOutput: unknown
      if (typeof rawOutput === "string") {
        try {
          parsedOutput = JSON.parse(rawOutput)
        } catch {
          continue
        }
      } else {
        parsedOutput = rawOutput
      }

      // Validate with Zod (safe parse to avoid throwing)
      const result = ToolOutputSchema.safeParse(parsedOutput)
      if (!result.success || result.data.success === false) continue

      const output = result.data

      // Mark as processed
      processedIds.add(toolCallId)

      // Extract preview URL (prefer previewUrl over url)
      const previewUrl = output.previewUrl || output.url
      if (previewUrl) {
        latestPreviewUrl = previewUrl
      }

      // Extract files ready info
      if (output.projectName && output.filesReady) {
        filesReadyInfo = {
          projectName: output.projectName,
          sandboxId: output.sandboxId,
        }
      }
    }
  }

  return { latestPreviewUrl, filesReadyInfo }
}
