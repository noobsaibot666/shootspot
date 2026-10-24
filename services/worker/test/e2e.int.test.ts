import { admin, createTestEnv, draftBody, member, type TestEnv } from '@shootspot/api/testing';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config';
import { dataExportJob, deletionSweep, processMediaJob, type JobDeps } from '../src/jobs';
import { createWorkerStorage, type WorkerStorage } from '../src/storage';

let env: TestEnv;
let deps: JobDeps;

beforeAll(async () => {
  env = await createTestEnv();
  const config = loadWorkerConfig({
    DATABASE_URL: env.databaseUrl,
    S3_ENDPOINT: env.config.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: env.config.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.config.S3_SECRET_ACCESS_KEY,
    S3_BUCKET_QUARANTINE: env.config.S3_BUCKET_QUARANTINE,
    S3_BUCKET_PUBLIC: env.config.S3_BUCKET_PUBLIC,
  });
  deps = { pool: env.pool, storage: createWorkerStorage(config) };
});
afterAll(async () => {
  await env?.close();
});

async function jpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 140 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestCam' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 43/1 20/1' },
    })
    .toBuffer();
}

/** What the app does: create the draft, PUT the bytes to the presigned URL, confirm. */
async function upload(headers: { authorization: string }, body: Buffer, overrides = {}) {
  const created = (
    await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers,
      payload: draftBody(overrides),
    })
  ).json();
  const put = await fetch(created.upload.url, {
    method: 'PUT',
    headers: created.upload.headers,
    body: new Uint8Array(body),
  });
  expect(put.ok).toBe(true);
  const done = await env.app.inject({
    method: 'POST',
    url: `/v1/records/${created.recordId}/upload-complete`,
    headers,
  });
  expect(done.json().media.state).toBe('queued');
  return { recordId: created.recordId as string, mediaId: created.media.id as string };
}

describe('capture → publish → discover', () => {
  it('publishes a landscape upload with metadata-free derivatives', async () => {
    const creator = await member(env, 'creator@example.com');
    const viewer = await member(env, 'viewer@example.com');
    const { recordId, mediaId } = await upload(creator, await jpeg(3840, 2160));

    expect(await processMediaJob(deps, mediaId, { finalAttempt: false })).toEqual({
      outcome: 'published',
    });

    const status = (
      await env.app.inject({
        method: 'GET',
        url: `/v1/records/${recordId}/status`,
        headers: creator,
      })
    ).json();
    expect(status).toMatchObject({ status: 'published', media: { state: 'ready' } });

    const feed = (
      await env.app.inject({
        method: 'GET',
        url: '/v1/feed?lat=38.7139&lon=-9.1334',
        headers: viewer,
      })
    ).json();
    const item = feed.items.find((r: { id: string }) => r.id === recordId);
    expect(item.images).toMatchObject({ width: 2160, height: 1215 });

    const thumb = Buffer.from(await (await fetch(item.images.thumb)).arrayBuffer());
    const meta = await sharp(thumb).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 480 });
    expect(meta.exif).toBeUndefined();

    // Original is gone once derivatives exist.
    const media = (await env.pool.query('select original_key from media where id = $1', [mediaId]))
      .rows[0];
    await expect(deps.storage.get('quarantine', media.original_key)).rejects.toThrow();
  });

  it('rejects a portrait image and keeps the record private', async () => {
    const creator = await member(env, 'portrait@example.com');
    const { recordId, mediaId } = await upload(creator, await jpeg(2160, 3840));
    expect(await processMediaJob(deps, mediaId, { finalAttempt: false })).toEqual({
      outcome: 'rejected',
      reason: 'portrait',
    });
    const status = (
      await env.app.inject({
        method: 'GET',
        url: `/v1/records/${recordId}/status`,
        headers: creator,
      })
    ).json();
    expect(status).toEqual({
      recordId,
      status: 'rejected',
      media: { state: 'rejected', rejectReason: 'portrait' },
    });
    const viewer = await member(env, 'viewer2@example.com');
    expect(
      (await env.app.inject({ method: 'GET', url: `/v1/records/${recordId}`, headers: viewer }))
        .statusCode,
    ).toBe(404);
  });

  it('marks media failed after a storage outage, and an admin retry publishes it', async () => {
    const creator = await member(env, 'outage@example.com');
    const { recordId, mediaId } = await upload(creator, await jpeg(2400, 2400));
    const broken: WorkerStorage = {
      ...deps.storage,
      get: async () => Promise.reject(new Error('ECONNREFUSED s3')),
    };

    await expect(
      processMediaJob({ ...deps, storage: broken }, mediaId, { finalAttempt: false }),
    ).rejects.toThrow();
    expect(
      (await env.pool.query('select state from media where id = $1', [mediaId])).rows[0].state,
    ).toBe('queued');
    await expect(
      processMediaJob({ ...deps, storage: broken }, mediaId, { finalAttempt: true }),
    ).rejects.toThrow();
    const failed = (
      await env.pool.query('select state, last_error from media where id = $1', [mediaId])
    ).rows[0];
    expect(failed).toEqual({ state: 'failed', last_error: 'ECONNREFUSED s3' });

    const { headers: adminHeaders } = await admin(env, 'ops@example.com');
    const health = (
      await env.app.inject({ method: 'GET', url: '/admin/v1/uploads', headers: adminHeaders })
    ).json();
    expect(health.problems.some((p: { id: string }) => p.id === mediaId)).toBe(true);
    const retry = await env.app.inject({
      method: 'POST',
      url: `/admin/v1/media/${mediaId}/retry`,
      headers: adminHeaders,
    });
    expect(retry.statusCode).toBe(202);
    expect(await processMediaJob(deps, mediaId, { finalAttempt: false })).toEqual({
      outcome: 'published',
    });
    const status = (
      await env.app.inject({
        method: 'GET',
        url: `/v1/records/${recordId}/status`,
        headers: creator,
      })
    ).json();
    expect(status.status).toBe('published');
  });
});

