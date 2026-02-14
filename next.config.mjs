/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // TODO: Enable optimization once CDN is configured (Phase 4)
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatar.vercel.sh",
        pathname: "/**",
      },
    ],
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {},

  // Optimize barrel file imports for faster builds and smaller bundles
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
    ],
  },

  // Output optimization
  output: "standalone",

  // Compression
  compress: true,

  // Transpile packages that need it
  transpilePackages: ["@e2b/code-interpreter", "e2b"],

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://avatar.vercel.sh",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src 'self' https://*.e2b.dev https://*.e2b-echo.dev https://*.e2b.app",
              "connect-src 'self' https://*.supabase.co https://*.e2b.dev https://*.e2b.app wss://*.supabase.co",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
