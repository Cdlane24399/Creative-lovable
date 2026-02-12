// Database types for Creative Lovable

export interface Project {
  id: string
  name: string
  description: string | null
  screenshot_url: string | null
  screenshot_base64: string | null
  sandbox_id: string | null
  sandbox_url: string | null
  files_snapshot: Record<string, string> // { "path/to/file.tsx": "file content" }
  dependencies: Record<string, string> // { "react": "^18.3.1" }
  starred: boolean
  created_at: string
  updated_at: string
  last_opened_at: string
  user_id: string | null
}

export interface Message {
  id: string
  project_id: string
  role: "user" | "assistant" | "system"
  content: string
  parts: MessagePart[] | null
  model: string | null
  created_at: string
}

export interface MessagePart {
  type: string
  text?: string
  state?: "input-streaming" | "input-available" | "output-available" | "output-error"
  input?: Record<string, unknown>
  output?: Record<string, unknown> | string
  errorText?: string
  toolCallId?: string
  [key: string]: unknown
}

// API request/response types
export interface CreateProjectRequest {
  name: string
  description?: string
  screenshot_base64?: string | null
  sandbox_id?: string | null
  sandbox_url?: string | null
  files_snapshot?: Record<string, string>
  dependencies?: Record<string, string>
}

export interface UpdateProjectRequest {
  name?: string
  description?: string
  screenshot_base64?: string | null
  screenshot_url?: string | null
  sandbox_id?: string | null
  sandbox_url?: string | null
  files_snapshot?: Record<string, string>
  dependencies?: Record<string, string>
  starred?: boolean
}

export interface ProjectWithMessages extends Project {
  messages: Message[]
}

// UI types for project cards
export interface ProjectCardData {
  id: string
  title: string
  image: string | null // screenshot_url or base64
  lastEdited: string // formatted relative time
  starred: boolean
  sandboxUrl: string | null
}

// Helper to convert Project to ProjectCardData
export function projectToCardData(project: Project): ProjectCardData {
  return {
    id: project.id,
    title: project.name,
    image: project.screenshot_url || project.screenshot_base64 || null,
    lastEdited: formatRelativeTime(project.updated_at),
    starred: project.starred,
    sandboxUrl: project.sandbox_url,
  }
}

// Format relative time (e.g., "2 hours ago", "Yesterday")
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffWeeks === 1) return "1 week ago"
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`

  return date.toLocaleDateString()
}

// =============================================================================
// Token Usage Types
// =============================================================================

/**
 * Token usage record for tracking AI consumption
 */
export interface TokenUsage {
  id: string
  project_id: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  step_number: number | null
  cost_usd: number | null
  timestamp: string
  created_at: string
}

/**
 * Insert type for token usage records
 * Omits auto-generated fields
 */
export interface TokenUsageInsert {
  project_id: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  step_number?: number
  cost_usd?: number
  timestamp?: string
}

/**
 * Aggregated token usage statistics
 */
export interface TokenUsageStats {
  total_prompt_tokens: number
  total_completion_tokens: number
  total_tokens: number
  total_cost_usd: number
  record_count: number
}

/**
 * Token usage query options
 */
export interface TokenUsageQueryOptions {
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}
