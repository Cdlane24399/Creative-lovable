/**
 * Web Builder Agent - AI SDK v6 Implementation
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
 * AI SDK v6 Best Practices Applied:
 *
 * 1. Tool Definition Pattern:
 *    ✅ Use tool() from 'ai' package
 *    ✅ inputSchema (NOT parameters) with Zod
 *    ✅ execute() returns structured objects
 *    ✅ Clear descriptions for LLM guidance
 *
 * 2. Error Handling:
 *    ✅ Type-safe error classes (NoSuchToolError, InvalidToolInputError)
 *    ✅ Graceful degradation with createErrorResult()
 *    ✅ Tool call repair via experimental_repairToolCall
 *
 * 3. Context Management:
 *    ✅ AgentContext tracks project state
 *    ✅ Tool execution history for learning
 *    ✅ Build status and error tracking
 *
 * 4. Performance Optimizations:
 *    ✅ Dynamic activeTools via prepareStep
 *    ✅ Message pruning for long conversations
 *    ✅ Batch operations (batchWriteFiles)
 *    ✅ Concurrent file writes
 *
 * Migration Notes (v5 → v6):
 * - parameters → inputSchema
 * - maxSteps → stopWhen(stepCountIs())
 * - maxTokens → maxOutputTokens
 * - CoreMessage → ModelMessage
 * - convertToCoreMessages → convertToModelMessages
 *
 * @see https://ai-sdk.dev/docs/ai-sdk-core/tools
 * @see https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0
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
} from "./schemas/tool-schemas";

// Re-export errors
export {
  WebBuilderError,
  InvalidPathError,
  SandboxError,
} from "./errors/web-builder-errors";

// Re-export utilities
export {
  normalizeSandboxRelativePath,
  createErrorResult,
  formatDuration,
  isRecord,
  type ToolResult,
} from "./utils";

// Re-export helpers
export {
  scaffoldNextProject,
  writePages,
  writeComponents,
  categorizeFiles,
} from "./helpers";

// Re-export prompt generator
export { generateAgenticSystemPrompt } from "./prompt-generator";

// Import tool factories
import {
  createPlanningTools,
  createStateTools,
  createFileTools,
  createBatchFileTools,
  createProjectTools,
  createBuildTools,
  createSyncTools,
  createCodeTools,
  createSearchTools,
  createSkillTools,
  createResearchTools,
} from "./tools";

/**
 * Creates context-aware tools for the web builder agent.
 * Each tool automatically tracks execution in the AgentContext.
 *
 * Note: initializeProject is NOT exposed to the agent.
 * Project initialization happens automatically in withSandbox (sandbox-provider.ts).
 * syncProject remains available for explicit persistence when needed.
 *
 * New tools added:
 * - Search tools: Web search and documentation lookup (via AI Gateway)
 * - Skill tools: Execute Vercel Skills for refactoring, dead code removal, etc.
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
  const planningTools = createPlanningTools(projectId);
  const stateTools = createStateTools(projectId);
  const fileTools = createFileTools(projectId);
  const batchFileTools = createBatchFileTools(projectId);
  const projectTools = createProjectTools(projectId);
  const buildTools = createBuildTools(projectId);
  const syncTools = createSyncTools(projectId);
  const codeTools = createCodeTools(projectId);
  const searchTools = createSearchTools(projectId);
  const skillTools = createSkillTools(projectId);
  const researchTools = createResearchTools(projectId);

  // Return combined tools object
  return {
    // Planning tools
    ...planningTools,

    // State awareness tools
    ...stateTools,

    // File operations
    ...fileTools,

    // Batch file operations
    ...batchFileTools,

    // Project management
    ...projectTools,

    // Build & server tools
    ...buildTools,

    // Database sync persistence
    ...syncTools,

    // Code execution
    ...codeTools,

    // Web search and documentation lookup (AI Gateway)
    ...searchTools,

    // Skill execution (Vercel Skills)
    ...skillTools,

    // Research subagent (design inspiration, skills discovery)
    ...researchTools,
  };
}

// Re-export tool factories for advanced usage
export {
  createPlanningTools,
  createStateTools,
  createFileTools,
  createBatchFileTools,
  createProjectTools,
  createBuildTools,
  createSyncTools,
  createCodeTools,
} from "./tools";
