/**
 * Web Builder Agent - AI SDK v6 Beta ToolLoopAgent Implementation
 *
 * This is the main entry point for the web builder agent tools.
 * The implementation has been modularized into separate files for better
 * maintainability, testability, and code organization.
 *
 * Module Structure:
 * - schemas/     - Zod schemas and type definitions
 * - errors/      - Custom error classes
 * - utils/       - Utility functions (path handling, formatting)
 * - helpers/     - Helper functions (scaffolding, file writing)
 * - tools/       - Individual tool implementations
 * - prompt-generator.ts - System prompt generation
 *
 * AI SDK v6 Features Used:
 * - Preliminary Tool Results: AsyncIterable for streaming progress
 * - Tool Input Lifecycle Hooks: onInputStart, onInputDelta, onInputAvailable
 * - Tool Execution Options: toolCallId, messages, abortSignal
 * - Context Awareness: Full project state tracking
 */

// Re-export schemas and types
export {
  MAX_PROJECT_FILES,
  MAX_FILE_CONTENTS,
  MAX_CONTENT_PREVIEW,
  SUPPORTED_LANGUAGES,
  PHASES,
  planStepsSchema,
  filePathSchema,
  projectNameSchema,
  pageSchema,
  componentSchema,
  type PageDefinition,
  type ComponentDefinition,
  type SupportedLanguage,
  type Phase,
} from "./schemas/tool-schemas"

// Re-export errors
export {
  WebBuilderError,
  InvalidPathError,
  SandboxError,
} from "./errors/web-builder-errors"

// Re-export utilities
export {
  normalizeSandboxRelativePath,
  createErrorResult,
  formatDuration,
  isRecord,
  type ToolResult,
} from "./utils"

// Re-export helpers
export {
  scaffoldNextProject,
  writePages,
  writeComponents,
  categorizeFiles,
} from "./helpers"

// Re-export prompt generator
export { generateAgenticSystemPrompt } from "./prompt-generator"

// Import tool factories
import {
  createPlanningTools,
  createStateTools,
  createFileTools,
  createProjectTools,
  createBuildTools,
  createWebsiteTools,
  createCodeTools,
} from "./tools"

/**
 * Creates context-aware tools for the web builder agent.
 * Each tool automatically tracks execution in the AgentContext.
 *
 * @param projectId - Unique identifier for the project/session
 * @returns Object containing all available tools
 *
 * @example
 * ```typescript
 * const tools = createContextAwareTools("project-123")
 *
 * // Use individual tools
 * const result = await tools.writeFile.execute({
 *   path: "app/page.tsx",
 *   content: "export default function Home() { return <div>Hello</div> }"
 * })
 * ```
 */
export function createContextAwareTools(projectId: string) {
  // Compose all tool factories
  const planningTools = createPlanningTools(projectId)
  const stateTools = createStateTools(projectId)
  const fileTools = createFileTools(projectId)
  const projectTools = createProjectTools(projectId)
  const buildTools = createBuildTools(projectId)
  const websiteTools = createWebsiteTools(projectId)
  const codeTools = createCodeTools(projectId)

  // Return combined tools object
  return {
    // Planning tools
    ...planningTools,

    // State awareness tools
    ...stateTools,

    // File operations
    ...fileTools,

    // Project management
    ...projectTools,

    // Build & server tools
    ...buildTools,

    // Website creation
    ...websiteTools,

    // Code execution
    ...codeTools,
  }
}

// Re-export tool factories for advanced usage
export {
  createPlanningTools,
  createStateTools,
  createFileTools,
  createProjectTools,
  createBuildTools,
  createWebsiteTools,
  createCodeTools,
} from "./tools"
