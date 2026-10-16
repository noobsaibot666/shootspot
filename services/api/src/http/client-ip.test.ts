import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';

describe('clientIp (rate-limit key)', () => {
  it('ignores client-controlled forwarded headers by default', () => {
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '192.168.178.20', undefined)).toBe(
      '192.168.178.20',
    );
  });

  it('uses only the configured proxy header, and only when it holds an IP', () => {
    const h = { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' };
    expect(clientIp(h, '172.18.0.5', 'cf-connecting-ip')).toBe('203.0.113.7');
    expect(clientIp({ 'cf-connecting-ip': 'not-an-ip' }, '172.18.0.5', 'cf-connecting-ip')).toBe(
      '172.18.0.5',
    );
    expect(clientIp({}, '172.18.0.5', 'CF-Connecting-IP')).toBe('172.18.0.5');
  });
});
