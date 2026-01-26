# AI Agent Instructions for Creative-lovable

This document provides instructions for AI agents to help them understand and work with the Creative-lovable codebase.

## Project Overview

Creative-lovable is an AI-powered web development assistant that builds real, working applications in seconds using E2B sandboxes, Next.js 15, and AI SDK v6.

## Key Technologies

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui, Radix UI
- **AI Integration**: Vercel AI SDK v6, E2B Code Interpreter
- **Database**: Neon PostgreSQL

## Codebase Structure

- `app/`: Next.js App Router pages and API routes
- `components/`: Reusable React components
- `lib/`: Core application logic, including AI, database, and services
- `hooks/`: Custom React hooks
- `styles/`: Global CSS styles
- `public/`: Static assets

## How to Contribute

### Creating New Components

- Place new components in the `components/` directory, organized by feature.
- Use Radix UI primitives for building accessible components.
- Use Tailwind CSS for styling.
- Use TypeScript for all components and define props with interfaces.

### Creating New API Routes

- Place new API routes in the `app/api/` directory.
- Use the `withAuth` middleware for authenticated routes.
- Use the `withRateLimit` middleware for all public-facing API routes.
- Use the structured logger from `lib/logger.ts` for all logging.

### Handling Errors

- Use the custom error classes from `lib/errors.ts` for error handling.
- Use the `asyncErrorHandler` wrapper for API routes to ensure consistent error handling.

### Working with the Database

- Use the repository pattern for all database interactions.
- Repositories are located in `lib/db/repositories/`.
- Services that use repositories are located in `lib/services/`.

### AI Integration

- The core AI agent logic is in `lib/ai/web-builder-agent.ts`.
- The system prompt is defined in `lib/ai/agent.ts`.
- Tools for the AI agent are defined in `lib/ai/web-builder-agent.ts`.
