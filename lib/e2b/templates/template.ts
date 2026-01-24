import { Template, waitForPort } from 'e2b'

/**
 * Next.js + shadcn/ui + Tailwind CSS v4 + Three.js template
 *
 * This programmatic template provides:
 * - Next.js (latest) with App Router and TypeScript
 * - shadcn/ui with all components pre-installed
 * - Tailwind CSS v4
 * - Three.js / React Three Fiber stack for 3D
 * - Core UI utilities (Framer Motion, Lucide, etc.)
 * - Development tools (Prettier, ESLint, Vercel CLI)
 */
export const template = Template()
  // Base image with Node.js 22
  .fromNodeImage('22-slim')

  // Install system dependencies for native modules
  .aptInstall(['git', 'curl', 'ca-certificates', 'python3', 'make', 'g++'])

  // Install pnpm globally (needs root for /usr/local/lib)
  .runCmd('npm install -g pnpm', { user: 'root' })

  // Set up project directory
  .setWorkdir('/home/user/project')

  // Initialize Next.js with App Router, TypeScript, Tailwind, ESLint
  .runCmd(
    'npx create-next-app@latest . ' +
    '--ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --yes'
  )

  // Install Vercel CLI
  .runCmd('pnpm add -D vercel@latest')

  // Initialize shadcn/ui with defaults (Tailwind v4 aware)
  .runCmd('npx shadcn@latest init -y --defaults')

  // Pre-install comprehensive set of shadcn/ui components
  .runCmd(
    'npx shadcn@latest add ' +
    'button card input label select textarea switch checkbox radio-group slider ' +
    'tabs dialog sheet tooltip dropdown-menu popover avatar badge progress ' +
    'separator skeleton table alert command calendar form accordion collapsible ' +
    'context-menu hover-card menubar navigation-menu scroll-area toggle ' +
    'aspect-ratio carousel resizable sonner drawer alert-dialog breadcrumb ' +
    'chart input-otp pagination sidebar toggle-group ' +
    '-y --overwrite'
  )

  // Core UI + utilities
  .runCmd(
    'pnpm add ' +
    'lucide-react ' +
    '@radix-ui/react-icons ' +
    'framer-motion ' +
    'class-variance-authority ' +
    'clsx ' +
    'tailwind-merge ' +
    'tailwindcss-animate ' +
    'next-themes ' +
    'react-markdown ' +
    'remark-gfm ' +
    'rehype-highlight ' +
    'recharts ' +
    'date-fns ' +
    'zod ' +
    'react-hook-form ' +
    '@hookform/resolvers ' +
    'zustand ' +
    '@tanstack/react-query ' +
    'ky ' +
    'nanoid'
  )

  // Three.js / 3D stack
  .runCmd(
    'pnpm add ' +
    'three ' +
    '@react-three/fiber ' +
    '@react-three/drei ' +
    '@react-three/postprocessing ' +
    'leva ' +
    '@react-three/rapier ' +
    'three-stdlib ' +
    'gsap'
  )

  // TypeScript types for Three.js
  .runCmd('pnpm add -D @types/three')

  // Dev tooling
  .runCmd(
    'pnpm add -D ' +
    '@types/node ' +
    '@types/react ' +
    '@types/react-dom ' +
    'typescript ' +
    'prettier ' +
    'prettier-plugin-tailwindcss ' +
    'eslint-config-prettier'
  )

  // Clean up create-next-app artifacts that can break fresh installs
  // IMPORTANT: Write a valid JavaScript config instead of renaming TypeScript file
  // (TypeScript syntax like "import type { }" is not valid in .mjs files)
  .runCmd('rm -f pnpm-workspace.yaml next.config.ts')
  .runCmd('echo \'/** @type {import("next").NextConfig} */\\nconst nextConfig = {};\\nexport default nextConfig;\' > next.config.mjs')

  // Set environment variables
  .setEnvs({
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
  })

  // Start command - Next.js dev server with Turbopack
  .setStartCmd('pnpm run dev --turbo', waitForPort(3000))
