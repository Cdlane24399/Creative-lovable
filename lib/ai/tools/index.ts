/**
 * AI Tools Index
 * 
 * Single export point for all agent tools.
 * The main tool implementation is in web-builder-agent.ts which provides
 * context-aware tools with proper state tracking.
 * 
 * Usage:
 * ```typescript
 * import { createContextAwareTools } from "@/lib/ai/tools"
 * 
 * const tools = createContextAwareTools(projectId)
 * ```
 * 
 * @deprecated The old tools.ts file has been deprecated.
 * Use createContextAwareTools from web-builder-agent.ts instead.
 */

// Re-export the main tool factory
export { 
  createContextAwareTools,
  generateAgenticSystemPrompt,
} from "../web-builder-agent"

// Re-export planning tools
export * from "../planning"
