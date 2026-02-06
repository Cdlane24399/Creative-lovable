# Suggested Commands for Creative-lovable

## Development
```bash
pnpm dev          # Start development server
pnpm build        # Build for production (includes type checking)
pnpm start        # Start production server
```

## Testing
```bash
pnpm test              # Run all Jest tests
pnpm test:watch        # Run tests in watch mode
pnpm test:coverage     # Run tests with coverage
pnpm test:e2b          # Run E2B sandbox tests specifically
```

## End-to-End Testing (Playwright)
```bash
pnpm test:e2e                    # Run all E2E tests
pnpm test:e2e:ui                 # Run E2E tests with interactive UI
pnpm test:e2e:headed             # Run E2E tests in headed browser
pnpm test:e2e:debug              # Run E2E tests in debug mode
pnpm test:e2e:chromium           # Run E2E tests in Chromium only
pnpm test:e2e:firefox            # Run E2E tests in Firefox only
pnpm test:e2e:webkit             # Run E2E tests in WebKit only
pnpm test:e2e:mobile             # Run E2E tests on mobile viewports
pnpm test:e2e:report             # Show Playwright HTML report
pnpm test:e2e:update-snapshots   # Update visual snapshots
pnpm playwright:install          # Install Playwright browsers
```

## Code Quality
```bash
pnpm lint              # Run ESLint
npx tsc --noEmit       # Type check only (no emit)
```

## E2B Templates & Sandbox
```bash
pnpm template:build         # Build production E2B template
pnpm template:build:dev     # Build development E2B template
pnpm template:build:prod    # Build production E2B template (explicit)
pnpm sandbox                # Create a sandbox interactively
```

## Database (Docker Compose)
```bash
pnpm db:up            # Start local database (Supabase via Docker)
pnpm db:down          # Stop local database
pnpm db:logs          # Tail database logs
pnpm db:psql          # Open psql shell to local database
```

## Package Management
```bash
pnpm install          # Install dependencies
pnpm add <package>    # Add a dependency
pnpm add -D <package> # Add a dev dependency
```

## Useful System Commands (macOS/Darwin)
```bash
git status            # Check git status
git diff              # View uncommitted changes
git log --oneline -10 # Recent commits
```
