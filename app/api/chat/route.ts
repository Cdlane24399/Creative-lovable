import { convertToModelMessages, streamText, type UIMessage } from "ai"
import { z } from "zod"
import { SYSTEM_PROMPT, MODEL_OPTIONS, type ModelProvider } from "@/lib/ai/agent"
import { createServerClient } from "@/lib/supabase/server"
import {
  createSandbox,
  executeCode,
  writeFile as writeFileToSandbox,
  readFile as readFileFromSandbox,
  executeCommand,
  getHostUrl,
  startBackgroundProcess,
  type CodeLanguage,
} from "@/lib/e2b/sandbox"

export const maxDuration = 60

// Define tools using inputSchema for cross-provider compatibility (Anthropic, Google, OpenAI)
// The AI SDK requires inputSchema (not parameters) for proper JSON Schema generation
const tools = {
  generateComponent: {
    description: "Generate a React/Next.js component. Returns the component code to be displayed to the user.",
    inputSchema: z.object({
      name: z.string().describe("Component name in PascalCase"),
      description: z.string().describe("What the component should do"),
      styling: z.string().describe("Styling approach: 'tailwind' or 'css'. Defaults to 'tailwind' if empty."),
    }),
    execute: async function* ({ name, description, styling }: { name: string; description: string; styling: string }) {
      const actualStyling = styling || "tailwind"
      yield { state: "generating" as const, message: `Creating ${name} component...` }
      yield {
        state: "complete" as const,
        componentName: name,
        description,
        styling: actualStyling,
      }
    },
  },

  executeCode: {
    description:
      "Execute Python, JavaScript, or TypeScript code in a secure E2B sandbox. Use for data processing, calculations, or testing logic.",
    inputSchema: z.object({
      code: z.string().describe("Code to execute"),
      language: z.string().describe("Programming language: 'python', 'javascript', 'typescript', 'js', or 'ts'. Defaults to 'python' if empty."),
      projectId: z.string().describe("Project ID for sandbox persistence. Use 'default' if not specified."),
    }),
    execute: async function* ({ code, language, projectId }: { code: string; language: string; projectId: string }) {
      const actualLanguage = (language || "python") as CodeLanguage
      const actualProjectId = projectId || "default"
      yield { state: "running" as const, message: `Executing ${actualLanguage} code in sandbox...` }

      try {
        const sandbox = await createSandbox(actualProjectId)
        const result = await executeCode(sandbox, code, actualLanguage)

        yield {
          state: "complete" as const,
          output: result.logs.stdout.join("\n") + result.logs.stderr.join("\n"),
          results: result.results,
          error: result.error?.message,
          code,
          language: actualLanguage,
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Execution failed",
        }
      }
    },
  },

  writeFile: {
    description: "Write content to a file in the project sandbox.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      content: z.string().describe("File content"),
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
    }),
    execute: async function* ({ path, content, projectId }: { path: string; content: string; projectId: string }) {
      const actualProjectId = projectId || "default"
      yield { state: "writing" as const, path }

      try {
        const sandbox = await createSandbox(actualProjectId)
        await writeFileToSandbox(sandbox, path, content)
        yield { state: "complete" as const, path, success: true }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Write failed",
        }
      }
    },
  },

  readFile: {
    description: "Read content from a file in the project sandbox.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
    }),
    execute: async function* ({ path, projectId }: { path: string; projectId: string }) {
      const actualProjectId = projectId || "default"
      yield { state: "reading" as const, path }

      try {
        const sandbox = await createSandbox(actualProjectId)
        const result = await readFileFromSandbox(sandbox, path)
        yield { state: "complete" as const, path, content: result.content }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Read failed",
        }
      }
    },
  },

  runCommand: {
    description: "Run a shell command in the sandbox (e.g., npm install, git clone).",
    inputSchema: z.object({
      command: z.string().describe("Shell command to execute"),
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
    }),
    execute: async function* ({ command, projectId }: { command: string; projectId: string }) {
      const actualProjectId = projectId || "default"
      yield { state: "running" as const, message: `Running: ${command}` }

      try {
        const sandbox = await createSandbox(actualProjectId)
        const result = await executeCommand(sandbox, command)
        yield {
          state: "complete" as const,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Command failed",
        }
      }
    },
  },

  createWebsite: {
    description:
      "Create or update a complete website in an E2B sandbox and return the live preview URL. Use this when the user wants to build a website, landing page, or web application. Supports both initial creation and incremental updates. If a custom E2B template is configured, the project will start in seconds with all dependencies pre-installed.",
    inputSchema: z.object({
      name: z.string().describe("Project name in lowercase with hyphens (e.g., 'my-portfolio')"),
      description: z.string().describe("Description of the website to create"),
      pages: z
        .array(
          z.object({
            path: z.string().describe("Page path (e.g., 'page.tsx' for home, 'about/page.tsx' for about page)"),
            content: z.string().describe("Full React/Next.js page component code with Tailwind CSS styling"),
            action: z.enum(['create', 'update', 'delete']).optional().describe("Action to perform on the file (default: 'create')"),
          })
        )
        .describe("Array of pages to create in the app directory"),
      components: z
        .array(
          z.object({
            name: z.string().describe("Component file name (e.g., 'header.tsx')"),
            content: z.string().describe("Full React component code"),
            action: z.enum(['create', 'update', 'delete']).optional().describe("Action to perform on the file (default: 'create')"),
          })
        )
        .optional()
        .describe("Optional array of reusable components"),
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
      useTemplate: z.boolean().optional().describe("Whether to use the custom E2B template for faster startup (default: true)"),
    }),
    execute: async function* ({
      name,
      description,
      pages,
      components,
      projectId,
      useTemplate = true,
    }: {
      name: string
      description: string
      pages: { path: string; content: string; action?: 'create' | 'update' | 'delete' }[]
      components?: { name: string; content: string; action?: 'create' | 'update' | 'delete' }[]
      projectId: string
      useTemplate?: boolean
    }) {
      const actualProjectId = projectId || "default"
      const projectDir = `/home/user/${name}`

      yield { state: "creating" as const, message: `Creating ${name} project...` }

      try {
        // Create sandbox - will use custom template if E2B_TEMPLATE_ID is set and useTemplate is true
        const sandbox = await createSandbox(actualProjectId, useTemplate ? undefined : "")

        // Check if project already exists (for updates)
        const checkResult = await executeCommand(sandbox, `test -d ${projectDir} && echo "exists"`)
        const projectExists = checkResult.stdout.trim() === "exists"
        
        // Step 1: Create Next.js project structure (skip if exists)
        if (!projectExists) {
          yield { state: "scaffolding" as const, message: "Setting up Next.js project..." }

          // Create directories
          await executeCommand(sandbox, `mkdir -p ${projectDir}/app ${projectDir}/components ${projectDir}/public`)

          // Create package.json
          const packageJson = {
            name,
            version: "0.1.0",
            private: true,
            scripts: {
              dev: "next dev --turbopack -p 3000",
              build: "next build",
              start: "next start",
            },
            dependencies: {
              next: "14.2.0",
              react: "18.2.0",
              "react-dom": "18.2.0",
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
          await writeFileToSandbox(sandbox, `${projectDir}/package.json`, JSON.stringify(packageJson, null, 2))

          // Create tsconfig.json
          const tsconfig = {
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
          }
          await writeFileToSandbox(sandbox, `${projectDir}/tsconfig.json`, JSON.stringify(tsconfig, null, 2))

          // Create next.config.mjs
          await writeFileToSandbox(
            sandbox,
            `${projectDir}/next.config.mjs`,
            `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`
          )

          // Create tailwind.config.ts
          await writeFileToSandbox(
            sandbox,
            `${projectDir}/tailwind.config.ts`,
            `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
`
          )

          // Create postcss.config.js
          await writeFileToSandbox(
            sandbox,
            `${projectDir}/postcss.config.js`,
            `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`
          )

          // Create globals.css
          await writeFileToSandbox(
            sandbox,
            `${projectDir}/app/globals.css`,
            `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
}
`
          )

          // Create layout.tsx
          await writeFileToSandbox(
            sandbox,
            `${projectDir}/app/layout.tsx`,
            `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${name}",
  description: "${description}",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`
          )
        }

        // Step 2: Write pages with streaming feedback
        yield { state: "writing-pages" as const, message: `Processing ${pages.length} page(s)...` }
        for (const page of pages) {
          const action = page.action || 'create'
          const pagePath = `${projectDir}/app/${page.path}`
          
          yield { 
            state: "writing-file" as const, 
            path: page.path,
            action,
          }

          if (action === 'delete') {
            await executeCommand(sandbox, `rm -f ${pagePath}`)
          } else {
            // Ensure directory exists
            const pageDir = pagePath.substring(0, pagePath.lastIndexOf("/"))
            if (pageDir !== `${projectDir}/app`) {
              await executeCommand(sandbox, `mkdir -p ${pageDir}`)
            }
            await writeFileToSandbox(sandbox, pagePath, page.content)
          }

          yield {
            state: "file-complete" as const,
            path: page.path,
          }
        }

        // Step 3: Write components (if any) with streaming feedback
        if (components && components.length > 0) {
          yield { state: "writing-components" as const, message: `Processing ${components.length} component(s)...` }
          for (const component of components) {
            const action = component.action || 'create'
            const componentPath = `${projectDir}/components/${component.name}`

            yield { 
              state: "writing-file" as const, 
              path: component.name,
              action,
            }

            if (action === 'delete') {
              await executeCommand(sandbox, `rm -f ${componentPath}`)
            } else {
              await writeFileToSandbox(sandbox, componentPath, component.content)
            }

            yield {
              state: "file-complete" as const,
              path: component.name,
            }
          }
        }

        // Step 4: Install dependencies (skip if using template or project exists)
        if (!projectExists && !process.env.E2B_TEMPLATE_ID) {
          yield { state: "installing" as const, message: "Installing dependencies (this may take a minute)..." }
          const installResult = await executeCommand(sandbox, `cd ${projectDir} && npm install`)
          if (installResult.exitCode !== 0) {
            throw new Error(`npm install failed: ${installResult.stderr}`)
          }
        } else if (projectExists) {
          yield { state: "updating" as const, message: "Project files updated. Dev server will hot-reload..." }
        } else {
          yield { state: "ready" as const, message: "Using pre-built template - dependencies already installed!" }
        }

        // Step 5: Start dev server (skip if already running)
        if (!projectExists) {
          yield { state: "starting" as const, message: "Starting development server..." }
          await startBackgroundProcess(sandbox, "npm run dev", projectDir)
          // Wait for server to start
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }

        // Step 6: Get preview URL
        const previewUrl = getHostUrl(sandbox, 3000)

        yield {
          state: "complete" as const,
          projectName: name,
          previewUrl,
          message: `Website created successfully! Preview available at: ${previewUrl}`,
          pagesCreated: pages.map((p) => p.path),
          componentsCreated: components?.map((c) => c.name) || [],
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Failed to create website",
        }
      }
    },
  },

  editFile: {
    description: "Edit specific lines in a file without rewriting the entire file. Use this for targeted updates to existing files.",
    inputSchema: z.object({
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
      path: z.string().describe("File path relative to project root"),
      search: z.string().describe("Exact text to find in the file"),
      replace: z.string().describe("New text to replace with"),
    }),
    execute: async function* ({ projectId, path, search, replace }: { projectId: string; path: string; search: string; replace: string }) {
      const actualProjectId = projectId || "default"
      
      yield { state: "reading" as const, path }

      try {
        const sandbox = await createSandbox(actualProjectId)
        
        // Read current content
        const { content } = await readFileFromSandbox(sandbox, path)
        
        yield { state: "editing" as const, message: "Applying changes..." }
        
        // Apply replacement
        if (!content.includes(search)) {
          throw new Error(`Search text not found in ${path}`)
        }
        
        const newContent = content.replace(search, replace)
        
        yield { state: "writing" as const, path }
        
        // Write updated content
        await writeFileToSandbox(sandbox, path, newContent)
        
        yield { 
          state: "complete" as const, 
          path,
          linesChanged: search.split('\n').length,
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Edit failed",
        }
      }
    },
  },

  getProjectStructure: {
    description: "Get the full file tree and optionally key file contents of a project. Use this to understand project structure before making changes.",
    inputSchema: z.object({
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
      projectName: z.string().describe("Project name (directory name in /home/user/)"),
      includeContents: z.boolean().optional().describe("Include file contents for TypeScript/JavaScript files (default: false)"),
    }),
    execute: async function* ({ projectId, projectName, includeContents = false }: { projectId: string; projectName: string; includeContents?: boolean }) {
      const actualProjectId = projectId || "default"
      const projectDir = `/home/user/${projectName}`
      
      yield { state: "scanning" as const, message: "Scanning project structure..." }

      try {
        const sandbox = await createSandbox(actualProjectId)
        
        // Get file tree
        const treeResult = await executeCommand(sandbox,
          `cd ${projectDir} && find . -type f \\( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" -o -name "*.css" \\) ! -path "*/node_modules/*" ! -path "*/.next/*" | head -50`
        )
        const files = treeResult.stdout.split('\n').filter(Boolean).map(f => f.replace('./', ''))
        
        let contents: Record<string, string> = {}
        if (includeContents) {
          yield { state: "reading-files" as const, message: `Reading ${Math.min(files.length, 10)} files...` }
          
          // Limit to first 10 files to avoid token overflow
          for (const file of files.slice(0, 10)) {
            try {
              const { content } = await readFileFromSandbox(sandbox, `${projectDir}/${file}`)
              contents[file] = content
            } catch {
              // Skip files that can't be read
            }
          }
        }
        
        yield {
          state: "complete" as const,
          projectName,
          files,
          fileCount: files.length,
          contents,
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Failed to scan project",
        }
      }
    },
  },

  installPackage: {
    description: "Install npm packages in the project. Use this when you need to add new dependencies.",
    inputSchema: z.object({
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
      projectName: z.string().describe("Project name (directory name in /home/user/)"),
      packages: z.array(z.string()).describe("Package names to install (e.g., ['axios', 'lodash'])"),
      dev: z.boolean().optional().describe("Install as dev dependency (default: false)"),
    }),
    execute: async function* ({ projectId, projectName, packages, dev = false }: { projectId: string; projectName: string; packages: string[]; dev?: boolean }) {
      const actualProjectId = projectId || "default"
      const projectDir = `/home/user/${projectName}`
      const flag = dev ? '--save-dev' : '--save'
      
      yield { state: "installing" as const, packages, message: `Installing ${packages.join(', ')}...` }

      try {
        const sandbox = await createSandbox(actualProjectId)
        
        const result = await executeCommand(sandbox,
          `cd ${projectDir} && npm install ${flag} ${packages.join(' ')}`
        )
        
        if (result.exitCode !== 0) {
          throw new Error(`npm install failed: ${result.stderr}`)
        }
        
        yield {
          state: "complete" as const,
          packages,
          message: `Successfully installed ${packages.join(', ')}`,
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Installation failed",
        }
      }
    },
  },

  getBuildStatus: {
    description: "Check the build/compile status and get any errors from the Next.js dev server logs.",
    inputSchema: z.object({
      projectId: z.string().describe("Project ID for sandbox. Use 'default' if not specified."),
    }),
    execute: async function* ({ projectId }: { projectId: string }) {
      const actualProjectId = projectId || "default"
      
      yield { state: "checking" as const, message: "Checking server logs..." }

      try {
        const sandbox = await createSandbox(actualProjectId)
        
        // Read server logs
        const logsResult = await executeCommand(sandbox, 'tail -n 100 /tmp/server.log 2>/dev/null || echo "No logs found"')
        const logs = logsResult.stdout
        
        // Parse for common error patterns
        const hasErrors = logs.includes('Error:') || logs.includes('error ') || logs.includes('ERROR')
        const hasWarnings = logs.includes('warn') || logs.includes('Warning')
        
        yield {
          state: "complete" as const,
          hasErrors,
          hasWarnings,
          recentLogs: logs.slice(-2000), // Last 2KB of logs
          message: hasErrors ? "Errors detected in logs" : "No errors found",
        }
      } catch (error) {
        yield {
          state: "error" as const,
          error: error instanceof Error ? error.message : "Failed to check status",
        }
      }
    },
  },

  searchWeb: {
    description: "Search the web for documentation, examples, or solutions.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
    }),
    execute: async function* ({ query }: { query: string }) {
      yield { state: "searching" as const, query }
      // Placeholder - would integrate with actual search API
      yield {
        state: "complete" as const,
        query,
        results: `Search results for: ${query}`,
      }
    },
  },
}

