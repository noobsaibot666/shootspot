import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy to the API (D-44). Only these paths go through; everything else of the API
 * (the app's /v1, administration) is unreachable from this origin. The API enforces the same rules
 * again for the member web origin (services/api/src/app.ts).
 */
export const AUTH_PATHS = [
  '/api/auth/sign-in/email',
  '/api/auth/get-session',
  '/api/auth/sign-out',
];
export const WEB_PREFIX = '/web/v1/';

export function isAllowed(pathname: string): boolean {
  return AUTH_PATHS.includes(pathname) || pathname.startsWith(WEB_PREFIX);
}

/** Request headers the API needs; nothing else of the browser's request is passed on. */
const FORWARD = [
  'accept',
  'content-type',
  'cookie',
  'origin',
  'user-agent',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
  // Set by Cloudflare at the tunnel: the API's per-IP sign-in and search limits use it.
  'cf-connecting-ip',
];

/**
 * The API's cookies follow the admin web, which runs on plain HTTP on the LAN, so they come
 * without Secure. This origin is HTTPS behind the tunnel: mark them Secure here.
 */
export function secureCookie(cookie: string, secure: boolean): string {
  if (!secure || /;\s*secure\s*(;|$)/i.test(cookie)) return cookie;
  return `${cookie}; Secure`;
}

function isHttps(req: NextRequest): boolean {
  if (process.env.WEB_SECURE_COOKIES === 'true') return true;
  return req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

export async function proxy(req: NextRequest): Promise<Response> {
  const { pathname, search } = req.nextUrl;
  if (!isAllowed(pathname)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:4000';
  const headers = new Headers();
  for (const name of FORWARD) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(`${apiUrl}${pathname}${search}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 502 });
  }
  const out = new Headers();
  for (const name of ['content-type', 'cache-control']) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  const secure = isHttps(req);
  for (const cookie of upstream.headers.getSetCookie()) {
    out.append('set-cookie', secureCookie(cookie, secure));
  }
  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: out });
}
