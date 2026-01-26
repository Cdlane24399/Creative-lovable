> ⚠️ Important: This document is for GitHub Copilot. Do not edit it directly. Your changes will be overwritten.

# GitHub Copilot Instructions for Creative-lovable

This document provides instructions for GitHub Copilot to help it understand the Creative-lovable codebase and generate better suggestions.

## Project Overview

Creative-lovable is an AI-powered web development assistant that builds real, working applications in seconds using E2B sandboxes, Next.js 15, and AI SDK v6.

## Key Technologies

- **Framework**: Next.js (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui, Radix UI
- **AI Integration**: Vercel AI SDK v6, E2B Code Interpreter
- **Database**: Neon PostgreSQL

## Code Style and Conventions

- **Formatting**: Follow the existing code style and formatting.
- **Components**: Create reusable components in the `components/` directory, organized by feature.
- **API Routes**: Place all API routes in the `app/api/` directory.
- **Logging**: Use the structured logger from `lib/logger.ts` for all logging.
- **Error Handling**: Use the custom error classes from `lib/errors.ts`.

## How to Help

- When I ask you to create a new component, place it in the `components/` directory and use Radix UI primitives and Tailwind CSS for styling.
- When I ask you to create a new API route, place it in the `app/api/` directory and use the `withAuth` and `withRateLimit` middleware.
- When I ask you to add logging, use the structured logger from `lib/logger.ts`.
- When I ask you to handle errors, use the custom error classes from `lib/errors.ts`.
