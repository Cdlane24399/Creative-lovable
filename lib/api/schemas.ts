import { z } from "zod"

// Project API responses
export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  sandbox_url: z.string().nullable(),
  screenshot_url: z.string().nullable(),
  files_snapshot: z.record(z.string(), z.string()).nullable(),
  starred: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export const ProjectResponseSchema = z.object({
  project: ProjectSchema.nullable(),
})

export const ProjectsListResponseSchema = z.object({
  projects: z.array(ProjectSchema),
})

// Restore API responses
export const RestoreCheckResponseSchema = z.object({
  canRestore: z.boolean(),
  fileCount: z.number(),
})

export const RestoreResponseSchema = z.object({
  sandboxId: z.string().optional(),
  success: z.boolean().optional(),
})

// Dev server status
export const DevServerStatusSchema = z.object({
  isRunning: z.boolean(),
  port: z.number().nullable(),
  url: z.string().nullable(),
  logs: z.array(z.string()),
  errors: z.array(z.string()),
  lastChecked: z.string(),
})

// Screenshot API
export const ScreenshotResponseSchema = z.object({
  screenshot_base64: z.string().optional(),
  source: z.string().optional(),
  error: z.string().optional(),
})

// Title generation
export const GenerateTitleResponseSchema = z.object({
  title: z.string(),
})

// Type exports
export type Project = z.infer<typeof ProjectSchema>
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>
export type ProjectsListResponse = z.infer<typeof ProjectsListResponseSchema>
export type RestoreCheckResponse = z.infer<typeof RestoreCheckResponseSchema>
export type RestoreResponse = z.infer<typeof RestoreResponseSchema>
export type DevServerStatus = z.infer<typeof DevServerStatusSchema>
export type ScreenshotResponse = z.infer<typeof ScreenshotResponseSchema>
export type GenerateTitleResponse = z.infer<typeof GenerateTitleResponseSchema>

// Helper for safe API response parsing
export function parseApiResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}
