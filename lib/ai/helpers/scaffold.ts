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
  await executeCommand(
    sandbox,
    `mkdir -p "${projectDir}/app" "${projectDir}/components/ui" "${projectDir}/lib" "${projectDir}/public"`,
  )

  // Package.json
  const packageJson = {
    name,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev -p 3000 --hostname 0.0.0.0",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    dependencies: {
      next: "^16.1.6",
      react: "19.2.4",
      "react-dom": "19.2.4",
    },
    devDependencies: {
      "@tailwindcss/postcss": "^4.1.18",
      "@types/node": "^25.2.3",
      "@types/react": "^19.2.14",
      "@types/react-dom": "^19.2.3",
      postcss: "^8.5.6",
      tailwindcss: "^4.1.18",
      typescript: "^5.9.3",
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
    "@tailwindcss/postcss": {},
  },
};
`
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/app/globals.css`,
      `@import "tailwindcss";

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

    writeFileToSandbox(
      sandbox,
      `${projectDir}/lib/utils.ts`,
      `export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
`,
    ),

    writeFileToSandbox(
      sandbox,
      `${projectDir}/components/ui/button.tsx`,
      `import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-black text-white hover:bg-zinc-800",
  outline: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
  ghost: "bg-transparent text-zinc-900 hover:bg-zinc-100",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
  lg: "h-11 px-8",
  icon: "h-10 w-10",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/40 disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
`,
    ),
  ])
}
