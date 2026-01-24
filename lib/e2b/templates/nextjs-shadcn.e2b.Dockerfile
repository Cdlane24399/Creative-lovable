# E2B Custom Template for Next.js 16 + shadcn/ui + Tailwind CSS v4 (+ Three.js stack)
# Updated: uses vercel@latest + extra 3D “good next adds”

FROM node:22-slim

# ---- Base OS deps ----
WORKDIR /home/user

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# pnpm
RUN npm install -g pnpm

# ---- App workspace ----
WORKDIR /home/user/project

# Initialize Next.js (latest)
RUN npx create-next-app@latest . \
    --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --yes

# Vercel CLI (latest)
RUN pnpm add -D vercel@latest

# Initialize shadcn/ui (Tailwind v4 aware)
RUN npx shadcn@latest init -y --defaults

# Pre-install a comprehensive set of shadcn/ui components
RUN npx shadcn@latest add \
    button card input label select textarea switch checkbox radio-group slider \
    tabs dialog sheet tooltip dropdown-menu popover avatar badge progress \
    separator skeleton table alert command calendar form accordion collapsible \
    context-menu hover-card menubar navigation-menu scroll-area toggle \
    aspect-ratio carousel resizable sonner drawer alert-dialog breadcrumb \
    chart input-otp pagination sidebar toggle-group \
    -y --overwrite

# ---- Core UI + utilities ----
RUN pnpm add \
    lucide-react \
    @radix-ui/react-icons \
    framer-motion \
    class-variance-authority \
    clsx \
    tailwind-merge \
    tailwindcss-animate \
    next-themes \
    react-markdown \
    remark-gfm \
    rehype-highlight \
    recharts \
    date-fns \
    zod \
    react-hook-form \
    @hookform/resolvers \
    zustand \
    @tanstack/react-query \
    ky \
    nanoid

# ---- Three.js / 3D stack ----
RUN pnpm add \
    three \
    @react-three/fiber \
    @react-three/drei \
    @react-three/postprocessing \
    leva \
    @react-three/rapier \
    three-stdlib \
    gsap

# Types for Three (dev dependency)
RUN pnpm add -D @types/three

# ---- Dev tooling ----
RUN pnpm add -D \
    @types/node \
    @types/react \
    @types/react-dom \
    typescript \
    prettier \
    prettier-plugin-tailwindcss \
    eslint-config-prettier

# Clean up create-next-app artifacts that can break fresh installs in snapshots
# IMPORTANT: Write a valid JavaScript config instead of renaming TypeScript file
# (TypeScript syntax like "import type { }" is not valid in .mjs files)
RUN rm -f pnpm-workspace.yaml next.config.ts && \
    echo '/** @type {import("next").NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;' > next.config.mjs

# Dev defaults
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000
CMD ["pnpm", "run", "dev"]
