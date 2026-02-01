# Fix Sandbox Restoration, Screenshots, Code Tab, and Template Issues

## Summary

Four interconnected issues - screenshots now fixed via E2B Desktop SDK:
1. **Sandbox/chat not restorable** after ~30 minutes (files not synced before expiration)
2. **✅ Screenshots** - Now use E2B Desktop SDK native screenshots (replaces external API)
3. **Code tab blank** (sync failures silent, no retry logic)
4. **Template requires AI fixes** before packages work (pnpm-workspace.yaml, next.config issues)

---

## Phase 1: Fix E2B Template (Issue 4)

**Problem**: `create-next-app` generates files that break package installation.

**Files to modify**:
- [nextjs-shadcn.e2b.Dockerfile](lib/e2b/templates/nextjs-shadcn.e2b.Dockerfile)
- [sandbox.ts](lib/e2b/sandbox.ts) (add runtime fallback cleanup)

**Changes**:
1. Add cleanup step after `create-next-app` in Dockerfile:
   ```dockerfile
   # After line 22
   RUN rm -f pnpm-workspace.yaml && \
       mv next.config.ts next.config.mjs 2>/dev/null || true
   ```

2. Add runtime cleanup fallback in `sandbox.ts` for existing templates:
   - New function `cleanupTemplateArtifacts()`
   - Called after sandbox creation when using template

**Verification**: Create new sandbox, verify no pnpm-workspace.yaml exists

---

## Phase 2: Fix Code Tab Sync (Issue 3)

**Problem**: `quickSyncToDatabase()` failures are silently logged, no retry, client doesn't know when sync completes.

**Files to modify**:
- [sync-manager.ts:619-636](lib/e2b/sync-manager.ts#L619-L636) - Add retry wrapper
- [web-builder-agent.ts:1170-1180](lib/ai/web-builder-agent.ts#L1170-L1180) - Use retry-based sync
- [code-editor.tsx](components/code-editor.tsx) - Add loading state
- [editor-layout.tsx](components/editor-layout.tsx) - Poll for files instead of fixed timeout

**Changes**:
1. Create `quickSyncToDatabaseWithRetry()` with:
   - 3 retry attempts with exponential backoff
   - Validation that files were actually written
   - Returns retry count for debugging

2. Update `createWebsite` tool to:
   - Use retry-based sync
   - Include sync status in result

3. Update CodeEditor to show "Syncing files..." loading state

4. Replace fixed 2-second timeout with polling for `files_snapshot`

**Verification**: Generate website, immediately check Code tab shows files

---

## Phase 3: Pre-expiration Sync (Issue 1)

**Problem**: Sandboxes expire after 30 min without syncing files first.

**Files to modify**:
- [sandbox.ts:68-94](lib/e2b/sandbox.ts#L68-L94) - Modify cleanup logic

**Changes**:
1. Add constant: `SYNC_BEFORE_EXPIRY_MS = 5 * 60 * 1000` (5 min warning)

2. Update `cleanupExpiredSandboxes()` to:
   - Check for sandboxes within 5 min of expiry
   - Sync files to database before marking expired
   - Track pending syncs to avoid duplicates

3. Add `scheduleSync()` for activity-based syncing:
   - Called from `updateSandboxActivity()`
   - Debounced 30 seconds after last activity
   - Ensures files are synced during normal use

**Verification**:
- Create project, wait 30+ minutes
- Reopen project - should restore with all files

---

## Phase 4: Screenshot Improvements (Issue 2) ✅ DONE

**Problem**: Screenshots were using external ScreenshotAPI.net which required API keys.

**Solution**: Replaced with headless Playwright running inside the E2B sandbox.

**Files modified**:
- `lib/e2b/sandbox.ts` - Added `captureSandboxScreenshot()` using Playwright
- `app/api/screenshot/route.ts` - Updated to use sandbox-based screenshots
- `lib/utils/screenshot.ts` - Updated client utilities
- `components/editor-layout.tsx` - Pass projectId to enable screenshots

**Implementation**:
1. Uses the regular E2B sandbox (where the dev server runs)
2. Installs Playwright on-demand in the sandbox
3. Captures screenshot using headless Chromium via Playwright
4. Falls back to ImageMagick/Python PIL if Playwright unavailable
5. Returns base64-encoded PNG

**Benefits**:
- No external API key needed
- Direct access to the dev server (same network)
- No Desktop SDK complexity
- Lightweight - only installs browser when needed
- Multiple fallback options

**Verification**:
- Screenshots captured via Playwright in sandbox
- Fallback to placeholder on error
- Manual capture button triggers new screenshot

---

## Implementation Order

1. **Phase 1** (Template) - Rebuild E2B template, lowest risk
2. **Phase 2** (Code Tab) - Immediate UX improvement
3. **Phase 3** (Pre-expiration) - Data durability fix
4. **Phase 4** (Screenshots) - Enhancement with documentation

---

## Testing Checklist

- [ ] New sandbox has no pnpm-workspace.yaml
- [ ] Code tab shows files immediately after generation
- [ ] Project restores after 30+ minutes idle
- [x] Screenshot capture works via E2B Desktop SDK
- [x] Placeholder shown on screenshot failure

---

## Critical Files

| File | Changes |
|------|---------|
| `lib/e2b/templates/nextjs-shadcn.e2b.Dockerfile` | Add cleanup commands |
| `lib/e2b/sandbox.ts` | Pre-expiration sync, template cleanup |
| `lib/e2b/sync-manager.ts` | Add retry wrapper function |
| `lib/ai/web-builder-agent.ts` | Use retry-based sync |
| `components/code-editor.tsx` | Loading state |
| `components/editor-layout.tsx` | Polling, screenshot handler |
| `components/preview-panel.tsx` | Screenshot button |
