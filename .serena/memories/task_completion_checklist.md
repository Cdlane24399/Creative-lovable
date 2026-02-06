# Task Completion Checklist

## Before Completing a Task

### 1. Type Checking
```bash
npx tsc --noEmit
```
Ensure no TypeScript errors.

### 2. Linting
```bash
pnpm lint
```
Fix any ESLint issues.

### 3. Unit Testing (if applicable)
```bash
pnpm test
```
Ensure tests pass. Add new tests for new functionality.

### 4. E2E Testing (if applicable)
```bash
pnpm test:e2e
```
Run Playwright E2E tests for UI-facing changes. Use `pnpm test:e2e:ui` for interactive debugging.

### 5. Build Check
```bash
pnpm build
```
Verify the project builds successfully.

## Code Review Checklist
- [ ] Used repositories for database access (not raw SQL)
- [ ] Used services for business logic (not in API routes)
- [ ] Proper error handling with `asyncErrorHandler`
- [ ] Cache invalidation on mutations (via `@upstash/redis` CacheManager)
- [ ] No security vulnerabilities (XSS, injection, etc.)
- [ ] Follows existing patterns in the codebase
- [ ] AI tools defined in `lib/ai/tools/` with proper `*.tools.ts` naming

## Before Committing
- [ ] All checks pass (types, lint, tests, build)
- [ ] Commit message is descriptive
- [ ] No sensitive data (API keys, credentials) in code
