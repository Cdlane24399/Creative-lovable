# Web Builder Agent

AI-powered web development assistant using the Claude Agent SDK with E2B sandbox integration.

## Features

- Build complete Next.js/React applications from natural language descriptions
- Custom MCP tools for project scaffolding and dependency analysis
- File system operations (Read, Write, Edit, Glob, Grep)
- Command execution with safety controls
- Web research capabilities (WebSearch, WebFetch)
- Streaming responses with real-time progress
- Custom permission handling for security

## Prerequisites

- Node.js 18.0.0 or higher
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)
- (Optional) E2B API key from [e2b.dev](https://e2b.dev/) for sandbox integration

## Setup

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure environment:**
   \`\`\`bash
   cp .env.example .env
   \`\`\`

   Edit `.env` and add your API key:
   \`\`\`
   ANTHROPIC_API_KEY=your_api_key_here
   \`\`\`

3. **Run the agent:**
   \`\`\`bash
   npm start "Build a landing page for a SaaS product"
   \`\`\`

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run the agent with a prompt |
| `npm run dev` | Development mode with watch |
| `npm run build` | Build for production |
| `npm run typecheck` | Type check without emitting |
| `npm run lint` | Run ESLint |

## Usage Examples

\`\`\`bash
# Build a landing page
npm start "Create a modern landing page with a hero section, features grid, and contact form"

# Create a dashboard
npm start "Build an admin dashboard with sidebar navigation and data charts"

# Generate components
npm start "Create a reusable card component with multiple variants"
\`\`\`

## Custom MCP Tools

The agent includes two custom tools:

### scaffold_nextjs_project
Creates the basic structure for a new Next.js project with TypeScript and Tailwind CSS.

### analyze_dependencies
Analyzes project requirements and suggests appropriate dependencies.

## Project Structure

\`\`\`
web-builder-agent/
├── src/
│   └── index.ts      # Main agent implementation
├── dist/             # Compiled output
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
├── .env.example      # Environment template
└── README.md         # This file
\`\`\`

## Configuration

Configuration options in `src/index.ts`:

\`\`\`typescript
const AGENT_CONFIG = {
  model: "claude-sonnet-4-20250514",  // Claude model to use
  maxTurns: 50,                       // Maximum conversation turns
  maxBudgetUsd: 5.0,                  // Safety budget limit
  cwd: process.cwd(),                 // Working directory
};
\`\`\`

## Security

The agent includes permission controls that:
- Block writes to system directories (`/etc`, `/usr`, `/var`)
- Prevent dangerous bash commands (`rm -rf /`, `sudo`, etc.)
- Allow read operations by default
- Log all tool usage for audit purposes

## API Reference

### runWebBuilderAgent(prompt, options?)

Main function to run the agent.

\`\`\`typescript
import { runWebBuilderAgent } from './index.js';

const result = await runWebBuilderAgent(
  "Build a landing page",
  { maxTurns: 25 }
);
\`\`\`

**Parameters:**
- `prompt`: The user's request
- `options`: Optional configuration overrides

**Returns:** `SDKResultMessage | null`

## Resources

- [Claude Agent SDK Documentation](https://platform.claude.com/docs/en/api/agent-sdk/overview)
- [TypeScript SDK Reference](https://platform.claude.com/docs/en/api/agent-sdk/typescript)
- [Example Agents](https://github.com/anthropics/claude-agent-sdk-demos)

## License

MIT
