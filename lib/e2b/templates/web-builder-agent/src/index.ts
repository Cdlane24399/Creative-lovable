/**
 * Web Builder Agent
 *
 * An AI-powered agent that builds websites using Claude Agent SDK.
 * Designed to integrate with E2B sandboxes for isolated code execution.
 *
 * Features:
 * - File system operations (Read, Write, Edit)
 * - Command execution (Bash)
 * - Code search (Glob, Grep)
 * - Web research (WebSearch, WebFetch)
 * - Streaming responses
 * - Custom permission handling
 * - Error handling and recovery
 */

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type {
  Options,
  SDKMessage,
  SDKResultMessage,
  SDKAssistantMessage,
  SDKSystemMessage,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ============================================================================
// Configuration
// ============================================================================

const AGENT_CONFIG = {
  // Model to use (can be overridden via environment variable)
  model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514",

  // Maximum number of conversation turns
  maxTurns: 50,

  // Maximum budget in USD (optional safety limit)
  maxBudgetUsd: 5.0,

  // Working directory for file operations
  cwd: process.cwd(),
} as const;

// System prompt that defines the agent's behavior
const SYSTEM_PROMPT = `You are an expert web developer agent that builds modern, responsive websites.

## Your Capabilities
- Create complete Next.js/React applications from scratch
- Write clean, well-structured TypeScript code
- Use Tailwind CSS for styling
- Implement responsive designs that work on all devices
- Add animations and interactive elements
- Set up proper project structure with components, pages, and utilities

## Guidelines
1. **Code Quality**: Write clean, readable, and maintainable code
2. **Best Practices**: Follow React/Next.js best practices and conventions
3. **Responsive Design**: Ensure all layouts work on mobile, tablet, and desktop
4. **Accessibility**: Include proper ARIA labels and semantic HTML
5. **Performance**: Optimize for fast loading and smooth interactions

## Project Structure
When creating a new project, use this structure:
- app/ - Next.js app router pages
- components/ - Reusable React components
- components/ui/ - UI primitives (buttons, inputs, cards)
- lib/ - Utility functions and helpers
- public/ - Static assets

## Available Tools
You have access to file system tools (Read, Write, Edit, Glob, Grep) and Bash for running commands.
Use these tools to create files, install dependencies, and verify your work.

When asked to build something, ALWAYS:
1. Plan the structure first
2. Create necessary files
3. Install any required dependencies
4. Verify the code compiles without errors`;

// ============================================================================
// Custom MCP Tools (Example: Project Scaffolding)
// ============================================================================

/**
 * Custom tool for scaffolding a new Next.js project structure.
 * This demonstrates how to create custom MCP tools with the SDK.
 */
const scaffoldProjectTool = tool(
  "scaffold_nextjs_project",
  "Create the basic structure for a new Next.js project with TypeScript and Tailwind CSS",
  {
    projectName: z.string().describe("Name of the project"),
    includeComponents: z
      .array(z.string())
      .optional()
      .describe("List of shadcn/ui components to include"),
  },
  async (args) => {
    const { projectName, includeComponents = [] } = args;

    // Return the scaffold instructions as text content
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              projectName,
              structure: {
                "app/layout.tsx": "Root layout with providers",
                "app/page.tsx": "Home page",
                "app/globals.css": "Global styles with Tailwind",
                "components/": "Reusable components",
                "lib/utils.ts": "Utility functions",
                "package.json": "Dependencies and scripts",
                "tsconfig.json": "TypeScript configuration",
                "tailwind.config.ts": "Tailwind configuration",
              },
              suggestedComponents: includeComponents,
              nextSteps: [
                "Create the directory structure",
                "Write package.json with dependencies",
                "Create tsconfig.json",
                "Set up Tailwind configuration",
                "Create root layout and home page",
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/**
 * Custom tool for analyzing project dependencies.
 */
const analyzeDepsTool = tool(
  "analyze_dependencies",
  "Analyze and suggest dependencies for a web project based on requirements",
  {
    requirements: z
      .array(z.string())
      .describe("List of features/requirements for the project"),
  },
  async (args) => {
    const { requirements } = args;

    // Map common requirements to dependencies
    const depMap: Record<string, string[]> = {
      animation: ["framer-motion"],
      forms: ["react-hook-form", "zod", "@hookform/resolvers"],
      icons: ["lucide-react"],
      ui: ["@radix-ui/react-slot", "class-variance-authority", "clsx", "tailwind-merge"],
      state: ["zustand"],
      api: ["axios", "swr"],
      date: ["date-fns"],
      charts: ["recharts"],
    };

    const suggestedDeps: string[] = [];
    for (const req of requirements) {
      const lowerReq = req.toLowerCase();
      for (const [key, deps] of Object.entries(depMap)) {
        if (lowerReq.includes(key)) {
          suggestedDeps.push(...deps);
        }
      }
    }

    // Remove duplicates
    const uniqueDeps = [...new Set(suggestedDeps)];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              requirements,
              suggestedDependencies: uniqueDeps,
              baseDependencies: [
                "next",
                "react",
                "react-dom",
                "typescript",
                "@types/react",
                "@types/node",
                "tailwindcss",
                "postcss",
                "autoprefixer",
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Create an MCP server with our custom tools
const webBuilderMcpServer = createSdkMcpServer({
  name: "web-builder-tools",
  version: "1.0.0",
  tools: [scaffoldProjectTool, analyzeDepsTool],
});

// ============================================================================
// Permission Handler
// ============================================================================

/**
 * Custom permission handler that controls what tools the agent can use.
 * This demonstrates how to implement fine-grained access control.
 */
async function handlePermission(
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal }
): Promise<PermissionResult> {
  // Log tool usage for audit purposes
  console.log(`[Permission Check] Tool: ${toolName}`);

  // Define allowed patterns for different tools
  const allowedPatterns: Record<string, (input: Record<string, unknown>) => boolean> = {
    // Allow all read operations
    Read: () => true,
    Glob: () => true,
    Grep: () => true,

    // Allow write operations only to specific directories
    Write: (inp) => {
      const filePath = inp.file_path as string;
      // Only allow writes to project directories, not system files
      return (
        !filePath.startsWith("/etc") &&
        !filePath.startsWith("/usr") &&
        !filePath.startsWith("/var")
      );
    },

    // Allow edits with same restrictions as Write
    Edit: (inp) => {
      const filePath = inp.file_path as string;
      return (
        !filePath.startsWith("/etc") &&
        !filePath.startsWith("/usr") &&
        !filePath.startsWith("/var")
      );
    },

    // Allow safe bash commands
    Bash: (inp) => {
      const command = inp.command as string;
      // Block dangerous commands
      const dangerousPatterns = [
        /rm\s+-rf\s+\/(?!\s)/,
        /sudo\s+/,
        /chmod\s+777/,
        /mkfs/,
        /dd\s+if=/,
      ];
      return !dangerousPatterns.some((pattern) => pattern.test(command));
    },

    // Allow web operations
    WebSearch: () => true,
    WebFetch: () => true,
  };

  // Check if tool is allowed
  const checker = allowedPatterns[toolName];
  if (checker && checker(input)) {
    return {
      behavior: "allow",
      updatedInput: input,
    };
  }

  // Deny by default with explanation
  return {
    behavior: "deny",
    message: `Tool "${toolName}" is not allowed or input doesn't match allowed patterns`,
  };
}

// ============================================================================
// Message Handlers
// ============================================================================

/**
 * Process and display assistant messages (Claude's responses).
 */
function handleAssistantMessage(message: SDKAssistantMessage): void {
  const content = message.message.content;

  for (const block of content) {
    if (block.type === "text") {
      console.log("\n" + block.text);
    } else if (block.type === "tool_use") {
      console.log(`\n[Using tool: ${block.name}]`);
    }
  }
}

/**
 * Process system initialization message.
 */
function handleSystemMessage(message: SDKSystemMessage): void {
  console.log("\n========================================");
  console.log("Web Builder Agent Initialized");
  console.log("========================================");
  console.log(`Session ID: ${message.session_id}`);
  console.log(`Model: ${message.model}`);
  console.log(`Tools available: ${message.tools.length}`);
  console.log(`MCP Servers: ${message.mcp_servers.map((s) => s.name).join(", ") || "none"}`);
  console.log("========================================\n");
}

/**
 * Process result messages (final output from agent).
 */
function handleResultMessage(message: SDKResultMessage): void {
  console.log("\n========================================");
  console.log("Agent Task Complete");
  console.log("========================================");

  if (message.subtype === "success") {
    console.log(`Status: Success`);
    console.log(`Turns: ${message.num_turns}`);
    console.log(`Duration: ${(message.duration_ms / 1000).toFixed(2)}s`);
    console.log(`Cost: $${message.total_cost_usd.toFixed(4)}`);
    console.log(
      `Tokens: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`
    );

    if (message.result) {
      console.log("\nFinal Result:");
      console.log(message.result);
    }
  } else {
    console.log(`Status: Error (${message.subtype})`);
    if (message.errors && message.errors.length > 0) {
      console.log("Errors:");
      for (const error of message.errors) {
        console.log(`  - ${error}`);
      }
    }
  }

  console.log("========================================\n");
}

// ============================================================================
// Main Agent Function
// ============================================================================

/**
 * Run the Web Builder Agent with a given prompt.
 *
 * @param prompt - The user's request (e.g., "Build a landing page for a SaaS product")
 * @param options - Optional configuration overrides
 */
export async function runWebBuilderAgent(
  prompt: string,
  options: Partial<Options> = {}
): Promise<SDKResultMessage | null> {
  console.log("\n[Starting Web Builder Agent]");
  console.log(`Prompt: ${prompt}\n`);

  let resultMessage: SDKResultMessage | null = null;

  try {
    // Create the query with full configuration
    const agentQuery = query({
      prompt,
      options: {
        // Use Claude Code's system prompt as base, with our additions
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: SYSTEM_PROMPT,
        },

        // Use Claude Code's built-in tools
        tools: { type: "preset", preset: "claude_code" },

        // Specify allowed tools for web building
        allowedTools: [
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "Bash",
          "WebSearch",
          "WebFetch",
          "TodoWrite",
        ],

        // Add our custom MCP server
        mcpServers: {
          "web-builder-tools": webBuilderMcpServer,
        },

        // Model configuration
        model: AGENT_CONFIG.model,
        maxTurns: AGENT_CONFIG.maxTurns,
        maxBudgetUsd: AGENT_CONFIG.maxBudgetUsd,

        // Working directory
        cwd: AGENT_CONFIG.cwd,

        // Permission handling
        permissionMode: "default",
        canUseTool: handlePermission,

        // Allow any additional options to override
        ...options,
      },
    });

    // Process the streaming response
    for await (const message of agentQuery) {
      // Route messages to appropriate handlers
      switch (message.type) {
        case "system":
          if (message.subtype === "init") {
            handleSystemMessage(message as SDKSystemMessage);
          }
          break;

        case "assistant":
          handleAssistantMessage(message as SDKAssistantMessage);
          break;

        case "result":
          resultMessage = message as SDKResultMessage;
          handleResultMessage(resultMessage);
          break;

        case "user":
          // User messages during replay - can be logged if needed
          break;

        case "stream_event":
          // Handle streaming events for real-time updates
          // Useful for showing progress during long operations
          break;
      }
    }
  } catch (error) {
    console.error("\n[Agent Error]");
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    } else {
      console.error(error);
    }
  }

  return resultMessage;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Main entry point when running from command line.
 */
async function main(): Promise<void> {
  // Get prompt from command line arguments or use default
  const prompt = process.argv[2] ?? "Create a simple landing page with a hero section";

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set");
    console.error("Get your API key from https://console.anthropic.com/");
    process.exit(1);
  }

  // Run the agent
  const result = await runWebBuilderAgent(prompt);

  // Exit with appropriate code
  if (result?.subtype === "success") {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run main if this is the entry point
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
