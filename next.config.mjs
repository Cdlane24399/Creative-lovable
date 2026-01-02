/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
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
}

export default nextConfig
