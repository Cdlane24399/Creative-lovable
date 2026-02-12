# Direct Speedup Plan for AI Web-App Generation (No Feature Flags)

## Summary
- Plan artifact target path: `/Volumes/ssd/developer/Creative-lovable/.claude/plans/ai-generation-speedup-direct-implementation.md`.
- This plan is for direct rollout with no feature flags or staged toggles.
- Primary KPI: reduce `Preview Ready Time` (prompt submit to first live preview URL) by at least 40%.
- Secondary KPIs: reduce TTFT (time to first streamed token) and Files Ready time.
- Current bottlenecks are confirmed in `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts`, `/Volumes/ssd/developer/Creative-lovable/lib/ai/tools/batch-file.tools.ts`, `/Volumes/ssd/developer/Creative-lovable/lib/e2b/sync-manager.ts`, `/Volumes/ssd/developer/Creative-lovable/lib/ai/agent-context.ts`, `/Volumes/ssd/developer/Creative-lovable/app/api/sandbox/[projectId]/dev-server/route.ts`, `/Volumes/ssd/developer/Creative-lovable/hooks/use-chat-with-tools.ts`, and `/Volumes/ssd/developer/Creative-lovable/components/chat/chat-markdown.tsx`.

## Root Causes To Fix
1. Pre-stream probe fallback adds startup latency before content in `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts`.
2. Over-large system prompt and high step limits increase agent loop duration in `/Volumes/ssd/developer/Creative-lovable/lib/ai/agent.ts` and `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts`.
3. `batchWriteFiles` is sequential and blocks on sync in `/Volumes/ssd/developer/Creative-lovable/lib/ai/tools/batch-file.tools.ts`.
4. Quick sync unnecessarily starts file watcher and hashing via `initialize()` in `/Volumes/ssd/developer/Creative-lovable/lib/e2b/sync-manager.ts`.
5. Context persistence writes too often and does redundant project existence checks in `/Volumes/ssd/developer/Creative-lovable/lib/ai/agent-context.ts` and `/Volumes/ssd/developer/Creative-lovable/lib/db/repositories/context.repository.ts`.
6. Dev-server startup path waits too long and clears `.next` too aggressively in `/Volumes/ssd/developer/Creative-lovable/app/api/sandbox/[projectId]/dev-server/route.ts`.
7. Streaming UI rerenders too often and markdown renderer is not optimized for incremental streams in `/Volumes/ssd/developer/Creative-lovable/hooks/use-chat-with-tools.ts`, `/Volumes/ssd/developer/Creative-lovable/components/chat/message-list.tsx`, `/Volumes/ssd/developer/Creative-lovable/components/chat/chat-markdown.tsx`.
8. Suggestion tool calls add extra loop work even though client fallback suggestions already exist in `/Volumes/ssd/developer/Creative-lovable/lib/ai/tools/suggestion.tools.ts` and `/Volumes/ssd/developer/Creative-lovable/components/chat/suggestion-chips.tsx`.

