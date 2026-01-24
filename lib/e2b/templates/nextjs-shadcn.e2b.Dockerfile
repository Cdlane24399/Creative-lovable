# E2B Custom Template for Next.js 16 + shadcn/ui + Tailwind CSS v4
# This pre-built template dramatically reduces cold-start time from ~3-5 minutes to ~2-5 seconds

FROM node:22-slim

# Set working directory
WORKDIR /home/user

# Install essential system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally for faster package management
RUN npm install -g pnpm

# Create project directory
WORKDIR /home/user/project

# Initialize Next.js 16 with TypeScript, Tailwind CSS, and App Router
RUN npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --yes

# Initialize shadcn/ui with default configuration (uses Tailwind v4)
RUN npx shadcn@latest init -y --defaults

# Pre-install all shadcn/ui components (comprehensive set)
RUN npx shadcn@latest add \
    button card input label select textarea switch checkbox radio-group slider \
    tabs dialog sheet tooltip dropdown-menu popover avatar badge progress \
    separator skeleton table alert command calendar form accordion collapsible \
    context-menu hover-card menubar navigation-menu scroll-area toggle \
    aspect-ratio carousel resizable sonner drawer alert-dialog breadcrumb \
    chart input-otp pagination sidebar toggle-group \
    -y --overwrite

# Install additional UI and utility libraries
RUN pnpm add \
    lucide-react \
    @radix-ui/react-icons \
    framer-motion \
    class-variance-authority \
    clsx \
    tailwind-merge \
    react-markdown \
    remark-gfm \
    rehype-highlight \
    recharts \
    date-fns \
    zod \
    react-hook-form \
    @hookform/resolvers

# Install development dependencies
RUN pnpm add -D @types/node @types/react @types/react-dom typescript

# Clean up create-next-app artifacts that break fresh installations
# - pnpm-workspace.yaml: Conflicts with pnpm install in non-monorepo setup
# - next.config.ts: Rename to .mjs for better compatibility
RUN rm -f pnpm-workspace.yaml && \
    (mv next.config.ts next.config.mjs 2>/dev/null || true)

# Skip build - the start_cmd in e2b.toml will start the dev server
# which creates .next cache on demand during template snapshot

# Set environment for development
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Expose Next.js dev server port
EXPOSE 3000

# Start the dev server by default
CMD ["pnpm", "run", "dev"]
