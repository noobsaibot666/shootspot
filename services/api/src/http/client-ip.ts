import { isIP } from 'node:net';

/**
 * The one place that decides a request's client IP, for every rate limit (Fastify and Better
 * Auth). Forwarded headers are client-controlled, so none is trusted by default: the TCP peer
 * address is used. Only behind a proxy that overwrites a header itself (Cloudflare's
 * cf-connecting-ip via the tunnel) is that header used, via CLIENT_IP_HEADER (security review F3).
 */
export function clientIp(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | undefined,
  trustedHeader: string | undefined,
): string {
  if (trustedHeader) {
    const raw = headers[trustedHeader.toLowerCase()];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
    if (value && isIP(value)) return value;
  }
  return socketAddress ?? 'unknown';
}

/** Internal header carrying clientIp() into Better Auth; any client-sent value is overwritten. */
export const INTERNAL_IP_HEADER = 'x-shootspot-client-ip';
