# AI SDK v6 Migration Analysis

## Executive Summary

The codebase demonstrates **strong adoption of Vercel AI SDK v6 Beta features** including:
- Multi-step workflows with `stopWhen(stepCountIs())`
- `tool()` function with comprehensive Zod schemas
- `prepareStep()` for dynamic tool activation
- `experimental_repairToolCall()` for error recovery
- `toUIMessageStreamResponse()` for streaming
- Async generator tools for progress streaming
- Tool lifecycle hooks (`onInputStart`, `onInputDelta`, `onInputAvailable`)

However, several gaps exist that could create issues around **security**, **performance**, **observability**, and **production stability**.

---

## 1. Gap Analysis Table

| Feature/Pattern | Current Status | Gap/Issue | Priority | Impact |
|-----------------|----------------|-----------|----------|--------|
| **Rate Limiting on Chat API** | ❌ Missing | No rate limiting on `/api/chat` endpoint | P0 - Critical | High abuse risk |
| **Input Validation** | ⚠️ Partial | Basic validation but Zod schemas not used in chat route | P1 - High | Injection/malformed input risk |
| **API Key Exposure** | ⚠️ Risk | Keys initialized even with empty string fallback | P1 - High | Runtime errors, security |
| **Token Usage Tracking** | ⚠️ Partial | `onStepFinish` logs but doesnt persist or alert | P2 - Medium | Cost monitoring gaps |
| **Context Window Management** | ⚠️ Basic | Only compresses at >30 messages in `prepareStep` | P2 - Medium | Token waste potential |
| **Streaming Error Boundaries** | ⚠️ Partial | Client hook lacks error boundary integration | P2 - Medium | Poor UX on stream failure |
| **Tool Execution Timeouts** | ⚠️ Inconsistent | Some tools have timeouts, others dont | P2 - Medium | Hung operations |
| **Checkpointing** | ✅ Implemented | Task executor has checkpointing support | - | - |
| **Recovery Strategies** | ✅ Implemented | Comprehensive error pattern matching | - | - |
| **Abort Signal Propagation** | ✅ Implemented | Properly passed through streamText | - | - |
| **Tool Lifecycle Hooks** | ✅ Implemented | Using onInputStart, onInputDelta, onInputAvailable | - | - |
| **Async Generator Tools** | ✅ Implemented | createWebsite yields progress updates | - | - |
| **Duplicate Request Prevention** | ❌ Missing | No idempotency keys or request deduplication | P2 - Medium | Double tool executions |
| **Realtime Progress Streaming** | ⚠️ Partial | Progress emitter exists but not wired to data stream | P3 - Low | Reduced UX |
| **Batched State Updates** | ⚠️ Partial | Client hook doesnt batch tool progress updates | P3 - Low | Potential re-renders |
| **Observability/Telemetry** | ⚠️ Basic | Console logs but no structured telemetry | P2 - Medium | Production debugging |

---

## 2. Detailed Findings

### P0 - Critical Issues

#### 2.1 Missing Rate Limiting on Chat API

**Current Behavior:** The `/api/chat` endpoint at [`app/api/chat/route.ts:37`](app/api/chat/route.ts:37) wraps with `withAuth` but has no rate limiting.

**Code Location:**
- [`app/api/chat/route.ts:37-256`](app/api/chat/route.ts:37-256)

**Issue:** Despite having `withRateLimit` middleware in [`lib/rate-limit.ts`](lib/rate-limit.ts:1-150), it is not applied to the chat endpoint. This creates:
- Abuse risk via automated requests
- Potential for API cost explosion
- DoS vector

**SDK v6 Best Practice:** Rate limiting should be applied to all AI-intensive endpoints, especially streaming endpoints.

**Recommended Change:**
```typescript
// Current
export const POST = withAuth(async (req: Request) => {

// Recommended - compose middleware
export const POST = withRateLimit(withAuth(async (req: Request) => {
```

**Alternative API:** Consider using AI SDK's built-in provider rate limiting or implement request queuing.

> **⚠️ Type Compatibility Note**
>
> The existing `withRateLimit` middleware in `lib/rate-limit.ts` expects `NextRequest` (from `next/server`), but the chat route handler receives `Request` (Web API standard). Before composing, either:
>
> 1. **Option A:** Update `withRateLimit` to accept generic `Request`:
>    ```typescript
>    export function withRateLimit<T extends any[]>(
>      handler: (...args: T) => Promise<Response> | Response
>    ) {
>      return async (...args: T): Promise<Response> => {
>        const request = args[0] as Request
>        // Use request.headers.get() instead of NextRequest-specific methods
>    ```
>
> 2. **Option B:** Create a chat-specific rate limiter that works with the streaming response pattern.

