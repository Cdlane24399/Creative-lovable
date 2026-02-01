# E2B Custom Template

This directory contains the custom E2B template for the Creative-lovable sandbox environment. Using a custom template significantly reduces sandbox startup time from ~30 seconds to ~5 seconds.

## Build System 2.0

This template uses E2B's Build System 2.0 with the programmatic Template API. The template definition is in `template.ts` and uses method chaining for clean, readable configuration.

## Why Use a Custom Template?

The default E2B sandbox starts with a minimal environment. Every time a sandbox is created, it needs to:
1. Install Node.js dependencies (next, react, react-dom, etc.)
2. Install shadcn/ui components
3. Set up the project structure

A custom template pre-installs all these dependencies, making sandbox creation nearly instantaneous.

## Template Contents

This template includes:

- **Node.js 22** with pnpm package manager
- **Pre-installed dependencies:**
  - Next.js (latest) with App Router
  - React & react-dom
  - TypeScript
  - Tailwind CSS v4
  - @radix-ui primitives
  - shadcn/ui base components
  - framer-motion
  - lucide-react
  - Three.js + React Three Fiber
  - class-variance-authority
  - clsx & tailwind-merge
  - And many more (see template.ts)
- **Screenshot support:**
  - Playwright + Chromium (pre-installed)
  - ImageMagick (for image processing)
  - System dependencies for headless browser

## Building the Template

### Prerequisites

1. Install dependencies:
```bash
cd lib/e2b/templates
pnpm install
```

2. Ensure E2B API key is set in `.env.local`:
```bash
E2B_API_KEY=your_api_key
```

### Build Steps

#### Development Build (for testing)
```bash
pnpm run build:dev
```

#### Production Build
```bash
pnpm run build:prod
# or simply
pnpm run build
```

After successful build, you'll see output with the Template ID. Add it to your `.env.local`:
```bash
E2B_TEMPLATE_ID=your-template-id
```

## Template Files

### `template.ts`
The template definition using Build System 2.0 programmatic API. Defines:
- Base image (Node.js 22)
- System packages (apt)
- npm dependencies
- shadcn/ui initialization
- Environment variables

### `build.dev.ts` / `build.prod.ts`
TypeScript scripts for building the template in development and production modes.

### `package.json`
Local package.json for the build scripts with e2b SDK dependency.

## Troubleshooting

### Template Not Found
If you get "template not found" errors:
1. Verify the template was built successfully
2. Check that `E2B_TEMPLATE_ID` is set correctly in `.env.local`
3. Ensure you're using the correct template ID format

### Slow Sandbox Creation Even with Template
1. Verify `E2B_TEMPLATE_ID` is actually set in your environment
2. Check the application logs to confirm the template is being used
3. The first sandbox creation with a new template may still be slow

## Updating the Template

If you need to add new dependencies or change the template:

1. Modify `template.ts` (add packages, commands, etc.)
2. Rebuild the template: `pnpm run build:prod`
3. Update `E2B_TEMPLATE_ID` with the new template ID
4. Restart the development server

## Performance Impact

Without custom template:
- First request: ~30-45 seconds (dependency installation)
- Subsequent requests: ~5-10 seconds

With custom template:
- First request: ~5-10 seconds
- Subsequent requests: ~2-5 seconds

The template provides a **6-9x speedup** for the initial request.

## API Reference

See [E2B Template Documentation](https://e2b.mintlify.app/docs/template/quickstart) for the full Build System 2.0 API.
