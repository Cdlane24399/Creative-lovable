/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // TODO: Enable once type errors are fixed (Phase 6.1)
    ignoreBuildErrors: true,
  },
  images: {
    // TODO: Enable optimization once CDN is configured (Phase 4)
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatar.vercel.sh',
        pathname: '/**',
      },
    ],
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {},

  // Output optimization
  output: 'standalone',

  // Compression
  compress: true,

  // Transpile packages that need it
  transpilePackages: ['@e2b/code-interpreter', 'e2b'],

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
