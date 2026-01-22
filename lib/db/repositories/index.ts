/**
 * Repository Layer Index
 * 
 * Exports all repository classes and utilities for database operations.
 * Use repositories for all database access instead of direct SQL in routes.
 */

// Base repository
export {
  BaseRepository,
  generateId,
  parseJsonSafe,
  toJsonString,
  type BaseEntity,
  type FindOptions,
  type PaginatedResult,
  type MutationResult,
} from "./base.repository"

// Project repository
export {
  ProjectRepository,
  getProjectRepository,
  type ProjectFilters,
  type ProjectQueryOptions,
} from "./project.repository"

// Message repository
export {
  MessageRepository,
  getMessageRepository,
  type CreateMessageData,
  type MessageQueryOptions,
  type MessageBatch,
} from "./message.repository"

// Context repository
export {
  ContextRepository,
  getContextRepository,
  type FileInfo,
  type BuildStatus,
  type ServerState,
  type ToolExecution,
  type AgentContextData,
  type ContextUpdate,
} from "./context.repository"

// Integration repository
export {
  IntegrationRepository,
  getIntegrationRepository,
  type Integration,
  type CreateIntegrationData,
} from "./integration.repository"