---

### P1 - High Priority Issues

#### 2.2 Input Validation Not Using Zod Schemas

**Current Behavior:** [`app/api/chat/route.ts:42-59`](app/api/chat/route.ts:42-59) performs basic validation but doesnt use the comprehensive Zod schemas defined in [`lib/validations.ts`](lib/validations.ts:1-185).

**Code Location:**
- [`app/api/chat/route.ts:42-59`](app/api/chat/route.ts:42-59)
- [`lib/validations.ts:54-58`](lib/validations.ts:54-58) - Existing `chatRequestSchema`

**Current Implementation:**
```typescript
// Basic validation in route.ts
if (!Array.isArray(messages) || messages.length === 0) {
  return Response.json({ error: 'At least one message is required' }, { status: 400 })
}
if (messages.length > 100) {
  return Response.json({ error: 'Too many messages (max 100)' }, { status: 400 })
}
```

**Recommended Change:**
```typescript
import { validateRequest, chatRequestSchema, createValidationErrorResponse, ValidationError } from '@/lib/validations'

// In POST handler
try {
  const body = await req.json()
  const { messages, projectId, model } = validateRequest(chatRequestSchema, body)
  // ... rest of handler
} catch (error) {
  if (error instanceof ValidationError) {
    return createValidationErrorResponse(error)
  }
  throw error
}
```

**Rationale:** Zod validation provides stronger type safety, detailed error messages, and consistent validation behavior.

> **⚠️ IMPORTANT: Schema Update Required**
>
> The existing `chatRequestSchema` uses `chatMessageSchema` which validates `content: z.string()`. However, AI SDK v6 `UIMessage` uses `parts` array instead of `content` string. Before adopting the schema, update `lib/validations.ts`:
>
> ```typescript
> // Update chatMessageSchema for AI SDK v6 UIMessage format
> export const messagePartSchema = z.discriminatedUnion('type', [
>   z.object({ type: z.literal('text'), text: z.string() }),
>   z.object({ type: z.literal('tool-invocation'), toolInvocationId: z.string(), toolName: z.string(), args: z.unknown(), state: z.string().optional() }),
>   z.object({ type: z.literal('tool-result'), toolInvocationId: z.string(), result: z.unknown() }),
> ])
>
> export const uiMessageSchema = z.object({
>   id: z.string().optional(),
>   role: messageRoleSchema,
>   parts: z.array(messagePartSchema).optional(),
>   createdAt: z.coerce.date().optional(),
> })
>
> export const chatRequestSchema = z.object({
>   messages: z.array(uiMessageSchema).min(1).max(100),
>   projectId: projectIdSchema.optional().default('default'),
>   model: modelProviderSchema,
> })
> ```

---

#### 2.3 API Key Initialization Pattern

**Current Behavior:** [`lib/ai/agent.ts:194-204`](lib/ai/agent.ts:194-204)

```typescript
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})
```

**Issue:** Using empty string fallback creates silent failures. The SDK may attempt API calls with invalid keys.

**SDK v6 Best Practice:** Validate API keys at startup or use lazy initialization.

**Recommended Change:**
```typescript
// Option 1: Lazy initialization with validation
function getAnthropicModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required')
  }
  return createAnthropic({ apiKey })('claude-sonnet-4-5')
}

// Option 2: Conditional model availability
export const MODEL_OPTIONS = {
  ...(process.env.ANTHROPIC_API_KEY && {
    anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })('claude-sonnet-4-5'),
  }),
  // ... other models
} as const
```

---

### P2 - Medium Priority Issues

#### 2.4 Token Usage Not Persisted

**Current Behavior:** [`app/api/chat/route.ts:110-121`](app/api/chat/route.ts:110-121)

```typescript
onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
  currentStepNumber++
  console.log(`[Step ${currentStepNumber}] Finished:`, {
    // ...
    tokensUsed: usage?.totalTokens,
  })
}
```

**Issue:** Token usage is logged but not persisted for analytics or cost tracking.

