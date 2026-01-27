/**
 * Scaffolding utilities for the web builder agent.
 *
 * This module provides functions to scaffold new Next.js projects
 * with all necessary configuration files.
 */

import { executeCommand, writeFile as writeFileToSandbox, createSandbox } from "@/lib/e2b/sandbox"

/**
 * Scaffolds a new Next.js project with all necessary configuration files.
 */
export async function scaffoldNextProject(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  projectDir: string,
  name: string,
  description: string
): Promise<void> {
  // Create directory structure
  await executeCommand(sandbox, `mkdir -p "${projectDir}/app" "${projectDir}/components" "${projectDir}/public"`)

  // Package.json
  const packageJson = {
    name,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev -p 3000",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "15.0.0",
      react: "18.3.1",
      "react-dom": "18.3.1",
    },
    devDependencies: {
      autoprefixer: "^10.4.19",
      postcss: "^8.4.38",
      tailwindcss: "^3.4.3",
      typescript: "^5.4.5",
      "@types/node": "^20.12.7",
      "@types/react": "^18.2.79",
      "@types/react-dom": "^18.2.25",
    },
  }

  // Write config files in parallel for better performance
  await Promise.all([
    writeFileToSandbox(sandbox, `${projectDir}/package.json`, JSON.stringify(packageJson, null, 2)),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/tsconfig.json`,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"],
        },
        null,
        2
      )
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/next.config.mjs`,
      `/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/tailwind.config.ts`,
      `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/postcss.config.js`,
      `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/app/globals.css`,
      `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
}
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/app/layout.tsx`,
      `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${name}",
  description: "${description}",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`
    ),
  ])
}
