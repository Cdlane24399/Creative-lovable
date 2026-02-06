# E2B Custom Template

This directory contains the E2B template definition used by the app sandbox runtime.

## What This Template Builds

The template is intentionally simple and Bun-based:

- Base image: Bun `1.3`
- Scaffolds a Next.js app (`create-next-app` with TypeScript, App Router, Tailwind, Turbopack)
- Initializes `shadcn/ui` and adds all components
- Starts the dev server on `http://localhost:3000`

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
3. Update `.env.local` with the newly printed template ID
4. Restart your dev server