**Recommended Change:**
```typescript
import { logger } from '@/lib/logger'
import { metrics } from '@/lib/metrics' // Need to implement

onStepFinish: async ({ usage, finishReason }) => {
  currentStepNumber++

  // Structured logging
  log.info('step_completed', {
    step: currentStepNumber,
    tokensUsed: usage?.totalTokens,
    promptTokens: usage?.promptTokens,
    completionTokens: usage?.completionTokens,
    finishReason,
    projectId,
  })

  // Metrics collection
  if (usage) {
    metrics.recordTokenUsage({
      projectId,
      model: model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    })
  }
}
```

---

#### 2.5 Context Window Compression Too Simple

**Current Behavior:** [`app/api/chat/route.ts:132-138`](app/api/chat/route.ts:132-138)

```typescript
if (stepMessages.length > 30) {
  console.log(`[Step ${stepNumber}] Compressing conversation history`)
  config.messages = [
    stepMessages[0], // system message
    ...stepMessages.slice(-20),
  ]
}
```

**Issue:**
- Fixed threshold of 30 messages doesn't account for message size
- Loses important context when truncating
- No token counting for accurate context management

**SDK v6 Best Practice:** Use token-aware context compression.

**Recommended Change:**
```typescript
prepareStep: async ({ stepNumber, messages: stepMessages }) => {
  // Calculate approximate token count
  const estimatedTokens = estimateTokenCount(stepMessages)
  const maxContextTokens = modelSettings.maxTokens ? modelSettings.maxTokens * 0.7 : 8000

  if (estimatedTokens > maxContextTokens) {
    // Summarize older messages instead of discarding
    const summaryPrompt = `Summarize the key context from these messages: ${JSON.stringify(stepMessages.slice(1, -10))}`
    // ... create summary and replace middle messages
  }
}
```

---

#### 2.6 Inconsistent Tool Timeouts

**Current Behavior:** Various timeout configurations across tools:
- [`lib/ai/web-builder-agent.ts:778`](lib/ai/web-builder-agent.ts:778): 60000ms default for `runCommand`
- [`lib/ai/web-builder-agent.ts:869`](lib/ai/web-builder-agent.ts:869): 120000ms for `installPackage`
- [`lib/ai/web-builder-agent.ts:1143`](lib/ai/web-builder-agent.ts:1143): 300000ms for pnpm install in `createWebsite`
- Other tools: No explicit timeout

**Issue:** Tools like `readFile`, `writeFile`, `editFile` have no timeout protection.

**Recommended Change:** Add consistent timeout wrapper:
```typescript
// lib/ai/tools/timeout.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
  )
  return Promise.race([promise, timeoutPromise])
}
```

---

#### 2.7 Missing Request Deduplication

**Current Behavior:** No idempotency key handling in chat route.

**Issue:** Network retries or user double-clicks can trigger duplicate tool executions.

**Recommended Change:**
```typescript
// Add to chat route
const idempotencyKey = req.headers.get('x-idempotency-key')
if (idempotencyKey) {
  const cached = await getCachedResponse(idempotencyKey)
  if (cached) return cached
}

// ... process request

// Cache response
if (idempotencyKey) {
  await cacheResponse(idempotencyKey, response, 60) // 60s TTL
}
```

---

#### 2.8 Observability Gaps

**Current Behavior:** Mixed usage - the chat route at [`app/api/chat/route.ts:18-19, 39, 61`](app/api/chat/route.ts:18) already imports `logger` and creates a child logger with `requestId` and `operation` context. However, `console.log` statements are still used for step tracking and tool execution.

**Issue:**

- ✅ Correlation IDs partially implemented (requestId in chat route)
- ⚠️ Inconsistent: `console.log` used in `onStepFinish` and `prepareStep` callbacks
- ❌ No structured telemetry for production monitoring (metrics not exported)
- ❌ Missing tracing integration (OpenTelemetry)

**Current Implementation (already exists):**

```typescript
// app/api/chat/route.ts:38-39 - Already implemented
const requestId = req.headers.get('x-request-id') ?? 'unknown'
const log = logger.child({ requestId, operation: 'chat' })
```

**Recommended Change:** Extend existing logger usage to cover callbacks:

