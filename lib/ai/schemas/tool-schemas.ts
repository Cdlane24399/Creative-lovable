/**
 * Tool Schemas - Zod validation schemas for web builder agent tools
 *
 * This module contains all Zod schemas, TypeScript interfaces, and constants
 * used by the web builder agent tools. Centralizing these definitions improves
 * code organization, reusability, and maintainability.
 */

import { z } from "zod"

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum number of files to include in project structure scans */
export const MAX_PROJECT_FILES = 50 as const

/** Maximum number of files to read contents for */
export const MAX_FILE_CONTENTS = 10 as const

/** Maximum content preview length in bytes */
export const MAX_CONTENT_PREVIEW = 1000 as const

/** Supported code languages for execution */
export const SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "js", "ts"] as const

/** Tool execution phases for progress tracking */
export const PHASES = {
  INIT: "init",
  SANDBOX: "sandbox",
  SCAFFOLD: "scaffold",
  FILES: "files",
  INSTALL: "install",
  COMPLETE: "complete",
  ERROR: "error",
} as const

// ============================================================================
// TYPES
// ============================================================================

/** Page definition for website creation */
export interface PageDefinition {
  readonly path: string
  readonly content: string
  readonly action?: "create" | "update" | "delete"
}

/** Component definition for website creation */
export interface ComponentDefinition {
  readonly name: string
  readonly content: string
  readonly action?: "create" | "update" | "delete"
}

/** Type for supported languages */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** Type for execution phases */
export type Phase = (typeof PHASES)[keyof typeof PHASES]

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/** Schema for plan steps - validates non-empty array of non-empty strings */
export const planStepsSchema = z
  .array(z.string().min(1, "Step cannot be empty"))
  .min(1, "At least one step is required")
  .describe("Ordered list of discrete steps to accomplish the goal")

/** Schema for file path - validates reasonable path format */
export const filePathSchema = z
  .string()
  .min(1, "Path cannot be empty")
  .max(256, "Path too long")
  .refine((p) => !p.includes(".."), "Path cannot contain '..'")
  .describe("File path relative to project root (e.g., 'app/page.tsx', 'components/Button.tsx')")

/** Schema for project name - descriptive, lowercase with hyphens */
export const projectNameSchema = z
  .string()
  .min(1, "Project name required")
  .max(64, "Project name too long")
  .regex(/^[a-z][a-z0-9-]*$/, "Must be lowercase, start with letter, contain only letters, numbers, and hyphens")
  .describe("Descriptive project name based on user's request (lowercase with hyphens, e.g., 'coffee-shop-landing', 'portfolio-site', 'fitness-tracker'). NEVER use generic names like 'project' or 'my-app'.")

/** Schema for page definition */
export const pageSchema = z.object({
  path: z
    .string()
    .min(1)
    .refine((p) => !p.includes(".."), "Page path cannot contain '..' - use the 'components' array for components")
    .describe("Page path relative to app directory (e.g., 'page.tsx', 'about/page.tsx'). Do NOT use '../' paths - components belong in the 'components' array."),
  content: z.string().min(1).describe("Full React/Next.js page component code"),
  action: z
    .enum(["create", "update", "delete"])
    .optional()
    .default("create")
    .describe("Action to perform on this page"),
})

/** Schema for component definition */
export const componentSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe("Component file name (e.g., 'Button.tsx', 'ui/Card.tsx')"),
  content: z.string().min(1).describe("React component code"),
  action: z
    .enum(["create", "update", "delete"])
    .optional()
    .default("create")
    .describe("Action to perform on this component"),
})

// ============================================================================
// INFERRED TYPES
// ============================================================================

/** Inferred type from planStepsSchema */
export type PlanSteps = z.infer<typeof planStepsSchema>

/** Inferred type from filePathSchema */
export type FilePath = z.infer<typeof filePathSchema>

/** Inferred type from projectNameSchema */
export type ProjectName = z.infer<typeof projectNameSchema>

/** Inferred type from pageSchema */
export type Page = z.infer<typeof pageSchema>

/** Inferred type from componentSchema */
export type Component = z.infer<typeof componentSchema>
