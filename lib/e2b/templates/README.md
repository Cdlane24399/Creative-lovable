# E2B Next.js Developer Template

This directory contains the E2B template definition used by the app sandbox runtime.

## What This Template Builds

The template builds the `nextjs-developer` runtime image:

- Base image: Node `24-slim`
- Scaffolds with `create-next-app@latest` (TypeScript + App Router + Tailwind, npm)
- Initializes `shadcn/ui` defaults
- Starts the dev server on `http://localhost:3000` via `npx next dev --turbo`

Template definition: `template.ts`  
Build script: `build.ts`

## Build

From the project root:

```bash
pnpm template:build
```

Or from this directory:

```bash
pnpm build
```

On success, the script prints:

- `Template ID`
- `Build ID`
- env lines to copy into `.env.local`

## Environment Variable

Use one of these in `.env.local`:

```env
E2B_TEMPLATE=your-template-id
# legacy alias also supported:
# E2B_TEMPLATE_ID=your-template-id
```

`E2B_TEMPLATE` is preferred.

## Updating the Template

1. Edit `template.ts`
2. Rebuild: `pnpm template:build`
3. Update `.env.local` with the printed template ID (if it changed)
4. Restart your dev server

Important: Template changes take effect only after a rebuild. For the same template name, E2B typically keeps the same template ID and creates a new build revision; update `E2B_TEMPLATE` only if the build output prints a different ID.
