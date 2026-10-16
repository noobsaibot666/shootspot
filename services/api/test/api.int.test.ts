import { currentTotp } from '../src/admin/mfa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  admin,
  browserSignIn,
  createTestEnv,
  draftBody,
  grantOwner,
  member,
  signIn,
  type TestEnv,
} from '../src/testing';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env?.close();
});

/** Publish a record without the worker: mark media ready directly (the worker has its own e2e). */
async function publishDirect(headers: { authorization: string }, overrides = {}) {
  const res = await env.app.inject({
    method: 'POST',
    url: '/v1/records',
    headers,
    payload: draftBody(overrides),
  });
  expect(res.statusCode).toBe(201);
  const { recordId, media } = res.json();
  await env.pool.query(
    `update media set state = 'ready', width = 2160, height = 1215, framing = '16:9' where id = $1`,
    [media.id],
  );
  await env.pool.query(
    `update locations set status = 'published', published_at = now() where id = $1`,
    [recordId],
  );
  return recordId as string;
}

describe('health', () => {
  it('reports ready with real db and storage', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/ready' });
    expect(res.json()).toEqual({ status: 'ok', checks: { db: true, storage: true } });
  });
});

describe('auth and onboarding', () => {
  it('requires sign-in for everything except legal and health (D-05)', async () => {
    for (const url of ['/v1/feed', '/v1/me', '/v1/projects', '/admin/v1/summary']) {
      expect((await env.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });

  it('refuses code requests without a trusted origin (no email bombing from other sites)', async () => {
    const payload = { email: 'victim@example.com', type: 'sign-in' };
    const url = '/api/auth/email-otp/send-verification-otp';
    // A page on another site making the victim's browser call us (browsers send Fetch Metadata).
    const crossSite = {
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'cors',
    };
    expect(
      (await env.app.inject({ method: 'POST', url, payload, headers: crossSite })).statusCode,
    ).toBe(403);
    // A browser request that hides its origin.
    const hidden = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' };
    expect(
      (await env.app.inject({ method: 'POST', url, payload, headers: hidden })).statusCode,
    ).toBe(403);
    // The admin web (trusted origin) and the app (expo-origin) are accepted.
    const admin = {
      origin: 'http://localhost:3000',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
    };
    expect(
      (await env.app.inject({ method: 'POST', url, payload, headers: admin })).statusCode,
    ).toBe(200);
    const app = { 'expo-origin': 'shootspot://', 'sec-fetch-mode': 'cors' };
    expect((await env.app.inject({ method: 'POST', url, payload, headers: app })).statusCode).toBe(
      200,
    );
    // Only the app's request sends mail: on the admin web, a non-owner gets "success" but no email.
    expect(env.mailer.sent.filter((m) => m.to === 'victim@example.com')).toHaveLength(1);
  });

  it('signs in with an emailed code; no passwords exist', async () => {
    const headers = await signIn(env, 'ana@example.com');
    const me = (await env.app.inject({ method: 'GET', url: '/v1/me', headers })).json();
    expect(me.user.email).toBe('ana@example.com');
    expect(me.user.role).toBe('member');
    expect(me.onboarded).toBe(false);
    const pw = await env.pool.query(
      `select count(*)::int as n from auth_accounts where password is not null`,
    );
    expect(pw.rows[0].n).toBe(0);
  });

  it('blocks publishing until onboarding, and rejects outdated legal versions', async () => {
    const headers = await signIn(env, 'bruno@example.com');
    const blocked = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers,
      payload: draftBody(),
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error).toBe('onboarding_required');
    const outdated = await env.app.inject({
      method: 'POST',
      url: '/v1/me/onboarding',
      headers,
      payload: {
        ageConfirmed16: true,
        accept: { terms: 'old', privacy: 'old', image_license: 'old' },
        firstName: 'B',
      },
    });
    expect(outdated.statusCode).toBe(409);
    const underage = await env.app.inject({
      method: 'POST',
      url: '/v1/me/onboarding',
      headers,
      payload: { ageConfirmed16: false, accept: {}, firstName: 'B' },
    });
    expect(underage.statusCode).toBe(400);
  });
});

describe('records', () => {
  it('creates a record with an upload URL and is idempotent on draftId', async () => {
    const headers = await member(env, 'carla@example.com');
    const body = draftBody();
    const first = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers,
      payload: body,
    });
    expect(first.statusCode).toBe(201);
    const created = first.json();
    expect(created.upload.method).toBe('PUT');
    expect(created.upload.url).toContain('X-Amz-Signature');
    const again = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers,
      payload: body,
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().recordId).toBe(created.recordId);
    const count = await env.pool.query('select count(*)::int as n from locations');
    expect(count.rows[0].n).toBeGreaterThanOrEqual(1);

    // Someone else reusing the draft id is refused.
    const other = await member(env, 'dario@example.com');
    const stolen = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers: other,
      payload: body,
    });
    expect(stolen.statusCode).toBe(409);
  });

  it('refuses upload-complete before the object exists, then queues processing', async () => {
    const headers = await member(env, 'eva@example.com');
    const created = (
      await env.app.inject({ method: 'POST', url: '/v1/records', headers, payload: draftBody() })
    ).json();
    const early = await env.app.inject({
      method: 'POST',
      url: `/v1/records/${created.recordId}/upload-complete`,
      headers,
    });
    expect(early.statusCode).toBe(409);
    const put = await fetch(created.upload.url, {
      method: 'PUT',
      headers: created.upload.headers,
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    expect(put.ok).toBe(true);
    // Mobile HTTP clients often send a JSON content-type on body-less POSTs; that must work.
    const done = await env.app.inject({
      method: 'POST',
      url: `/v1/records/${created.recordId}/upload-complete`,
      headers: { ...headers, 'content-type': 'application/json' },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'processing', media: { state: 'queued' } });
    expect(env.queue.sent.at(-1)).toEqual({
      queue: 'process-media',
      data: { mediaId: created.media.id },
    });
  });

  it('validates drafts (no portrait framing, valid tags, bearing range)', async () => {
    const headers = await member(env, 'filipa@example.com');
    for (const bad of [
      draftBody({ framing: '9:16' }),
      draftBody({
        short: { label: 'x', goodFor: ['selfie'], bestLight: ['night'], bearingDeg: 10 },
      }),
      draftBody({
        short: { label: 'x', goodFor: ['street'], bestLight: ['night'], bearingDeg: 360 },
      }),
    ]) {
      expect(
        (await env.app.inject({ method: 'POST', url: '/v1/records', headers, payload: bad }))
          .statusCode,
      ).toBe(400);
    }
  });
});

