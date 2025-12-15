# E2B Custom Template for Next.js 15 + shadcn/ui + Tailwind CSS
# This pre-built template dramatically reduces cold-start time from ~3-5 minutes to ~2-5 seconds

FROM node:22-slim

# Set working directory
WORKDIR /home/user

# Install essential system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create project directory
WORKDIR /home/user/project

# Initialize Next.js 15 with TypeScript, Tailwind CSS, and App Router
RUN npx create-next-app@15 . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes

# Initialize shadcn/ui with default configuration
RUN npx shadcn@latest init -y --defaults

# Pre-install all shadcn/ui components
RUN npx shadcn@latest add button card input label select textarea switch checkbox radio-group slider tabs dialog sheet tooltip dropdown-menu popover avatar badge progress separator skeleton table alert command calendar form accordion collapsible context-menu hover-card menubar navigation-menu scroll-area toggle aspect-ratio carousel resizable sonner drawer -y --overwrite

# Install additional UI libraries
RUN npm install lucide-react @radix-ui/react-icons framer-motion class-variance-authority clsx tailwind-merge

# Install development dependencies
RUN npm install -D @types/node @types/react @types/react-dom typescript

# Build the initial project to cache dependencies, then remove .next to prevent stale content
# The build populates npm cache but we don't want the compiled output served as default
RUN npm run build || true && rm -rf .next

# Expose Next.js dev server port
EXPOSE 3000

# Start the dev server by default
CMD ["npm", "run", "dev"]
