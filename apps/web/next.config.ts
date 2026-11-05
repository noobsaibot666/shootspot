import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Member web gallery (D-44). A thin, read-only client: every decision happens in the API. Its own
 * route handlers (src/lib/proxy.ts) forward only /api/auth and /web/v1, so the session cookie stays
 * first-party on this origin and nothing else of the API is reachable through it.
 */
const config: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  transpilePackages: ['@shootspot/shared'],
  // Monorepo: trace dependencies from the repo root so the standalone server is complete.
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Photos are presigned URLs on the media host; never leak them in a Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default config;
