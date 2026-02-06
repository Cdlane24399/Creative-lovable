# Code Style and Conventions

## TypeScript
- **Strict mode**: Enabled in tsconfig.json
- **Path aliases**: Use `@/*` for imports (e.g., `@/lib/services`)
- **Target**: ES6
- **Version**: TypeScript 5.9+

## File Naming
- Repositories: `*.repository.ts`
- Services: `*.service.ts`
- Tools: `*.tools.ts` (in `lib/ai/tools/`)
- Types: `*.types.ts` or in `types.ts`
- Tests: `*.test.ts` or in `__tests__/` directories
- E2E Tests: `*.spec.ts` (in `tests/` for Playwright)
- React components: PascalCase (e.g., `CodeEditor.tsx`)

## Architecture Patterns

### Layered Architecture
1. **API Routes** (`app/api/`) - Thin controllers, use services
2. **Services** (`lib/services/`) - Business logic, caching
3. **Repositories** (`lib/db/repositories/`) - Database operations
4. **Cache Manager** (`lib/cache/`) - Unified caching via @upstash/redis + LRU fallback

### Error Handling
Always use `asyncErrorHandler` wrapper for API routes:
```typescript
export const GET = withAuth(asyncErrorHandler(async (request) => {
  throw new ValidationError("Invalid input", { field: ["message"] })
}))
```

### Database Access
Never use raw SQL in routes. Always use repositories:
```typescript
// Correct
const projectRepo = getProjectRepository()
const project = await projectRepo.findById(id)
```

### Caching (@upstash/redis)
Use centralized cache invalidation via the CacheManager singleton:
```typescript
import { getCacheManager, invalidateProjectCache } from "@/lib/cache"

// Invalidate all caches for a project
await invalidateProjectCache(id)

// Or use the CacheManager directly
const cache = getCacheManager()
await cache.invalidateAllForProject(id)
await cache.invalidateProjectCache(id)
await cache.invalidateMessagesCache(id)
await cache.invalidateContextCache(id)
```

Environment variables for Redis:
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (primary)
- `REDIS_URL` + `REDIS_TOKEN` (fallback)
- If neither is set, an in-memory LRU cache is used automatically

### Singleton Pattern
Services and repositories use singleton getters:
```typescript
import { getProjectService } from "@/lib/services"
const projectService = getProjectService()
```

### AI Gateway Pattern
Model routing via AI Gateway with `createGateway()`:
```typescript
import { getModel, getGatewayProviderOptions } from "@/lib/ai/providers"

const result = streamText({
  model: getModel('anthropic'),
  providerOptions: getGatewayProviderOptions('anthropic'),
  messages,
  tools,
})
```

## React/Next.js
- Use React 19 features (use client/server directives)
- Server components by default
- Framer Motion 12.x for animations
- shadcn/ui for UI components
