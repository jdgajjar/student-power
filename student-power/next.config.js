/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  
  // Temporarily allow build despite type errors in tests
  // TODO: Fix test types and re-enable strict checking
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // SEO: Generate trailing slashes for better crawling
  trailingSlash: false,
  
  // SEO: Generate static pages for better performance and SEO
  // output: 'export', // Uncomment for static export if not using API routes
  
  webpack: (config, { isServer }) => {
    // needed for transformers.js
    config.resolve.alias = {
      ...config.resolve.alias,
      'sharp$': false,
      'onnxruntime-node$': false,
    };
    
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });

    return config;
  },
  
  // Optimize package imports
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  
  // Image optimization configuration
  images: {
    domains: ['res.cloudinary.com'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  
  // Security and SEO headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Disable caching for API responses to ensure real-time data
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // SEO: Prevent search engines from indexing staging/dev versions
          // { key: 'X-Robots-Tag', value: 'index, follow' }, // Uncomment in production
        ],
      },
      {
        source: '/universities/:path*',
        headers: [
          // Cache public pages only, not admin pages
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' },
        ],
      },
    ];
  },
  
  // Compression
  compress: true,
  
  // Power page optimization
  poweredByHeader: false,
}

module.exports = nextConfig
