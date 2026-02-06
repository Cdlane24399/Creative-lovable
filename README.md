# Creative-lovable

An AI-powered web development assistant that builds real, working applications in seconds using E2B sandboxes, Next.js 15, and AI SDK v6.

[![Built with Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Powered by E2B](https://img.shields.io/badge/E2B-Sandboxes-blue?style=flat-square)](https://e2b.dev/)
[![AI SDK v6](https://img.shields.io/badge/AI_SDK-v6_beta-green?style=flat-square)](https://sdk.vercel.ai/)

## 🚀 Features

### **Instant Web App Generation**
- 🎨 Create complete Next.js websites with live preview URLs
- ⚡ **60x faster startup** with custom E2B templates (2-5 seconds vs 3-5 minutes)
- 🔥 Hot Module Replacement - changes reflect instantly
- 📝 Streaming file operations with real-time progress

### **Intelligent Code Editing**
- ✏️ Targeted file edits without rewriting entire files
- 🔍 Project structure analysis and understanding
- 🐛 Automatic error detection and self-healing
- 📦 Dynamic npm package installation

### **Professional UI Components**
- 🎭 Pre-installed shadcn/ui component library
- 🎨 Tailwind CSS for styling
- 🎬 Framer Motion for animations
- 🖼️ 1000+ Lucide React icons
- ♿ Fully accessible components

### **Multi-Model AI Support**
- 🤖 Claude Sonnet 4.5 (Anthropic) - Complex applications and reasoning
- ⚡ Gemini 3 Flash Preview (Google) - Fast, cost-effective responses
- 🧠 Gemini 3 Pro Preview (Google) - Advanced reasoning capabilities
- 🎯 GPT-5.2 (OpenAI) - Alternative OpenAI option
- 🚀 Claude Haiku (Anthropic) - Fast title generation
- 🔀 Switch models on-the-fly

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Custom Template Setup](#custom-template-setup-recommended)
- [Available Tools](#available-tools)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Demo Workflow](#demo-workflow)

---

## ⚡ Quick Start

### Prerequisites

- Node.js 18+ 
- npm or pnpm
- E2B API key ([sign up](https://e2b.dev))
- At least one AI provider API key (Anthropic, OpenAI, or Google)

### Installation

\`\`\`bash
# Clone the repository
git clone https://github.com/yourusername/Creative-lovable.git
cd Creative-lovable

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Add your API keys to .env.local
# See Environment Setup section below

# Run development server
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔧 Environment Setup

Create a `.env.local` file with the following:

```env
# Required: E2B API Key (get at https://e2b.dev)
E2B_API_KEY=your_e2b_api_key

# Optional but HIGHLY RECOMMENDED: Custom E2B Template
# This provides 60x faster startup (see Custom Template Setup below)
E2B_TEMPLATE=nextjs-app-bun
# Backward-compatible alias also supported:
# E2B_TEMPLATE_ID=nextjs-app-bun

# Required: AI Gateway (recommended) OR at least one direct provider
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}
AI_GATEWAY_TOKEN=your_gateway_token

# Fallback: Direct provider API keys (if not using Gateway)
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key

# Required: Neon Database
NEON_DATABASE_URL=your_neon_database_url
# or
DATABASE_URL=your_database_url

# Optional: Redis for caching (Upstash/Vercel)
UPSTASH_REDIS_REST_URL=your_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_redis_rest_token
# Alternative env var names supported:
# REDIS_URL=your_redis_rest_url
# REDIS_TOKEN=your_redis_rest_token

# Optional: API authentication
API_KEY=your_api_key
```

---

## 🚀 Custom Template Setup (Recommended)

For **60x faster startup**, build a custom E2B template with all dependencies pre-installed:

### Step 1: Build the Template
\`\`\`bash
pnpm template:build
\`\`\`

This uses `lib/e2b/templates/build.ts` and prints the new template ID at the end.

### Step 2: Update Environment
Add the generated template ID (or template name) to your `.env.local`:
\`\`\`env
E2B_TEMPLATE=your-template-id
\`\`\`

### Performance Impact
- **Without template**: 3-5 minutes cold start
- **With template**: 2-5 seconds cold start ⚡

📖 **Full instructions**: See [`lib/e2b/templates/README.md`](lib/e2b/templates/README.md)

---

## 🛠️ Available Tools

The AI assistant has access to these tools:

### Website Creation & Editing
- **`createWebsite`** - Create or update complete websites with live preview
- **`editFile`** - Make targeted edits to existing files
- **`writeFile`** - Write individual files
- **`readFile`** - Read file contents

### Project Management
- **`getProjectStructure`** - List all files and optionally read contents
- **`installPackage`** - Install npm packages dynamically
- **`getBuildStatus`** - Check dev server logs for errors
- **`runCommand`** - Execute shell commands

### Code Execution
- **`executeCode`** - Run Python, JavaScript, or TypeScript code
- **`generateComponent`** - Generate React/Next.js components
- **`searchWeb`** - Search for documentation (placeholder)

---

## 🏗️ Architecture

```
Creative-lovable/
├── app/
│   ├── api/
│   │   ├── chat/route.ts           # AI chat with streaming & tools
│   │   ├── projects/               # Project CRUD API
│   │   │   ├── route.ts            # List/create projects
│   │   │   └── [id]/
│   │   │       ├── route.ts        # Get/update/delete project
│   │   │       ├── messages/       # Message persistence
│   │   │       └── screenshot/     # Screenshot saves
│   │   └── sandbox/                # Sandbox dev server API
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Landing page
├── components/
│   ├── chat-panel.tsx              # Chat interface
│   ├── editor-layout.tsx           # Main editor layout
│   ├── preview-panel.tsx           # Website preview iframe
│   └── ui/                         # shadcn/ui components
├── lib/
│   ├── ai/
│   │   ├── agent.ts                # System prompt & model config
│   │   ├── agent-context.ts        # Context management (write-through)
│   │   ├── context-types.ts        # Type definitions
│   │   ├── web-builder-agent.ts    # Context-aware tools
│   │   ├── planning/               # TaskGraph planning system
│   │   └── tools/                  # Tool exports
│   ├── db/
│   │   ├── neon.ts                 # Database connection
│   │   ├── types.ts                # Database types
│   │   └── repositories/           # Data access layer
│   │       ├── base.repository.ts
│   │       ├── project.repository.ts
│   │       ├── message.repository.ts
│   │       └── context.repository.ts
│   ├── services/                   # Business logic layer
│   │   ├── project.service.ts
│   │   ├── message.service.ts
│   │   └── context.service.ts
│   ├── cache/                      # Unified cache management
│   │   └── cache-manager.ts
│   ├── e2b/
│   │   ├── sandbox.ts              # E2B sandbox management
│   │   ├── sandbox-state-machine.ts # Sandbox lifecycle
│   │   └── templates/              # Custom template definitions
│   ├── errors.ts                   # Error handling
│   ├── auth.ts                     # Authentication
│   └── rate-limit.ts               # Rate limiting
├── hooks/                          # React hooks
└── README.md                       # This file
```

### Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Routes Layer                        │
│  (Thin controllers with validation & error handling)        │
├─────────────────────────────────────────────────────────────┤
│                     Services Layer                           │
│  ProjectService | MessageService | ContextService            │
│  (Business logic, caching, cross-entity coordination)       │
├─────────────────────────────────────────────────────────────┤
│                   Repository Layer                           │
│  ProjectRepository | MessageRepository | ContextRepository   │
│  (Database operations, type-safe queries)                   │
├─────────────────────────────────────────────────────────────┤
│                    Cache Manager                             │
│  (Unified cache with event emission & health checks)        │
├─────────────────────────────────────────────────────────────┤
│                   Agent Context                              │
│  (Write-through caching, TaskGraph planning)                │
├─────────────────────────────────────────────────────────────┤
│                 Sandbox State Machine                        │
│  (Formal lifecycle: idle→creating→active→paused→expired)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Documentation

- **[E2B Template Setup](lib/e2b/templates/README.md)** - Custom template guide
- **[CLAUDE.md](CLAUDE.md)** - Project documentation for AI assistants

---

## 🎬 Demo Workflow

### Example 1: Create a Landing Page
\`\`\`
User: "Build me a landing page for a SaaS product"

AI: 
1. Uses createWebsite tool
2. Generates Next.js project with:
   - Hero section with gradient background
   - Features section using shadcn/ui Cards
   - CTA buttons with hover effects
   - Responsive navigation
3. Returns live preview URL: https://xyz.e2b.dev

Time: ~3 seconds (with custom template)
\`\`\`

### Example 2: Make Updates
\`\`\`
User: "Make the CTA button purple"

AI:
1. Uses editFile tool
2. Updates button styling
3. Changes reflect instantly via HMR

Time: ~2 seconds
\`\`\`

### Example 3: Add Features
\`\`\`
User: "Add a pricing section with 3 tiers"

AI:
1. Uses createWebsite with action: 'update'
2. Creates pricing component using shadcn/ui Card & Badge
3. Adds to homepage
4. Browser auto-refreshes

Time: ~3 seconds
\`\`\`

### Example 4: Debug Errors
\`\`\`
User: "The site isn't loading, what's wrong?"

AI:
1. Uses getBuildStatus tool
2. Reads error logs: "Module not found: 'lucide-react'"
3. Uses installPackage to install lucide-react
4. Uses editFile to fix import
5. Site now works!

Time: ~10 seconds total
\`\`\`

---

## 🎯 Key Achievements

✅ **60x Faster Startup** - Custom E2B templates eliminate npm install delays  
✅ **Streaming Progress** - Real-time feedback as files are created  
✅ **Hot Reload Support** - Changes reflect instantly without restarts  
✅ **Error Recovery** - AI can detect and fix build errors automatically  
✅ **Rich Component Library** - shadcn/ui integration for professional UIs  
✅ **Project Awareness** - AI understands existing project structure  
✅ **Dynamic Dependencies** - Install packages on-demand  

---

## 🔮 Future Enhancements

- [ ] **UI Improvements**: File explorer, code editor, three-panel layout
- [ ] **Deployment**: One-click deploy to Vercel/Netlify
- [ ] **Testing**: Run test suites, get coverage reports
- [ ] **Performance**: Lighthouse scores, optimization suggestions
- [ ] **Backend**: API routes, database integration, authentication
- [ ] **Git Integration**: Version control, commit management

---

## 🐛 Known Limitations

1. **Template Build Time**: First build takes 5-10 minutes (one-time)
2. **Sandbox Timeout**: Expires after 10 minutes of inactivity
3. **File Limit**: Reads max 10 files at once to avoid token overflow
4. **No Version Control**: Git integration not yet implemented

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙌 Credits

**Built with**:
- [E2B](https://e2b.dev) - Cloud sandboxes for code execution
- [AI SDK v6](https://sdk.vercel.ai/) - Vercel's AI SDK (beta)
- [Next.js 15](https://nextjs.org/) - React framework with Turbopack
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Framer Motion](https://www.framer.com/motion/) - Animation library
- [Lucide Icons](https://lucide.dev/) - Icon library

---

## 💬 Support

- 📧 Email: support@example.com
- 💬 Discord: [Join our server](https://discord.gg/example)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/Creative-lovable/issues)

---

<div align="center">

**Made with ❤️ by the Creative-lovable team**

[⭐ Star this repo](https://github.com/yourusername/Creative-lovable) if you find it useful!

</div>
