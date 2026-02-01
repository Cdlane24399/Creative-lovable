/**
 * Next.js + shadcn/ui + Tailwind CSS v4 + Three.js template
 *
 * E2B Build System 2.0 - Programmatic Template Definition
 * Uses Bun for faster package installation and execution
 * @see https://e2b.mintlify.app/docs/template/quickstart
 */
import { Template, waitForURL } from "e2b";

export const TEMPLATE_NAME = "nextjs-app-bun";

/**
 * Production template with all dependencies pre-installed
 * Optimized for fast sandbox startup with zero wait time
 */
export const template = Template()
  .fromBunImage("1.3")
  .aptInstall([
    // Build essentials
    "git",
    "curl",
    "ca-certificates",
    "python3",
    "make",
    "g++",
    // Playwright browser dependencies
    "libnss3",
    "libatk-bridge2.0-0",
    "libdrm2",
    "libxcomposite1",
    "libxdamage1",
    "libxrandr2",
    "libgbm1",
    "libxshmfence1",
    "libasound2",
    "libpangocairo-1.0-0",
    "libgtk-3-0",
    // Image processing tools
    "imagemagick",
    "libjpeg-dev",
    "libpng-dev",
    "ffmpeg",
    "poppler-utils",
    "tesseract-ocr",
    "ghostscript",
    "webp",
  ])
  // Set up project workspace
  .setWorkdir("/home/user/nextjs-app")
  // Create Next.js app with Bun
  .runCmd(
    "bun create next-app --app --ts --tailwind --turbopack --yes --use-bun .",
  )
  // Initialize shadcn/ui
  .runCmd("bunx --bun shadcn@latest init -d")
  .runCmd("bunx --bun shadcn@latest add --all")
  // Move to home directory
  .runCmd(
    "mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app",
  )
  .setWorkdir("/home/user")
  // Core UI + App Libraries
  .bunInstall([
    "lucide-react",
    "@radix-ui/react-icons",
    "framer-motion",
    "class-variance-authority",
    "clsx",
    "tailwind-merge",
    "tailwindcss-animate",
    "next-themes",
    "react-markdown",
    "remark-gfm",
    "rehype-highlight",
    "recharts",
    "date-fns",
    "zod",
    "react-hook-form",
    "@hookform/resolvers",
    "zustand",
    "@tanstack/react-query",
    "ky",
    "nanoid",
  ])
  // 3D / Creative Stack
  .bunInstall([
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "@react-three/postprocessing",
    "leva",
    "@react-three/rapier",
    "three-stdlib",
    "gsap",
  ])
  .bunInstall(["@types/three"], { dev: true })
  // Agent Image & Media Tooling
  .bunInstall(["sharp", "gifencoder", "canvas"])
  // Scraping & Content Extraction
  .bunInstall(["cheerio", "jsdom", "turndown", "@mozilla/readability"])
  // File Format Utilities
  .bunInstall([
    "papaparse",
    "xlsx",
    "pdf-lib",
    "mammoth",
    "csv-parse",
    "csv-stringify",
  ])
  // Execution Helpers
  .bunInstall(["execa", "zx", "tmp", "fs-extra"])
  // Dev Tooling
  .bunInstall(
    [
      "@types/node",
      "@types/react",
      "@types/react-dom",
      "typescript",
      "prettier",
      "prettier-plugin-tailwindcss",
      "eslint-config-prettier",
      "playwright",
    ],
    { dev: true },
  )
  // Install Playwright browsers at build time
  .runCmd("bunx playwright install chromium --with-deps")
  // Fix Next config for clean snapshot restores
  .runCmd("rm -f next.config.ts")
  .runCmd(
    `printf '%s\\n' '/** @type {import("next").NextConfig} */' 'const nextConfig = {};' 'export default nextConfig;' > next.config.mjs`,
  )
  // Environment defaults
  .setEnvs({
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
  })
  // Start dev server when sandbox is ready
  .setStartCmd(
    "bun --bun run dev --turbo",
    waitForURL("http://localhost:3000"),
  );
