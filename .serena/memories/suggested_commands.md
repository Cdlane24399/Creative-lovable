# Suggested Commands for Creative-lovable

## Development
```bash
pnpm dev          # Start development server
pnpm build        # Build for production (includes type checking)
pnpm start        # Start production server
```

## Testing
```bash
pnpm test              # Run all tests
pnpm test:watch        # Run tests in watch mode
pnpm test:coverage     # Run tests with coverage
pnpm test:e2b          # Run E2B sandbox tests specifically
```

## Code Quality
```bash
pnpm lint              # Run ESLint
npx tsc --noEmit       # Type check only (no emit)
```

## Useful System Commands (macOS/Darwin)
```bash
git status            # Check git status
git diff              # View uncommitted changes
git log --oneline -10 # Recent commits
ls -la                # List files with details
grep -r "pattern" .   # Search for pattern recursively
find . -name "*.ts"   # Find TypeScript files
```

## Package Management
```bash
pnpm install          # Install dependencies
pnpm add <package>    # Add a dependency
pnpm add -D <package> # Add a dev dependency
```

## Database
```bash
# Connect to Neon via CLI if needed
# Database operations are handled via repositories in lib/db/repositories/
```