describe('operational alerts', () => {
  it('reports problems once per 12 h and resets when they clear', async () => {
    const { findProblems, dueAlerts, alertText } = await import('../src/ops');
    await env.pool.query(`update pgmigrations set run_on = now() - interval '3 days'`);
    let problems = await findProblems(env.pool);
    expect(problems.map((p) => p.key)).toContain('backup_pg_dump');
    expect(alertText(problems).text).not.toMatch(/@|\d+\.\d{4,}/); // no emails, no coordinates
    const first = await dueAlerts(env.pool, problems);
    expect(first.map((p) => p.key)).toContain('backup_pg_dump');
    expect((await dueAlerts(env.pool, problems)).length).toBe(0); // de-duplicated

    await env.pool.query(
      `insert into ops_heartbeats (name, ok_at, detail) values ('pg_dump', now(), 'test')`,
    );
    problems = await findProblems(env.pool);
    expect(problems.map((p) => p.key)).not.toContain('backup_pg_dump');
    await dueAlerts(env.pool, problems);
    const left = await env.pool.query(`select key from ops_alerts where key = 'backup_pg_dump'`);
    expect(left.rowCount).toBe(0); // cleared, so a recurrence alerts immediately
  });
});

describe('account lifecycle', () => {
  it('exports the member data as JSON', async () => {
    const headers = await member(env, 'export@example.com', 'Exporter');
    await upload(headers, await jpeg(3840, 2160));
    const req = await env.app.inject({ method: 'POST', url: '/v1/me/exports', headers });
    expect(req.statusCode).toBe(202);
    await dataExportJob(deps, req.json().id);
    const list = (await env.app.inject({ method: 'GET', url: '/v1/me/exports', headers })).json();
    const archive = await (await fetch(list.items[0].downloadUrl)).json();
    expect(archive.account.email).toBe('export@example.com');
    expect(archive.profile.first_name).toBe('Exporter');
    expect(archive.records).toHaveLength(1);
    expect(archive.consents.map((c: { kind: string }) => c.kind)).toEqual(
      expect.arrayContaining(['terms', 'privacy', 'image_license', 'age_18']),
    );
  });

  it('deletion removes the person but keeps their records, anonymous', async () => {
    const leaving = await member(env, 'leaving@example.com', 'Leaving');
    const viewer = await member(env, 'stays@example.com');
    const { recordId, mediaId } = await upload(leaving, await jpeg(3840, 2160));
    await processMediaJob(deps, mediaId, { finalAttempt: false });
    const legal = (await env.app.inject({ method: 'GET', url: '/v1/legal' })).json();
    await env.app.inject({
      method: 'PATCH',
      url: `/v1/me/records/${recordId}`,
      headers: leaving,
      payload: { attributed: true, noticeVersion: legal.attribution_notice },
    });
    const before = (
      await env.app.inject({ method: 'GET', url: `/v1/records/${recordId}`, headers: viewer })
    ).json();
    expect(before.attribution.name).toBe('Leaving');

    await env.app.inject({ method: 'POST', url: '/v1/me/deletion', headers: leaving });
    await env.pool.query(
      `update account_deletions set execute_after = now() - interval '1 minute' where status = 'scheduled'`,
    );
    expect(await deletionSweep(deps)).toBe(1);

    expect(
      (await env.pool.query(`select 1 from auth_users where email = 'leaving@example.com'`))
        .rowCount,
    ).toBe(0);
    expect(
      (await env.pool.query('select 1 from record_ownership where location_id = $1', [recordId]))
        .rowCount,
    ).toBe(0);
    const consents = await env.pool.query(
      `select user_id from consents where kind = 'attribution_notice'`,
    );
    expect(consents.rows.every((c) => c.user_id === null)).toBe(true);
    const after = (
      await env.app.inject({ method: 'GET', url: `/v1/records/${recordId}`, headers: viewer })
    ).json();
    expect(after.attribution).toBeNull();
    expect(after.label).toBe(before.label);
    expect(
      (await env.app.inject({ method: 'GET', url: '/v1/me', headers: leaving })).statusCode,
    ).toBe(401);
  });

  it('deletion closes a request whose user was already removed', async () => {
    const gone = await member(env, 'gone@example.com');
    await env.app.inject({ method: 'POST', url: '/v1/me/deletion', headers: gone });
    await env.pool.query(`delete from auth_users where email = 'gone@example.com'`);

    expect(await deletionSweep(deps)).toBe(0);
    expect(
      (await env.pool.query(`select 1 from account_deletions where status = 'scheduled'`)).rowCount,
    ).toBe(0);
  });
});
