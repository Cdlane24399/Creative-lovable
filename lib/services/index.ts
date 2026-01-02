/**
 * Services Layer Index
 * 
 * Exports all service classes for business logic operations.
 * Use services in API routes instead of direct repository access.
 * 
 * Services provide:
 * - Business logic coordination
 * - Caching with proper invalidation
 * - Cross-entity operations
 * - Input validation
 */

// Project service
export {
  ProjectService,
  getProjectService,
  type ProjectWithMessagesResult,
  type ProjectListResult,
} from "./project.service"

// Message service
export {
  MessageService,
  getMessageService,
  type UIMessage,
  type MessageToSave,
} from "./message.service"

// Context service
export {
  ContextService,
  getContextService,
  type ContextSummary,
} from "./context.service"
