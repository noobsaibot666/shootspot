import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadConfig } from './config';

const okStorage = { ping: async () => {}, ensureBuckets: async () => {} };

describe('api', () => {
  it('reports liveness', async () => {
    const app = buildApp({ pingDb: async () => {}, storage: okStorage });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('reports ready when dependencies answer', async () => {
    const app = buildApp({ pingDb: async () => {}, storage: okStorage });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
  });

  it('returns 503 without leaking error details when a dependency fails', async () => {
    const app = buildApp({
      pingDb: async () => {
        throw new Error('password authentication failed for user "shootspot"');
      },
      storage: okStorage,
    });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable', checks: { db: false, storage: true } });
    expect(res.body).not.toContain('password');
  });

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
