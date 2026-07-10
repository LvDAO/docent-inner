const internalApiHost = (
  process.env.DOCENT_INTERNAL_API_HOST ||
  process.env.NEXT_PUBLIC_INTERNAL_API_HOST ||
  process.env.NEXT_PUBLIC_API_HOST ||
  'http://localhost:8888'
).replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/rest/:path*',
        destination: `${internalApiHost}/rest/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/sample',
        destination:
          'https://docent.transluce.org/dashboard/8831255a-249e-46cc-a600-c27c3d3cbd28?rubricId=e32d434f-168b-4708-af77-095a936ccaf0',
        permanent: false,
      },
      {
        source: '/(.*)',
        has: [
          {
            type: 'host',
            value: 'docent-alpha.transluce.org',
          },
        ],
        destination: 'https://docent.transluce.org/$1',
        permanent: true,
      },
    ];
  },
  experimental: {
    // Inspect imports can be large, and SSE jobs can remain idle while workers run.
    proxyClientMaxBodySize: '50mb',
    proxyTimeout: 86_400_000,
  },
  // Enable standalone output for Docker production builds
  output: 'standalone',
};

export default nextConfig;