```typescript
// Replace console.log in onStepFinish with structured logging
onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
  currentStepNumber++
  log.info('step_completed', {
    step: currentStepNumber,
    finishReason,
    toolCallsCount: toolCalls?.length || 0,
    tokensUsed: usage?.totalTokens,
    projectId,
  })
}

// Replace console.log in prepareStep
prepareStep: async ({ stepNumber, messages: stepMessages }) => {
  if (stepMessages.length > 30) {
    log.info('context_compression', {
      stepNumber,
      originalCount: stepMessages.length,
      newCount: 21
    })
  }
  // ...
}
```

---

### P3 - Low Priority Issues

#### 2.9 Progress Streaming Not Fully Wired

**Current Behavior:**
- [`lib/ai/stream-progress.ts`](lib/ai/stream-progress.ts:1-209) defines `createProgressEmitter`
- [`lib/ai/web-builder-agent.ts:1076-1231`](lib/ai/web-builder-agent.ts:1076-1231) `createWebsite` yields progress
- But streaming via `dataStream.writeData()` isn't integrated

**Issue:** Real-time progress updates available in tool but not streamed to client.

**Recommended Enhancement:** Integrate data streaming for tool progress:
```typescript
// In streamText call, add createDataStreamResponse wrapper
import { createDataStreamResponse, streamText } from 'ai'

return createDataStreamResponse({
  execute: async (dataStream) => {
    const result = streamText({
      // ... existing config
      onChunk: ({ chunk }) => {
        if (chunk.type === 'tool-call') {
          dataStream.writeData({ type: 'tool-start', toolName: chunk.toolName })
        }
      }
    })
    result.mergeIntoDataStream(dataStream)
  }
})
```

---

#### 2.10 Client Hook Re-render Optimization

**Current Behavior:** [`hooks/use-chat-with-tools.ts`](hooks/use-chat-with-tools.ts:1-224)

**Issue:** Tool progress checks run on every render:
```typescript
const hasActiveToolCalls = isAssistantMessage && lastMessage?.parts?.some(...)
```

**Recommended Change:** Memoize derived state:
```typescript
const hasActiveToolCalls = useMemo(() => {
  if (!isAssistantMessage || !lastMessage?.parts) return false
  return lastMessage.parts.some(
    (part: { type: string; state?: string }) =>
      part.type.startsWith('tool-') &&
      (part.state === 'input-streaming' || part.state === 'input-available')
  )
}, [isAssistantMessage, lastMessage?.parts])
```

---

## 3. Recommendations by Priority

### Critical - P0

| # | Issue | Location | Recommendation | Effort |
|---|-------|----------|----------------|--------|
| 1 | No rate limiting on chat | [`app/api/chat/route.ts:37`](app/api/chat/route.ts:37) | Compose `withRateLimit` with `withAuth` | Low |

### High - P1

| # | Issue | Location | Recommendation | Effort |
|---|-------|----------|----------------|--------|
| 2 | Input validation incomplete | [`app/api/chat/route.ts:42-59`](app/api/chat/route.ts:42-59) | Use `chatRequestSchema` from validations.ts | Low |
| 3 | API key empty fallback | [`lib/ai/agent.ts:194-204`](lib/ai/agent.ts:194-204) | Add startup validation or lazy init | Low |

### Medium - P2

| # | Issue | Location | Recommendation | Effort |
|---|-------|----------|----------------|--------|
| 4 | Token usage not persisted | [`app/api/chat/route.ts:110-121`](app/api/chat/route.ts:110-121) | Add metrics recording in onStepFinish | Medium |
| 5 | Context compression naive | [`app/api/chat/route.ts:132-138`](app/api/chat/route.ts:132-138) | Implement token-aware compression | Medium |
| 6 | Inconsistent tool timeouts | [`lib/ai/web-builder-agent.ts`](lib/ai/web-builder-agent.ts) | Create timeout wrapper utility | Low |
| 7 | No request deduplication | [`app/api/chat/route.ts`](app/api/chat/route.ts) | Add idempotency key handling | Medium |
| 8 | Observability gaps | Multiple files | Consistent structured logging | Medium |

### Low - P3

| # | Issue | Location | Recommendation | Effort |
|---|-------|----------|----------------|--------|
| 9 | Progress streaming not wired | [`lib/ai/stream-progress.ts`](lib/ai/stream-progress.ts) | Integrate createDataStreamResponse | Medium |
| 10 | Client re-renders | [`hooks/use-chat-with-tools.ts`](hooks/use-chat-with-tools.ts) | Memoize derived state | Low |

---

## 4. Migration Plan

### Phase 1: Critical Fixes

**Dependencies:** None

