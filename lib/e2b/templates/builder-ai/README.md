# BuilderAI - AI-Powered Web Application Builder

An AI-powered platform that enables users to create full-stack web applications through natural language prompts and visual editing.

## Features

- 🤖 **AI-Powered Code Generation** - Generate React components using natural language
- 💻 **Monaco Code Editor** - Professional code editing experience
- 👁️ **Live Preview** - Real-time preview of your application
- 📁 **File Tree Navigation** - Organize and navigate your project files
- 🎨 **Modern UI** - Built with shadcn/ui and Tailwind CSS v4
- 🌓 **Dark Mode** - Full dark mode support

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS v4 with OKLCH colors
- **UI Components**: shadcn/ui
- **Code Editor**: Monaco Editor
- **Icons**: Lucide React
- **State Management**: Zustand
- **Forms**: React Hook Form + Zod
- **Backend**: Firebase (Firestore, Auth, Storage)
- **AI**: Google Gemini 2.5 via Firebase Genkit

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd builder-ai
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Set up environment variables:
\`\`\`bash
cp .env.local.example .env.local
\`\`\`

Edit `.env.local` and add your Firebase and Google AI credentials.

4. Run the development server:
\`\`\`bash
npm run dev
\`\`\`

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

\`\`\`
builder-ai/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── chat/               # Chat interface components
│   │   │   └── chat-interface.tsx
│   │   └── editor/             # Editor components
│   │       ├── code-editor.tsx
│   │       ├── preview-pane.tsx
│   │       └── file-tree.tsx
│   └── lib/
│       └── utils.ts
├── public/                     # Static assets
├── next.config.ts
├── tailwind.config.ts
└── package.json
\`\`\`

## Available Scripts

- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run start\` - Start production server
- \`npm run lint\` - Run ESLint

## Features Roadmap

- [ ] Firebase Authentication integration
- [ ] Firestore project persistence
- [ ] Google Gemini AI integration
- [ ] Real-time collaboration
- [ ] Export to GitHub
- [ ] Template library
- [ ] Component marketplace

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [Firebase](https://firebase.google.com)
- [Google Gemini](https://ai.google.dev)
