import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';

/**
 * Admin TOTP (ADR 0005). Secrets are stored encrypted (AES-256-GCM) with a key derived from
 * AUTH_SECRET via HKDF, so a database dump alone does not reveal them.
 */

function key(authSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', authSecret, 'shootspot', 'admin-totp-v1', 32));
}

export function encryptSecret(authSecret: string, base32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(authSecret), iv);
  const data = Buffer.concat([cipher.update(base32, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(authSecret: string, stored: string): string {
  const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64url'));
  if (!iv || !tag || !data) throw new Error('corrupt secret');
  const decipher = createDecipheriv('aes-256-gcm', key(authSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function newTotp(email: string): { base32: string; uri: string } {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: 'ShootSpot Admin', label: email, secret, digits: 6, period: 30 });
  return { base32: secret.base32, uri: totp.toString() };
}

/** Accepts the current code and one period either side (clock drift). */
export function verifyTotp(base32: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const totp = new TOTP({ secret: Secret.fromBase32(base32), digits: 6, period: 30 });
  return totp.validate({ token, window: 1 }) !== null;
}

/** For tests: the code a device would show now. */
export function currentTotp(base32: string): string {
  return new TOTP({ secret: Secret.fromBase32(base32), digits: 6, period: 30 }).generate();
}
