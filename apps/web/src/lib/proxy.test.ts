import { describe, expect, it } from 'vitest';
import { isAllowed, secureCookie } from './proxy';

describe('web proxy', () => {
  it('forwards only sign-in, session, sign-out and the read-only web routes', () => {
    expect(isAllowed('/api/auth/sign-in/email')).toBe(true);
    expect(isAllowed('/api/auth/get-session')).toBe(true);
    expect(isAllowed('/api/auth/sign-out')).toBe(true);
    expect(isAllowed('/web/v1/feed')).toBe(true);
    expect(isAllowed('/api/auth/sign-up/email')).toBe(false);
    expect(isAllowed('/api/auth/email-otp/send-verification-otp')).toBe(false);
    expect(isAllowed('/v1/feed')).toBe(false);
    expect(isAllowed('/admin/v1/summary')).toBe(false);
    expect(isAllowed('/web/v10/feed')).toBe(false);
  });

  it('marks cookies Secure on HTTPS, once', () => {
    const c = 'shootspot.session_token=abc; Path=/; HttpOnly; SameSite=Lax';
    expect(secureCookie(c, false)).toBe(c);
    expect(secureCookie(c, true)).toBe(`${c}; Secure`);
    expect(secureCookie(`${c}; Secure`, true)).toBe(`${c}; Secure`);
  });
});
