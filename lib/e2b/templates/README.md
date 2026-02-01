# E2B Custom Template

This directory contains the custom E2B template for the Creative-lovable sandbox environment. Using a custom template significantly reduces sandbox startup time from ~30 seconds to ~5 seconds.

## Why Use a Custom Template?

The default E2B sandbox starts with a minimal environment. Every time a sandbox is created, it needs to:
1. Install Node.js dependencies (next, react, react-dom, etc.)
2. Install shadcn/ui components
3. Set up the project structure

A custom template pre-installs all these dependencies, making sandbox creation nearly instantaneous.

## Template Contents

This template includes:

- **Node.js 20** with pnpm package manager
- **Pre-installed dependencies:**
  - next (latest)
  - react & react-dom
  - typescript
  - tailwindcss
  - @radix-ui primitives
  - shadcn/ui base components
  - framer-motion
  - lucide-react
  - class-variance-authority
  - clsx & tailwind-merge

- **Pre-configured files:**
  - `tsconfig.json` - TypeScript configuration
  - `tailwind.config.ts` - Tailwind CSS setup
  - `components.json` - shadcn/ui configuration
  - `next.config.js` - Next.js configuration

## Building the Template

### Prerequisites

1. Install the E2B CLI:
```bash
npm install -g @e2b/cli
```

2. Login to E2B:
```bash
e2b auth login
```

### Build Steps

1. Navigate to the templates directory:
```bash
cd lib/e2b/templates
```

2. Build the template (this may take 5-10 minutes):
```bash
e2b template build --name "nextjs-shadcn" --dockerfile ./nextjs-shadcn.e2b.Dockerfile
```

3. After successful build, you'll see output like:
```
Template "nextjs-shadcn" built successfully
Template ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

4. Copy the Template ID and add it to your `.env.local`:
```bash
E2B_TEMPLATE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Template Files

### `nextjs-shadcn.e2b.Dockerfile`
The Docker configuration that defines the template environment. It:
- Based on E2B's base image
- Installs Node.js 20
- Installs pnpm
- Pre-installs all npm dependencies
- Sets up the project structure

### `build.dev.ts` / `build.prod.ts`
TypeScript scripts for building the template in development and production modes.

### `template.ts`
Template configuration and helper functions.

### `package.json`
The package.json used for pre-installing dependencies in the template.

## Troubleshooting

### Build Fails with "out of memory"
The template build process is memory-intensive. Try:
```bash
# Increase Docker memory limit in Docker Desktop settings
# Or build with limited concurrency
e2b template build --name "nextjs-shadcn" --dockerfile ./nextjs-shadcn.e2b.Dockerfile --no-cache
```

### Template Not Found
If you get "template not found" errors:
1. Verify the template was built successfully
2. Check that `E2B_TEMPLATE_ID` is set correctly in `.env.local`
3. Ensure you're using the correct template ID format

### Slow Sandbox Creation Even with Template
1. Verify `E2B_TEMPLATE_ID` is actually set in your environment
2. Check the application logs to confirm the template is being used
3. The first sandbox creation with a new template may still be slow (subsequent ones will be fast)

## Updating the Template

If you need to add new dependencies or change the template:

1. Modify the `Dockerfile` or `package.json`
2. Rebuild the template (this will create a new version)
3. Update `E2B_TEMPLATE_ID` with the new template ID
4. Restart the development server

## Performance Impact

Without custom template:
- First request: ~30-45 seconds (dependency installation)
- Subsequent requests: ~5-10 seconds

With custom template:
- First request: ~5-10 seconds
- Subsequent requests: ~2-5 seconds

The template provides a **6-9x speedup** for the initial request, dramatically improving user experience.
