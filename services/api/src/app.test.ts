import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, verifyTotp, currentTotp, newTotp } from './admin/mfa';
import { loadConfig } from './config';
import { senderProblem } from './mailer';
import { decodeCursor, encodeCursor } from './records/feed';

describe('config', () => {
  it('rejects invalid configuration without echoing secret values', () => {
    expect(() => loadConfig({ DATABASE_URL: 'nope', S3_SECRET_ACCESS_KEY: 'hunter2' })).toThrow(
      /Invalid configuration/,
    );
    try {
      loadConfig({ DATABASE_URL: 'nope', S3_SECRET_ACCESS_KEY: 'hunter2' });
    } catch (e) {
      expect(String(e)).not.toContain('hunter2');
    }
  });
});

describe('feed cursor', () => {
  it('round-trips and rejects garbage', () => {
    const at = new Date('2026-10-16T10:00:00Z');
    const id = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e';
    expect(decodeCursor(encodeCursor(at, id))).toEqual({ at: at.toISOString(), id });
    expect(() => decodeCursor('bm9wZQ')).toThrow();
  });
});

describe('admin mfa', () => {
  it('encrypts secrets and verifies codes', () => {
    const { base32, uri } = newTotp('owner@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\/ShootSpot%20Admin/);
    const stored = encryptSecret('k'.repeat(32), base32);
    expect(stored).not.toContain(base32);
    expect(decryptSecret('k'.repeat(32), stored)).toBe(base32);
    expect(() => decryptSecret('x'.repeat(32), stored)).toThrow();
    expect(verifyTotp(base32, currentTotp(base32))).toBe(true);
    expect(verifyTotp(base32, '000000')).toBe(currentTotp(base32) === '000000');
    expect(verifyTotp(base32, 'abc')).toBe(false);
  });
});

describe('mail sender', () => {
  it('flags free-mail senders a relay cannot authenticate', () => {
    expect(senderProblem('ShootSpot <someone@me.com>')).toMatch(/DMARC/);
    expect(senderProblem('x@Gmail.com')).toMatch(/DMARC/);
    expect(senderProblem('ShootSpot')).toMatch(/no email address/);
    expect(senderProblem('ShootSpot <no-reply@expose-u.com>')).toBeNull();
  });
});