describe('anonymity contract (D-06)', () => {
  it('public payloads carry no creator data unless attribution is on', async () => {
    const creator = await member(env, 'gil@example.com', 'Gil');
    const viewer = await member(env, 'helena@example.com');
    const id = await publishDirect(creator);

    const feed = (
      await env.app.inject({
        method: 'GET',
        url: '/v1/feed?lat=38.7139&lon=-9.1334&radiusKm=5',
        headers: viewer,
      })
    ).json();
    const item = feed.items.find((r: { id: string }) => r.id === id);
    expect(Object.keys(item).sort()).toEqual(
      [
        'accuracyM',
        'advanced',
        'altitudeM',
        'attribution',
        'bearingDeg',
        'bestLight',
        'bestLightNote',
        'capturedAt',
        'distanceM',
        'focalLength35mm',
        'framing',
        'goodFor',
        'goodForNote',
        'id',
        'images',
        'label',
        'lat',
        'lon',
        'sun',
      ].sort(),
    );
    expect(item.attribution).toBeNull();
    const raw = JSON.stringify(feed);
    expect(raw).not.toContain('gil@example.com');
    const creatorId = (
      await env.pool.query(`select id from auth_users where email = 'gil@example.com'`)
    ).rows[0].id;
    expect(raw).not.toContain(creatorId);
    expect(item.sun.azimuthDeg).toBeGreaterThan(200); // sunset in Lisbon, mid-October
    expect(item.distanceM).toBeLessThan(50);

    // Opt in: needs the notice, then the name shows.
    const noNotice = await env.app.inject({
      method: 'PATCH',
      url: `/v1/me/records/${id}`,
      headers: creator,
      payload: { attributed: true },
    });
    expect(noNotice.statusCode).toBe(409);
    const legal = (await env.app.inject({ method: 'GET', url: '/v1/legal' })).json();
    const on = await env.app.inject({
      method: 'PATCH',
      url: `/v1/me/records/${id}`,
      headers: creator,
      payload: { attributed: true, noticeVersion: legal.attribution_notice },
    });
    expect(on.statusCode).toBe(204);
    const detail = (
      await env.app.inject({ method: 'GET', url: `/v1/records/${id}`, headers: viewer })
    ).json();
    expect(detail.attribution).toEqual({ name: 'Gil', portfolioUrl: null, socialHandle: null });
  });

  it('feed filters by radius, tags and paginates without duplicates', async () => {
    const a = await member(env, 'ines@example.com');
    const viewer = await member(env, 'joao@example.com');
    for (let i = 0; i < 5; i++)
      await publishDirect(a, {
        pin: { lat: 41.1496 + i * 0.001, lon: -8.611, accuracyM: 5, source: 'gps' },
      });
    await publishDirect(a, {
      pin: { lat: 41.15, lon: -8.61, accuracyM: 5, source: 'manual' },
      short: { label: 'Night spot', goodFor: ['night_astro'], bestLight: ['night'], bearingDeg: 0 },
    });
    const near = '/v1/feed?lat=41.1496&lon=-8.611&radiusKm=2';
    const tagged = (
      await env.app.inject({ method: 'GET', url: `${near}&goodFor=night_astro`, headers: viewer })
    ).json();
    expect(tagged.items.map((r: { label: string }) => r.label)).toEqual(['Night spot']);
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const page: { items: { id: string }[]; nextCursor: string | null } = (
        await env.app.inject({
          method: 'GET',
          url: `${near}&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
          headers: viewer,
        })
      ).json();
      for (const r of page.items) {
        expect(seen.has(r.id)).toBe(false);
        seen.add(r.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.size).toBe(6);
    const lisbon = (
      await env.app.inject({
        method: 'GET',
        url: '/v1/feed?lat=38.7139&lon=-9.1334&radiusKm=2',
        headers: viewer,
      })
    ).json();
    expect(lisbon.items.every((r: { lat: number }) => r.lat < 39)).toBe(true);
  });
});

describe('projects are private (D-09)', () => {
  it('only the owner can see or change a project', async () => {
    const owner = await member(env, 'kika@example.com');
    const stranger = await member(env, 'luis@example.com');
    const rec = await publishDirect(owner);
    const project = (
      await env.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: owner,
        payload: { name: 'Lisbon shoot' },
      })
    ).json();
    expect(
      (
        await env.app.inject({
          method: 'POST',
          url: `/v1/projects/${project.id}/items`,
          headers: owner,
          payload: { recordId: rec },
        })
      ).statusCode,
    ).toBe(204);
    const items = (
      await env.app.inject({
        method: 'GET',
        url: `/v1/projects/${project.id}/items`,
        headers: owner,
      })
    ).json();
    expect(items.items[0]).toMatchObject({ recordId: rec, available: true });

    for (const [method, url] of [
      ['GET', `/v1/projects/${project.id}/items`],
      ['PATCH', `/v1/projects/${project.id}`],
      ['DELETE', `/v1/projects/${project.id}`],
    ] as const) {
      const res = await env.app.inject({
        method,
        url,
        headers: stranger,
        payload: method === 'PATCH' ? { name: 'x' } : undefined,
      });
      expect(res.statusCode).toBe(404);
    }
    const strangers = (
      await env.app.inject({ method: 'GET', url: '/v1/projects', headers: stranger })
    ).json();
    expect(strangers.items).toEqual([]);

    // A record removed later shows as unavailable instead of vanishing.
    await env.pool.query(`update locations set status = 'hidden' where id = $1`, [rec]);
    const after = (
      await env.app.inject({
        method: 'GET',
        url: `/v1/projects/${project.id}/items`,
        headers: owner,
      })
    ).json();
    expect(after.items[0]).toEqual({ recordId: rec, available: false, record: null });
  });
});

describe('reports', () => {
  it('accepts one open report per member per record', async () => {
    const owner = await member(env, 'marta@example.com');
    const reporter = await member(env, 'nuno@example.com');
    const rec = await publishDirect(owner);
    const url = `/v1/records/${rec}/reports`;
    expect(
      (
        await env.app.inject({
          method: 'POST',
          url,
          headers: reporter,
          payload: { reason: 'private_property' },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await env.app.inject({
          method: 'POST',
          url,
          headers: reporter,
          payload: { reason: 'other' },
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe('admin (server-side role + MFA)', () => {
  it('the admin web never creates accounts or signs in members', async () => {
    const browser = {
      origin: ADMIN_ORIGIN,
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
    };
    const sent = env.mailer.sent.length;
    const send = await env.app.inject({
      method: 'POST',
      url: '/api/auth/email-otp/send-verification-otp',
      headers: browser,
      payload: { email: 'stranger@example.com', type: 'sign-in' },
    });
    expect(send.statusCode).toBe(200); // same answer as for an owner: reveals nothing
    expect(env.mailer.sent.length).toBe(sent); // …but no email goes out
    const existing = await member(env, 'olga@example.com');
    expect(existing.authorization).toBeTruthy();
    const signIn = await env.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email-otp',
      headers: browser,
      payload: { email: 'olga@example.com', otp: '123456' },
    });
    expect(signIn.statusCode).toBe(401);
    const users = await env.pool.query(
      `select 1 from auth_users where email = 'stranger@example.com'`,
    );
    expect(users.rowCount).toBe(0);
  });

  it('keeps the two clients apart: app tokens never reach admin, web sessions never reach /v1', async () => {
    const plain = await member(env, 'pia@example.com');
    const asApp = await env.app.inject({ method: 'GET', url: '/admin/v1/summary', headers: plain });
    expect(asApp.statusCode).toBe(403);
    expect(asApp.json().error).toBe('admin_web_only');

    const { headers: web } = await admin(env, 'paulo@example.com');
    expect(
      (await env.app.inject({ method: 'GET', url: '/v1/feed', headers: web })).statusCode,
    ).toBe(401);
    expect((await env.app.inject({ method: 'GET', url: '/v1/me', headers: web })).statusCode).toBe(
      401,
    );
    // The owner's own app token is just a member token: no admin access through the app.
    const ownerApp = await signIn(env, 'paulo@example.com');
    const res = await env.app.inject({
      method: 'GET',
      url: '/admin/v1/summary',
      headers: ownerApp,
    });
    expect(res.statusCode).toBe(403);
  });

  it('requires a verified MFA session even for owners', async () => {
    await grantOwner(env, 'quica@example.com');
    const web = await browserSignIn(env, 'quica@example.com');
    const res = await env.app.inject({ method: 'GET', url: '/admin/v1/summary', headers: web });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('mfa_required');
  });

  it('MFA is bound to the session and codes cannot be replayed', async () => {
    const { headers, secret } = await admin(env, 'quim@example.com');
    expect(
      (await env.app.inject({ method: 'GET', url: '/admin/v1/summary', headers })).statusCode,
    ).toBe(200);
    // The code just used cannot be used again.
    const replay = await env.app.inject({
      method: 'POST',
      url: '/admin/v1/mfa/verify',
      headers,
      payload: { code: currentTotp(secret) },
    });
    expect(replay.statusCode).toBe(401);
    // A second session of the same owner is not verified until it passes TOTP itself.
    const second = await browserSignIn(env, 'quim@example.com');
    expect(
      (await env.app.inject({ method: 'GET', url: '/admin/v1/summary', headers: second }))
        .statusCode,
    ).toBe(403);
    // Re-enrolment is refused once confirmed.
    expect(
      (await env.app.inject({ method: 'POST', url: '/admin/v1/mfa/enroll', headers })).statusCode,
    ).toBe(409);
  });

  it('moderation hides a reported record from the feed and is audited', async () => {
    const { headers: adminHeaders } = await admin(env, 'rita@example.com');
    const owner = await member(env, 'sara@example.com');
    const viewer = await member(env, 'tiago@example.com');
    const rec = await publishDirect(owner);
    await env.app.inject({
      method: 'POST',
      url: `/v1/records/${rec}/reports`,
      headers: viewer,
      payload: { reason: 'unsafe_access' },
    });

    const queue = (
      await env.app.inject({ method: 'GET', url: '/admin/v1/reports', headers: adminHeaders })
    ).json();
    const report = queue.items.find((r: { record: { id: string } }) => r.record.id === rec);
    expect(report.reason).toBe('unsafe_access');

    const noReason = await env.app.inject({
      method: 'POST',
      url: `/admin/v1/records/${rec}/moderate`,
      headers: adminHeaders,
      payload: { action: 'hide' },
    });
    expect(noReason.statusCode).toBe(400);
    const hide = await env.app.inject({
      method: 'POST',
      url: `/admin/v1/records/${rec}/moderate`,
      headers: adminHeaders,
      payload: { action: 'hide', reason: 'Access through private land' },
    });
    expect(hide.statusCode).toBe(204);
    await env.app.inject({
      method: 'POST',
      url: `/admin/v1/reports/${report.id}/resolve`,
      headers: adminHeaders,
      payload: { outcome: 'actioned' },
    });

    const feed = (await env.app.inject({ method: 'GET', url: '/v1/feed', headers: viewer })).json();
    expect(feed.items.some((r: { id: string }) => r.id === rec)).toBe(false);
    expect(
      (await env.app.inject({ method: 'GET', url: `/v1/records/${rec}`, headers: viewer }))
        .statusCode,
    ).toBe(404);

    const detail = (
      await env.app.inject({
        method: 'GET',
        url: `/admin/v1/records/${rec}`,
        headers: adminHeaders,
      })
    ).json();
    expect(detail.creator_email).toBe('sara@example.com');
    const auditLog = (
      await env.app.inject({ method: 'GET', url: '/admin/v1/audit', headers: adminHeaders })
    ).json();
    const actions = auditLog.items
      .filter((e: { target_id: string }) => e.target_id === rec)
      .map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['record.hide', 'record.view_creator']));
  });
});

describe('account lifecycle', () => {
  it('schedules deletion after the grace period and can cancel it', async () => {
    const headers = await member(env, 'ulisses@example.com');
    const res = await env.app.inject({ method: 'POST', url: '/v1/me/deletion', headers });
    expect(res.statusCode).toBe(202);
    const days = (Date.parse(res.json().scheduledFor) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(
      (await env.app.inject({ method: 'GET', url: '/v1/me', headers })).json().deletionScheduledFor,
    ).not.toBeNull();
    expect(
      (await env.app.inject({ method: 'DELETE', url: '/v1/me/deletion', headers })).statusCode,
    ).toBe(204);
    expect(
      (await env.app.inject({ method: 'GET', url: '/v1/me', headers })).json().deletionScheduledFor,
    ).toBeNull();
  });
});