// Export type for the chat messages - use any to avoid strict type issues with generator tools
export type ChatMessage = UIMessage

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      messages,
      projectId,
      model = "anthropic",
    } = body as {
      messages: UIMessage[]
      projectId?: string
      model?: ModelProvider
    }

    // Get selected model
    const selectedModel = MODEL_OPTIONS[model] || MODEL_OPTIONS.anthropic

    // Convert messages for the model
    const modelMessages = convertToModelMessages(messages)

    // Stream the response
    const result = streamText({
      model: selectedModel,
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools,
      maxSteps: 10,
      abortSignal: req.signal,
    } as any) // Cast to any to avoid strict type checking with tool generators

    // Pass originalMessages to prevent duplicate message IDs
    // See: https://github.com/vercel/ai/blob/ai@6.0.0-beta.128/content/docs/09-troubleshooting/13-repeated-assistant-messages.mdx
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      onFinish: async ({ messages: finishedMessages }) => {
        // Save message to database if projectId provided
        if (projectId) {
          try {
            const supabase = await createServerClient()

            // Save assistant response
            await supabase.from("messages").insert({
              project_id: projectId,
              role: "assistant",
              content: JSON.stringify(finishedMessages),
            })
          } catch (dbError) {
            console.error("Failed to save message:", dbError)
          }
        }
      },
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return new Response(JSON.stringify({ error: "Failed to process chat request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