## Implementation Plan (Direct, Complete)
1. Remove pre-stream probe logic in `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts` by deleting `selectStreamWithGatewayFallback` usage and streaming gateway output immediately. Keep one catch-level fallback to OpenRouter only if gateway stream initialization throws.
2. Implement Hybrid Fast model policy in `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts`: first-turn scaffold requests run on `google`, later turns use selected model. Keep UI model selector unchanged.
3. Reduce max agent steps directly in `/Volumes/ssd/developer/Creative-lovable/lib/ai/agent.ts`: `google` to 18, all others to 24 unless explicitly constrained by provider token limits.
4. Shrink and de-duplicate system prompt in `/Volumes/ssd/developer/Creative-lovable/lib/ai/agent.ts`: keep only mandatory build constraints, remove repeated examples and mandatory suggestion-tool instruction.
5. Remove suggestion tool from agent toolchain in `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts`, `/Volumes/ssd/developer/Creative-lovable/lib/ai/web-builder-agent.ts`, and `/Volumes/ssd/developer/Creative-lovable/lib/ai/tools/suggestion.tools.ts` (delete usage and registry references).
6. Optimize `batchWriteFiles` in `/Volumes/ssd/developer/Creative-lovable/lib/ai/tools/batch-file.tools.ts`: pre-create directories once, write files with bounded concurrency, avoid content-read checks for pure creates, bulk update context once, and do not await sync before returning success.
7. Replace quick sync path in `/Volumes/ssd/developer/Creative-lovable/lib/e2b/sync-manager.ts`: create a direct snapshot sync routine that does not start watcher/hash polling. Update retry logic so `filesWritten=0` with no errors is success, not retry.
8. Keep persistence safety by triggering a guaranteed final sync on chat completion in `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts`, but keep it fire-and-forget so response is never blocked.
9. Debounce context persistence in `/Volumes/ssd/developer/Creative-lovable/lib/ai/agent-context.ts` using per-project coalescing (500ms idle flush, 2s max delay) and add explicit flush on critical boundaries (`onFinish`).
10. Remove redundant `projectRepo.exists()` round trip from context upsert path in `/Volumes/ssd/developer/Creative-lovable/lib/db/repositories/context.repository.ts`; use single ensure/upsert path.
11. Speed dev-server startup in `/Volumes/ssd/developer/Creative-lovable/app/api/sandbox/[projectId]/dev-server/route.ts`: shorten template grace wait (12s to 4s), stop deleting `.next` except forced restart/fatal recovery, tighten readiness checks to port-listening first, fail faster on fatal logs.
12. Tune polling behavior in `/Volumes/ssd/developer/Creative-lovable/hooks/use-dev-server.ts`: fast start polling with bounded backoff and immediate stop when POST already returns URL.
13. Integrate Streamdown directly by adding `streamdown` dependency in `/Volumes/ssd/developer/Creative-lovable/package.json`, replacing renderer in `/Volumes/ssd/developer/Creative-lovable/components/chat/chat-markdown.tsx`, and adding Tailwind source include in `/Volumes/ssd/developer/Creative-lovable/app/globals.css`.
14. Reduce client render thrash in `/Volumes/ssd/developer/Creative-lovable/hooks/use-chat-with-tools.ts` and `/Volumes/ssd/developer/Creative-lovable/components/chat/message-list.tsx`: enable `experimental_throttle`, guard autoscroll to near-bottom state, and avoid full-list recompute per chunk.
15. Replace server-generated suggestions with local heuristic suggestions in `/Volumes/ssd/developer/Creative-lovable/components/chat/message-list.tsx` and `/Volumes/ssd/developer/Creative-lovable/components/chat/suggestion-chips.tsx`.

## Public API / Interface / Type Changes
- Internal tool API change: remove `generateSuggestions` tool from active tool lists and tool registry.
- Internal type change: update `ToolName` union in `/Volumes/ssd/developer/Creative-lovable/app/api/chat/route.ts` to remove `generateSuggestions`.
- Tool contract change: `batchWriteFiles.filesReady` means files are written in sandbox immediately; database sync is asynchronous.
- No external REST route path changes.
- No database schema migration required.

## Test Cases and Scenarios
1. Unit: chat route starts stream without probe delay and still falls back when gateway init fails.
2. Unit: first-turn model resolution uses `google` and subsequent turns respect selected model.
3. Unit: `batchWriteFiles` writes in parallel, returns before sync completion, and preserves result correctness.
4. Unit: quick sync no longer calls watcher `initialize()` and succeeds with zero-file delta.
5. Unit: context persistence debounces bursts of updates into coalesced writes and flushes at finish.
6. Unit: message list suggestions render without tool output path.
7. Integration: end-to-end chat scaffolding returns first visible stream chunk under target TTFT.
8. Integration: files-ready signal appears before full DB sync completion and preview still starts correctly.
9. Integration: dev-server POST returns usable URL faster and avoids unnecessary `.next` rebuild.
10. E2E (Playwright): full “create app” flow confirms chat response, files visible, and preview URL live.

## Acceptance Criteria
- TTFT p50 <= 1.8s and p95 <= 3.5s.
- Files Ready p50 <= 18s for a standard 8-15 file scaffold request.
- Preview Ready p50 <= 35s and p95 <= 60s with template configured.
- No increase in chat/tool error rate relative to current baseline.
- No functional regression in project persistence and restore behavior.

## Rollout and Monitoring
1. Implement and ship all listed changes in one direct rollout (no flags).
2. Capture and compare latency metrics for 24 hours post-deploy.
3. Validate top user journeys: new project scaffold, multi-file edit, preview restart.
4. If regression occurs, rollback by commit reversion (not runtime toggles).

## Assumptions and Defaults
- `E2B_TEMPLATE` remains configured and valid in runtime.
- AI Gateway remains primary transport; OpenRouter remains available for hard fallback.
- Existing database schema and cache layer stay unchanged.
- First-turn scaffold detection uses conversation shape (new-project turn) and defaults to fast model directly.
