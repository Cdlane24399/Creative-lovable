# Creative-lovable Development Guide

## Commands

### Development
```bash
pnpm dev          # Start Next.js development server
pnpm build        # Build for production
pnpm start        # Start production server
```

### Testing
```bash
pnpm test         # Run Jest tests
pnpm test:watch   # Run tests in watch mode
pnpm test:coverage # Run tests with coverage report
pnpm test:e2b     # Run E2B sandbox tests
```

### Code Quality
```bash
pnpm lint         # Run ESLint
```

## Architecture

### Tech Stack
- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI primitives
- **AI Integration**: Multiple AI SDKs (Anthropic, OpenAI, Google)
- **Code Execution**: E2B Code Interpreter
- **Database**: Neon PostgreSQL
- **Agent Framework**: Claude Agent SDK
- **Testing**: Jest
- **Package Manager**: pnpm

### Project Structure
```
app/
├── (auth)/           # Authentication routes
├── api/              # API routes
├── auth/             # Auth pages
├── profile/          # User profile
├── settings/         # App settings
├── globals.css       # Global styles
├── layout.tsx        # Root layout
└── page.tsx          # Home page

components/
├── auth/             # Authentication components
├── chat/             # Chat interface components
├── landing/          # Landing page components
├── profile/          # Profile components
├── ui/               # Reusable UI components
├── chat-panel.tsx    # Main chat interface
├── code-editor.tsx   # Monaco code editor
├── preview-panel.tsx # Code preview panel
└── editor-layout.tsx # Main editor layout

lib/
├── e2b/              # E2B integration
├── auth/             # Authentication logic
├── db/               # Database utilities
└── utils/            # Utility functions
```

## Key Patterns

### Next.js App Router
- Use `app/` directory structure
- Server Components by default, use `'use client'` for interactivity
- API routes in `app/api/`
- Route groups with `(name)` for organization
- Loading, error, and not-found pages at route level

### Component Patterns
- Radix UI primitives for accessible components
- Tailwind CSS for styling with design system consistency
- TypeScript interfaces for props
- Barrel exports from `components/ui/`
- Compound components for complex UI (e.g., chat interface)

### AI Integration
- Multiple AI providers through AI SDK
- Streaming responses for chat interfaces
- E2B sandboxes for code execution
- Claude Agent SDK for specialized agents

### Code Organization
- Separate concerns: UI, logic, data fetching
- Custom hooks for reusable logic
- Utility functions in `lib/utils`
- Type definitions co-located with components

### Database
- Neon PostgreSQL with connection pooling
- Database utilities in `lib/db/`
- Environment variables for connection strings

## Important Notes

### Development
- Use `pnpm` for package management (faster, space-efficient)
- TypeScript strict mode enabled
- Hot reloading available in dev mode
- Environment variables required for AI providers and database

### AI Services
- Multiple AI providers configured (Anthropic, OpenAI, Google)
- Rate limiting may apply to AI API calls
- E2B sandboxes for safe code execution
- Claude Agent SDK for specialized workflows

### Security
- Environment variables for sensitive API keys
- Server-side API routes for secure operations
- Authentication system in place
- Code execution isolated in E2B sandboxes

### Performance
- Next.js optimizations (Image, Link components)
- Streaming for AI responses
- Code splitting with dynamic imports
- Tailwind CSS purging for smaller bundles

### Testing
- Jest configuration for TypeScript
- Separate E2B integration tests
- Coverage reporting available
- Watch mode for development

### Deployment Considerations
- Build process optimizes for production
- Static assets served efficiently
- Environment variables needed in production
- Database connection pooling for scalability