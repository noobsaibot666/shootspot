import type { Page, Vocabulary, WebRecord } from '@shootspot/shared';

/** Same-origin calls through src/lib/proxy.ts. The session cookie carries the sign-in. */
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
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'offline');
  }
  if (!res.ok) {
    let code = 'error';
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      code = body.error ?? body.code ?? code;
    } catch {}
    throw new ApiError(res.status, code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function downloadExport(path: string, filename: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'offline');
  }
  if (!res.ok) {
    let code = 'error';
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      code = body.error ?? body.code ?? code;
    } catch {}
    throw new ApiError(res.status, code);
  }
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const web = {
  me: () => api<{ email: string }>('/web/v1/me'),
  vocabulary: () => api<Vocabulary>('/web/v1/vocabulary'),
  feed: (query: string, signal?: AbortSignal) =>
    api<Page<WebRecord>>(`/web/v1/feed?${query}`, { signal }),
  record: (id: string) => api<WebRecord>(`/web/v1/records/${encodeURIComponent(id)}`),
};

export const auth = {
  signIn: (email: string, password: string) =>
    api('/api/auth/sign-in/email', { method: 'POST', body: { email, password } }),
  signOut: () => api('/api/auth/sign-out', { method: 'POST', body: {} }),
};