**Changes:**
1. Add rate limiting to chat endpoint
2. Integrate Zod validation
3. Fix API key initialization

**Files Modified:**
- [`app/api/chat/route.ts`](app/api/chat/route.ts)
- [`lib/ai/agent.ts`](lib/ai/agent.ts)

**Testing Requirements:**
- Load testing for rate limiting
- Validation error scenarios
- Missing API key handling

**Rollback:** Revert single PR

---

### Phase 2: High-Priority Improvements

**Dependencies:** Phase 1 complete

**Changes:**
1. Implement token usage metrics
2. Add tool execution timeouts
3. Implement idempotency handling
4. Improve structured logging

**Files Modified:**
- [`app/api/chat/route.ts`](app/api/chat/route.ts)
- [`lib/ai/web-builder-agent.ts`](lib/ai/web-builder-agent.ts)
- [`lib/metrics.ts`](lib/metrics.ts) - Extend existing file with `recordTokenUsage()` method
- [`lib/ai/tools/timeout.ts`](lib/ai/tools/timeout.ts) - New file

**Testing Requirements:**
- Metrics collection verification
- Timeout scenario testing
- Duplicate request handling
- Log output verification

**Rollback:** Feature flags for new functionality

---

### Phase 3: Optimization and Polish

**Dependencies:** Phase 2 complete

**Changes:**
1. Token-aware context compression
2. Data stream integration for progress
3. Client hook optimization
4. Enhanced telemetry

**Files Modified:**
- [`app/api/chat/route.ts`](app/api/chat/route.ts)
- [`lib/ai/stream-progress.ts`](lib/ai/stream-progress.ts)
- [`hooks/use-chat-with-tools.ts`](hooks/use-chat-with-tools.ts)
- [`lib/ai/context-compression.ts`](lib/ai/context-compression.ts) - New file

**Testing Requirements:**
- Performance benchmarking
- Token counting accuracy
- UI responsiveness testing
- End-to-end streaming tests

**Rollback:** Gradual rollout with feature flags

---

## 5. Risks and Compatibility Issues

### Breaking Changes

1. **Rate limiting** may reject legitimate high-volume users
   - Mitigation: Start with generous limits, monitor, adjust

2. **Strict validation** may reject previously-accepted malformed requests
   - Mitigation: Log validation failures before enforcing

3. **API key validation** at startup may prevent app from starting
   - Mitigation: Use lazy initialization pattern

### API Stability Concerns

1. **`experimental_repairToolCall`** - experimental API may change
   - Current usage: [`app/api/chat/route.ts:159-198`](app/api/chat/route.ts:159-198)
   - Risk: Medium - API surface is stable but marked experimental

2. **`toUIMessageStreamResponse`** - part of v6 beta
   - Current usage: [`app/api/chat/route.ts:202`](app/api/chat/route.ts:202)
   - Risk: Low - Core streaming API unlikely to change significantly

3. **Tool lifecycle hooks** - relatively new
   - Current usage: [`lib/ai/web-builder-agent.ts:1046-1060`](lib/ai/web-builder-agent.ts:1046-1060)
   - Risk: Low - Callback signature stable

### Performance Implications

1. **Rate limit store in memory** - current implementation at [`lib/rate-limit.ts:8`](lib/rate-limit.ts:8)
   - Issue: In-memory store doesn't scale across instances
   - Mitigation: Redis-based rate limiting for production

2. **Context compression** - additional processing per step
   - Mitigation: Lazy compression only when needed

### Testing Coverage Gaps

1. No integration tests for streaming behavior
2. No load tests for concurrent chat sessions
3. Missing tests for error recovery scenarios
4. Tool timeout behavior untested

### Data Migration Risks

1. **Schema validation change may break message restoration**
   - Current database stores messages with `content` field
   - New `UIMessage` format uses `parts` array
   - Risk: Existing conversations may fail validation after schema update
   - Mitigation: Add backward-compatible parsing that handles both formats:

     ```typescript
     // In uiMessageSchema, make parts optional and support legacy content
     export const uiMessageSchema = z.object({
       id: z.string().optional(),
       role: messageRoleSchema,
       content: z.string().optional(), // Legacy support
       parts: z.array(messagePartSchema).optional(),
       createdAt: z.coerce.date().optional(),
     }).refine(
       data => data.parts || data.content,
       { message: 'Either parts or content must be provided' }
     )
     ```

