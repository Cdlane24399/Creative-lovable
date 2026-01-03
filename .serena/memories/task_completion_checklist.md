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

### 3. Testing (if applicable)
```bash
pnpm test
```
Ensure tests pass. Add new tests for new functionality.

### 4. Build Check
```bash
pnpm build
```
Verify the project builds successfully.

## Code Review Checklist
- [ ] Used repositories for database access (not raw SQL)
- [ ] Used services for business logic (not in API routes)
- [ ] Proper error handling with `asyncErrorHandler`
- [ ] Cache invalidation on mutations
- [ ] No security vulnerabilities (XSS, injection, etc.)
- [ ] Follows existing patterns in the codebase

## Before Committing
- [ ] All checks pass (types, lint, tests, build)
- [ ] Commit message is descriptive
- [ ] No sensitive data (API keys, credentials) in code
