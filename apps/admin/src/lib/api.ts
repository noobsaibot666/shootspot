/** Same-origin calls (proxied to the API by next.config rewrites). Cookies carry the session. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    let code = 'error';
    try {
      code = ((await res.json()) as { error?: string; code?: string }).error ?? code;
    } catch {}
    throw new ApiError(res.status, code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const auth = {
  sendCode: (email: string) =>
    api('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: { email, type: 'sign-in' },
    }),
  signIn: (email: string, otp: string) =>
    api('/api/auth/sign-in/email-otp', { method: 'POST', body: { email, otp } }),
  session: () => api<{ user: { email: string; role?: string } } | null>('/api/auth/get-session'),
  signOut: () => api('/api/auth/sign-out', { method: 'POST', body: {} }),
};

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