2. **Serverless rate limiting limitations**
   - In-memory `Map` in `lib/rate-limit.ts:8` resets per instance
   - Vercel/serverless deployments don't share memory
   - Mitigation: Use Upstash Redis (already configured for caching per CLAUDE.md)

---

## 6. Quick Wins

Items that can be implemented quickly with high impact:

### 1. Add Rate Limiting - Effort: 15 minutes

```typescript
// app/api/chat/route.ts
import { withRateLimit } from '@/lib/rate-limit'

export const POST = withRateLimit(withAuth(async (req: Request) => {
  // ... existing code
}))
```

### 2. Use Existing Validation Schema - Effort: 20 minutes

```typescript
// app/api/chat/route.ts
import { validateRequest, chatRequestSchema, ValidationError, createValidationErrorResponse } from '@/lib/validations'

// Replace manual validation with:
const body = await req.json()
const validated = validateRequest(chatRequestSchema, body)
```

### 3. Fix API Key Pattern - Effort: 10 minutes

```typescript
// lib/ai/agent.ts
const anthropic = process.env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

export const MODEL_OPTIONS = {
  ...(anthropic && { anthropic: anthropic('claude-sonnet-4-5') }),
  // ... other models
} as const
```

### 4. Add Tool Timeout Utility - Effort: 30 minutes

Create [`lib/ai/tools/timeout.ts`](lib/ai/tools/timeout.ts) and wrap long-running operations.

### 5. Memoize Hook Values - Effort: 10 minutes

```typescript
// hooks/use-chat-with-tools.ts
const hasActiveToolCalls = useMemo(() => /* ... */, [deps])
```

---

## Appendix: Current Feature Matrix

| AI SDK v6 Feature | Status | Location |
|-------------------|--------|----------|
| `streamText()` | ✅ | [`app/api/chat/route.ts:98`](app/api/chat/route.ts:98) |
| `stopWhen(stepCountIs())` | ✅ | [`app/api/chat/route.ts:105`](app/api/chat/route.ts:105) |
| `tool()` with Zod | ✅ | [`lib/ai/web-builder-agent.ts`](lib/ai/web-builder-agent.ts) |
| `prepareStep()` | ✅ | [`app/api/chat/route.ts:124`](app/api/chat/route.ts:124) |
| `experimental_repairToolCall()` | ✅ | [`app/api/chat/route.ts:159`](app/api/chat/route.ts:159) |
| `toUIMessageStreamResponse()` | ✅ | [`app/api/chat/route.ts:202`](app/api/chat/route.ts:202) |
| `onStepFinish` | ✅ | [`app/api/chat/route.ts:110`](app/api/chat/route.ts:110) |
| `useChat()` | ✅ | [`hooks/use-chat-with-tools.ts:89`](hooks/use-chat-with-tools.ts:89) |
| `DefaultChatTransport` | ✅ | [`hooks/use-chat-with-tools.ts:80`](hooks/use-chat-with-tools.ts:80) |
| Async generator tools | ✅ | [`lib/ai/web-builder-agent.ts:1063`](lib/ai/web-builder-agent.ts:1063) |
| Tool lifecycle hooks | ✅ | [`lib/ai/web-builder-agent.ts:1046`](lib/ai/web-builder-agent.ts:1046) |
| `convertToModelMessages()` | ✅ | [`app/api/chat/route.ts:72`](app/api/chat/route.ts:72) |
| Data streaming | ⚠️ Partial | Progress emitter exists, not wired |

---

## Verification Review

Reviewed: 2026-01-24

This document has been verified against the actual codebase. The following corrections were made during review:

| Original Claim | Correction |
| -------------- | ---------- |
| `lib/metrics.ts` - New file | File already exists; needs extension with `recordTokenUsage()` |
| `chatRequestSchema` ready to use | Schema uses `content` field; needs update for AI SDK v6 `parts` format |
| `withRateLimit` can be directly composed | Type mismatch: expects `NextRequest`, chat route uses `Request` |
| Logger not used in chat route | Logger IS used with `requestId` context; issue is inconsistent usage in callbacks |
| No correlation IDs | Partially implemented via `requestId` header in chat route |

**Verification Status:** All line number references verified accurate. AI SDK v6 feature matrix confirmed.

---

Document generated: 2026-01-24

Based on Vercel AI SDK v6 Beta best practices

Verified against codebase: 2026-01-24
