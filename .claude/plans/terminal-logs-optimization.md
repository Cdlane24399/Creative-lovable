# Terminal Logs Optimization Plan

## Executive Summary

Analysis of the terminal logs reveals **5 critical issues** affecting system reliability and performance. This plan provides fixes in priority order based on impact and complexity.

---

## Issue Analysis

### Issue 1: Screenshot Capture Failing (CRITICAL)

**Root Cause:** The E2B Dockerfile installs `@playwright/test` globally, but the screenshot script uses `require('playwright')` - a different package.

**Evidence:**
```
Error: Cannot find module 'playwright'
Require stack: /tmp/screenshot.js
```

**Secondary Issue:** PIL (Python Pillow) not installed for ImageMagick fallback.
```
ModuleNotFoundError: No module named 'PIL'
```

**Files Affected:**
- [nextjs-shadcn.e2b.Dockerfile](lib/e2b/templates/nextjs-shadcn.e2b.Dockerfile#L38-L41)
- [sandbox.ts:1572](lib/e2b/sandbox.ts#L1572) - Screenshot script

---

### Issue 2: E2B Command Timeouts (HIGH)

**Root Cause:** Commands using 2-5 second timeouts are hitting `deadline_exceeded` errors. The sandbox is under load from dev server startup.

**Evidence:**
```
[E2B] Command failed: "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000..."
error: "[deadline_exceeded] the operation timed out..."
durationMs: 5000
```

**Pattern:** This happens repeatedly during dev server polling when the Next.js compilation is still running.

**Files Affected:**
- [dev-server/route.ts:354-358](app/api/sandbox/[projectId]/dev-server/route.ts#L354-L358) - curl timeout 5000ms
- [dev-server/route.ts:346-348](app/api/sandbox/[projectId]/dev-server/route.ts#L346-L348) - grep timeout 2000ms

---

### Issue 3: Slow API Responses (MEDIUM)

**Root Cause:** `/api/projects?limit=50` takes 2.1-2.6s in render time, indicating slow database queries.

**Evidence:**
```
GET /api/projects?limit=50 200 in 3.1s (compile: 71ms, proxy.ts: 384ms, render: 2.6s)
GET /api/projects?limit=50 200 in 2.4s (compile: 7ms, proxy.ts: 264ms, render: 2.1s)
```

**Likely Causes:**
- No database indexes on frequently-queried columns
- N+1 queries when fetching project lists
- Missing cache warmup

---

### Issue 4: Dev Server Polling Inefficiency (MEDIUM)

**Root Cause:** The polling loop runs commands that timeout, then keeps retrying every second for up to 120 seconds.

**Evidence:** The logs show repeated timeout failures:
```
[dev-server POST] Found port 3000 in logs, verifying with HTTP check...
[E2B] Command failed: "curl..." deadline_exceeded
[dev-server POST] Still waiting... 5s elapsed
[dev-server POST] Still waiting... 10s elapsed
...continues for 30+ seconds
```

---

### Issue 5: Package Installation Failures (LOW)

**Root Cause:** `pnpm add` fails with exit status 1, likely due to sandbox state or network issues.

**Evidence:**
```
[E2B] Command failed: "cd "/home/user/project" && pnpm add three @types/three..."
error: 'exit status 1'
hint: 'Check if lock files are conflicting (pnpm-lock.yaml vs package-lock.json)'
```

---

## Implementation Plan

### Phase 1: Fix Screenshot Capture (Priority: CRITICAL)

#### Step 1.1: Update E2B Dockerfile

**File:** `lib/e2b/templates/nextjs-shadcn.e2b.Dockerfile`

**Changes:**
1. Install `playwright` package (not just `@playwright/test`)
2. Install Python3 PIL/Pillow for fallback
3. Pre-install Chromium for Playwright

```dockerfile
# Replace lines 38-41 with:
RUN npm install -g playwright && \
    npx playwright install chromium --with-deps

# Add Python Pillow for ImageMagick fallback
RUN apt-get update && apt-get install -y python3-pil && rm -rf /var/lib/apt/lists/*
```

#### Step 1.2: Update Screenshot Script (Optional Improvement)

**File:** `lib/e2b/sandbox.ts` around line 1572

Consider using `playwright` directly instead of `@playwright/test`:
```javascript
const { chromium } = require('playwright');
```

**Verification:** Build and deploy new E2B template, test screenshot capture.

---

### Phase 2: Fix Command Timeouts (Priority: HIGH)

#### Step 2.1: Increase Timeout for Health Checks

**File:** `app/api/sandbox/[projectId]/dev-server/route.ts`

**Changes:**
1. Increase curl timeout from 5000ms to 15000ms
2. Increase grep timeout from 2000ms to 5000ms
3. Add retry logic with exponential backoff

```typescript
// Line 354-358: Increase timeout
const httpCheck = await executeCommand(
  sandbox,
  `curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:${logPort} 2>/dev/null || echo "000"`,
  { timeoutMs: 15000 }  // Was 5000
)

// Line 346-348: Increase timeout
const logCheck = await executeCommand(
  sandbox,
  `grep -oE "http://localhost:[0-9]+" /tmp/server.log 2>/dev/null | tail -1 | grep -oE "[0-9]+$" || echo ""`,
  { timeoutMs: 5000 }  // Was 2000
)
```

#### Step 2.2: Smart Polling Strategy

**File:** `app/api/sandbox/[projectId]/dev-server/route.ts`

**Changes:**
1. Start with longer poll intervals (2s instead of 1s)
2. Use exponential backoff after initial fast checks
3. Skip health check if compilation is still running

```typescript
// Replace fixed pollInterval with adaptive strategy
const pollIntervals = [1000, 1000, 2000, 2000, 3000, 3000, 5000]; // Progressive
let pollIndex = 0;

for (let i = 0; i < maxPolls; i++) {
  const currentInterval = pollIntervals[Math.min(pollIndex++, pollIntervals.length - 1)];
  await new Promise(resolve => setTimeout(resolve, currentInterval));
  // ... rest of polling logic
}
```

---

### Phase 3: Optimize API Response Times (Priority: MEDIUM)

#### Step 3.1: Add Database Indexes

**Migration file:** `supabase/migrations/YYYYMMDD_add_performance_indexes.sql`

```sql
-- Index for project listing queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id_updated_at
ON projects(user_id, updated_at DESC);

-- Index for starred filter
CREATE INDEX IF NOT EXISTS idx_projects_user_id_starred
ON projects(user_id, is_starred) WHERE is_starred = true;

-- Index for sandbox lookups
CREATE INDEX IF NOT EXISTS idx_projects_sandbox_id
ON projects(sandbox_id) WHERE sandbox_id IS NOT NULL;
```

#### Step 3.2: Optimize Project Query

**File:** `lib/db/repositories/project.repository.ts`

**Changes:**
1. Select only required columns instead of `*`
2. Limit JSONB field fetching in list queries
3. Use query hints for better planning

```typescript
// In findAll method, select specific columns
.select('id, name, description, thumbnail_url, is_starred, updated_at, created_at')
// Don't fetch heavy JSONB fields (files_snapshot, dependencies) in list view
```

#### Step 3.3: Improve Cache Utilization

**File:** `lib/services/project.service.ts`

**Changes:**
1. Pre-warm cache on app startup
2. Extend projects list cache TTL from 3min to 5min
3. Add cache-aside pattern for frequently accessed projects

---

### Phase 4: Improve Dev Server Startup (Priority: MEDIUM)

#### Step 4.1: Detect Compilation Status

**File:** `app/api/sandbox/[projectId]/dev-server/route.ts`

**Changes:** Check if Next.js is still compiling before running health checks:

```typescript
// Add compilation detection
const isCompiling = await executeCommand(
  sandbox,
  `grep -c "Compiling" /tmp/server.log 2>/dev/null || echo "0"`,
  { timeoutMs: 3000 }
)

if (parseInt(isCompiling.stdout.trim()) > 0) {
  // Still compiling, wait longer before health check
  await new Promise(resolve => setTimeout(resolve, 3000));
}
```

#### Step 4.2: Early Success Detection

**File:** `app/api/sandbox/[projectId]/dev-server/route.ts`

**Changes:** Return success as soon as "Ready" appears in logs, don't wait for HTTP check:

```typescript
// Check for Next.js ready message
const readyCheck = await executeCommand(
  sandbox,
  `grep -c "Ready in" /tmp/server.log 2>/dev/null || echo "0"`,
  { timeoutMs: 3000 }
)

if (parseInt(readyCheck.stdout.trim()) > 0) {
  // Next.js reports ready, trust it
  serverReady = true;
}
```

---

### Phase 5: Improve Package Installation (Priority: LOW)

#### Step 5.1: Pre-install Common Dependencies in Template

**File:** `lib/e2b/templates/nextjs-shadcn.e2b.Dockerfile`

The template already pre-installs Three.js stack. Ensure pnpm store is warmed.

#### Step 5.2: Add Retry Logic for Package Installation

**File:** `lib/ai/web-builder-agent.ts` (or wherever runCommand is called for pnpm)

```typescript
// Add retry wrapper for pnpm commands
async function runCommandWithRetry(cmd: string, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await runCommand(cmd);
    if (result.exitCode === 0) return result;
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return result;
}
```

---

## Verification Checklist

- [ ] Screenshot capture works without fallback
- [ ] Dev server starts within 30 seconds
- [ ] No `deadline_exceeded` errors in normal operation
- [ ] `/api/projects?limit=50` responds in <1 second
- [ ] Package installation succeeds on first attempt

---

## Rollout Plan

1. **Phase 1 (Screenshot):** Requires E2B template rebuild and deployment
2. **Phase 2 (Timeouts):** Code changes only, deploy immediately
3. **Phase 3 (Database):** Run migration, monitor query times
4. **Phase 4 (Dev Server):** Code changes, test in staging
5. **Phase 5 (Packages):** Low priority, can be deferred

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| E2B template update | Medium - affects all sandboxes | Test in separate template first |
| Timeout increases | Low - only affects wait times | No functional change |
| Database indexes | Low - additive change | Run during low traffic |
| Polling changes | Low - improves existing logic | Feature flag if needed |
