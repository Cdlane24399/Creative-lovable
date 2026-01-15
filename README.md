# Creative-lovable

![Creative-lovable hero](public/ai-chat-interface-with-code-suggestions.jpg)

An AI-powered web development assistant that builds real, working applications in seconds using E2B sandboxes, Next.js 16 (platform), and AI SDK v6.

[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Powered by E2B](https://img.shields.io/badge/E2B-Sandboxes-blue?style=flat-square)](https://e2b.dev/)
[![AI SDK v6](https://img.shields.io/badge/AI_SDK-v6_beta-green?style=flat-square)](https://sdk.vercel.ai/)
[![Database](https://img.shields.io/badge/Neon-PostgreSQL-00E599?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech/)

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
- 🤖 Claude Sonnet 4.5 (Anthropic)
- ⚡ Gemini 2.0 Flash (Google)
- 🧠 GPT-4o (OpenAI)
- 🔀 Switch models on-the-fly

### **Production-Ready Persistence**
- 🗄️ Neon Serverless PostgreSQL for projects + chat history
- 🔐 Environment-based configuration
- 📦 Compatible with Prisma or direct SQL

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Custom Template Setup](#custom-template-setup-recommended)
- [Available Tools](#available-tools)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Screenshots](#screenshots)
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
pnpm install

# Create environment file
touch .env.local

# Add your API keys to .env.local
# See Environment Setup section below

# Run development server
pnpm dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔧 Environment Setup

Create a `.env.local` file with the following:

\`\`\`env
# Required: E2B API Key (get at https://e2b.dev)
E2B_API_KEY=your_e2b_api_key

# Optional but HIGHLY RECOMMENDED: Custom E2B Template
# This provides 60x faster startup (see Custom Template Setup below)
E2B_TEMPLATE_ID=nextjs-shadcn-v1

# Required: At least ONE AI provider
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key

# Optional: Neon (serverless Postgres) for persistence
NEON_DATABASE_URL=postgres://user:password@host.neon.tech/dbname?sslmode=require
# Or use DATABASE_URL if preferred
DATABASE_URL=postgres://user:password@host.neon.tech/dbname?sslmode=require
\`\`\`

---

## 🚀 Custom Template Setup (Recommended)

For **60x faster startup**, build a custom E2B template with all dependencies pre-installed:

### Step 1: Install E2B CLI
\`\`\`bash
npm install -g @e2b/cli
\`\`\`

### Step 2: Login to E2B
\`\`\`bash
e2b auth login
\`\`\`

### Step 3: Build the Template
\`\`\`bash
e2b template build \
  --path ./lib/e2b/templates/nextjs-shadcn.e2b.Dockerfile \
  --name "nextjs-shadcn-v1"
\`\`\`

This takes 5-10 minutes the first time but is a one-time cost.

### Step 4: Update Environment
Add the template ID to your `.env.local`:
\`\`\`env
E2B_TEMPLATE_ID=nextjs-shadcn-v1
\`\`\`

### Performance Impact
- **Without template**: 3-5 minutes cold start
- **With template**: 2-5 seconds cold start ⚡

📖 **Full instructions**: See [lib/e2b/templates/README.md](lib/e2b/templates/README.md)

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
- **`analyzeProjectState`** - Summarize current context and health

### Code Execution
- **`executeCode`** - Run Python, JavaScript, or TypeScript code
- **`generateComponent`** - Generate React/Next.js components
- **`searchWeb`** - Search for documentation (placeholder)

---

## 🏗️ Architecture

\`\`\`
Creative-lovable/
├── app/
│   ├── api/chat/route.ts         # AI chat API with tool definitions
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing page
├── components/
│   ├── chat-panel.tsx            # Chat interface
│   ├── editor-layout.tsx         # Main editor layout
│   ├── preview-panel.tsx         # Website preview iframe
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── ai/
│   │   ├── agent.tsx             # System prompt & model config
│   │   └── web-builder-agent.ts  # Tool definitions
│   ├── e2b/
│   │   ├── sandbox.ts            # E2B sandbox management
│   │   └── templates/            # Custom template definitions
│   └── db/                       # Neon database helpers
├── IMPLEMENTATION_PLAN.md        # Original implementation plan
├── IMPLEMENTATION_SUMMARY.md     # What was implemented
└── README.md                     # This file
\`\`\`

---

## 📚 Documentation

- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Detailed feature documentation
- **[Implementation Plan](IMPLEMENTATION_PLAN.md)** - Original technical plan
- **[E2B Template Setup](lib/e2b/templates/README.md)** - Custom template guide
- **[E2B Template Setup (Status)](E2B_TEMPLATE_SETUP.md)** - Build + deployment checklist
- **[Template Optimization Notes](TEMPLATE_OPTIMIZATION_COMPLETE.md)** - Performance deep dive

---

## 🖼️ Screenshots

![Chat + preview experience](public/collaborative-editor-with-multiple-cursors.jpg)
![AI suggestions + code view](public/ai-chat-interface-with-code-suggestions.jpg)
![Dashboard style preview](public/modern-web-dashboard-dark.jpg)

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
- [ ] **Git Integration**: Sandbox-aware version control, commit management

---

## 🐛 Known Limitations

1. **Template Build Time**: First build takes 5-10 minutes (one-time)
2. **Sandbox Timeout**: Expires after 10 minutes of inactivity
3. **File Limit**: Reads max 10 files at once to avoid token overflow
4. **No Sandbox Git**: Sandboxes do not persist git history by default

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
- [Next.js 16](https://nextjs.org/) - React framework with Turbopack
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
