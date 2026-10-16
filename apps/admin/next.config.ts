import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * The admin web is a thin client. Every authorization decision happens in the API; this app only
 * proxies /api/auth and /admin/v1 to it, so session cookies stay first-party on the admin origin.
 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

const config: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  // Monorepo: trace dependencies from the repo root so the standalone server is complete.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  async rewrites() {
    return [
      { source: '/api/auth/:path*', destination: `${API_URL}/api/auth/:path*` },
      { source: '/admin/v1/:path*', destination: `${API_URL}/admin/v1/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
