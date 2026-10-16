import * as SecureStore from 'expo-secure-store';

/** API base URL, inlined at build time. On a phone this must be a LAN or public address. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000').replace(
  /\/$/,
  '',
);

/** The app identifies itself to the auth endpoints with its scheme (native apps send no Origin). */
const APP_HEADERS = { 'expo-origin': 'shootspot://' };
const TOKEN_KEY = 'shootspot.session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken(): Promise<string | null> {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function saveToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** JSON request to the member API (bearer token only, D-23). */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  if (res.status === 401 && token) onUnauthorized?.();
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {}
    throw new ApiError(res.status, code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Passwordless sign-in (ADR 0005). */
export const auth = {
  async sendCode(email: string) {
    const res = await fetch(`${API_URL}/api/auth/email-otp/send-verification-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...APP_HEADERS },
      body: JSON.stringify({ email, type: 'sign-in' }),
    }).catch(() => null);
    if (!res) throw new ApiError(0, 'offline');
    if (!res.ok)
      throw new ApiError(res.status, res.status === 429 ? 'rate_limited' : 'send_failed');
  },
  async verifyCode(email: string, otp: string) {
    const res = await fetch(`${API_URL}/api/auth/sign-in/email-otp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...APP_HEADERS },
      body: JSON.stringify({ email, otp }),
    }).catch(() => null);
    if (!res) throw new ApiError(0, 'offline');
    const issued = res.headers.get('set-auth-token');
    if (!res.ok || !issued)
      throw new ApiError(res.status, res.status === 429 ? 'rate_limited' : 'invalid_code');
    await saveToken(issued);
  },
  async signOut() {
    if (token) {
      await fetch(`${API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...APP_HEADERS,
        },
        body: '{}',
      }).catch(() => {});
    }
    await saveToken(null);
  },
};
