# Code Style and Conventions

## TypeScript
- **Strict mode**: Enabled in tsconfig.json
- **Path aliases**: Use `@/*` for imports (e.g., `@/lib/services`)
- **Target**: ES6

## File Naming
- Repositories: `*.repository.ts`
- Services: `*.service.ts`
- Types: `*.types.ts` or in `types.ts`
- Tests: `*.test.ts` or in `__tests__/` directories
- React components: PascalCase (e.g., `CodeEditor.tsx`)

## Architecture Patterns

### Layered Architecture
1. **API Routes** (`app/api/`) - Thin controllers, use services
2. **Services** (`lib/services/`) - Business logic, caching
3. **Repositories** (`lib/db/repositories/`) - Database operations
4. **Cache Manager** (`lib/cache/`) - Unified caching

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
// ✅ Correct
const projectRepo = getProjectRepository()
const project = await projectRepo.findById(id)
```

### Caching
Use centralized cache invalidation:
```typescript
await invalidateProjectCache(id)
// or: getCacheManager().invalidateAllForProject(id)
```

### Singleton Pattern
Services and repositories use singleton getters:
```typescript
import { getProjectService } from "@/lib/services"
const projectService = getProjectService()
```

## React/Next.js
- Use React 19 features (use client/server directives)
- Server components by default
- Framer Motion for animations
- shadcn/ui for UI components
