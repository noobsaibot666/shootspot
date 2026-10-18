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

  it('sends security headers and never lets private data be cached', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/v1/legal' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['access-control-allow-origin']).toBeUndefined(); // no CORS (D-23)
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

  it('store review account signs in with its fixed code, gets no email, and stays a member (D-34)', async () => {
    const app = { 'expo-origin': 'shootspot://', 'sec-fetch-mode': 'cors' };
    const sent = env.mailer.sent.length;
    const send = await env.app.inject({
      method: 'POST',
      url: '/api/auth/email-otp/send-verification-otp',
      headers: app,
      payload: { email: 'review@example.com', type: 'sign-in' },
    });
    expect(send.statusCode).toBe(200);
    expect(env.mailer.sent.length).toBe(sent);
    const wrong = await env.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email-otp',
      headers: app,
      payload: { email: 'review@example.com', otp: '111111' },
    });
    expect(wrong.statusCode).not.toBe(200);
    // A wrong guess spends an attempt; request the code again, as the app does.
    await env.app.inject({
      method: 'POST',
      url: '/api/auth/email-otp/send-verification-otp',
      headers: app,
      payload: { email: 'review@example.com', type: 'sign-in' },
    });
    const ok = await env.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email-otp',
      headers: app,
      payload: { email: 'review@example.com', otp: '246810' },
    });
    expect(ok.statusCode).toBe(200);
    const token = ok.headers['set-auth-token'] as string;
    const blocked = await env.app.inject({
      method: 'GET',
      url: '/admin/v1/summary',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(blocked.statusCode).toBe(403);
    // Everyone else still gets a random emailed code, never the review code.
    await signIn(env, 'notreview@example.com');
    expect(env.mailer.lastCodeFor('notreview@example.com')).not.toBe('246810');
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

  it('records gallery imports with the photo as pin source (D-28)', async () => {
    const headers = await member(env, 'importer@example.com');
    const body = draftBody({
      pin: { lat: 52.4934, lon: 13.4234, accuracyM: null, source: 'photo' },
      capture: {
        capturedAt: '2026-05-01T16:42:10.000Z',
        altitudeM: null,
        focalLength35mm: 26,
        headingDeg: null,
        origin: 'import',
      },
    });
    const res = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers,
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const row = (
      await env.pool.query('select pin_source, capture_origin from locations where id = $1', [
        res.json().recordId,
      ])
    ).rows[0];
    expect(row).toEqual({ pin_source: 'photo', capture_origin: 'import' });
    // Older clients that send no origin are camera captures.
    const legacy = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers,
      payload: draftBody(),
    });
    const origin = await env.pool.query('select capture_origin from locations where id = $1', [
      legacy.json().recordId,
    ]);
    expect(origin.rows[0].capture_origin).toBe('camera');
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
        'liked',
        'lon',
        'sun',
      ].sort(),
    );
    expect(item.liked).toBe(false);
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

describe('map pins', () => {
  it('returns anonymous pins inside the box only, with filters', async () => {
    const creator = await member(env, 'map-creator@example.com');
    const viewer = await member(env, 'map-viewer@example.com');
    const inside = await publishDirect(creator, {
      pin: { lat: 37.0194, lon: -7.9304, accuracyM: 5, source: 'gps' },
      short: {
        label: 'Faro marina',
        goodFor: ['seascape'],
        bestLight: ['golden_pm'],
        bearingDeg: 200,
      },
    });
    await publishDirect(creator, {
      pin: { lat: 40.2033, lon: -8.4103, accuracyM: 5, source: 'gps' },
    });
    const box = 'minLat=36.9&minLon=-8.1&maxLat=37.1&maxLon=-7.8';
    const res = await env.app.inject({ method: 'GET', url: `/v1/map?${box}`, headers: viewer });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.map((p: { id: string }) => p.id)).toEqual([inside]);
    expect(Object.keys(body.items[0]).sort()).toEqual(['id', 'label', 'lat', 'lon', 'thumb']);
    expect(JSON.stringify(body)).not.toContain('map-creator@example.com');
    const filtered = await env.app.inject({
      method: 'GET',
      url: `/v1/map?${box}&goodFor=portrait`,
      headers: viewer,
    });
    expect(filtered.json().items).toEqual([]);
    const bad = await env.app.inject({
      method: 'GET',
      url: '/v1/map?minLat=1&minLon=1&maxLat=0&maxLon=2',
      headers: viewer,
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('projects are private (D-09)', () => {
  it('the save sheet lists only my projects that contain the record', async () => {
    const me = await member(env, 'saver@example.com');
    const other = await member(env, 'other-saver@example.com');
    const rec = await publishDirect(me);
    const mine = (
      await env.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: me,
        payload: { name: 'Mine' },
      })
    ).json();
    const theirs = (
      await env.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: other,
        payload: { name: 'Theirs' },
      })
    ).json();
    await env.app.inject({
      method: 'POST',
      url: `/v1/projects/${mine.id}/items`,
      headers: me,
      payload: { recordId: rec },
    });
    await env.app.inject({
      method: 'POST',
      url: `/v1/projects/${theirs.id}/items`,
      headers: other,
      payload: { recordId: rec },
    });
    const res = await env.app.inject({
      method: 'GET',
      url: `/v1/records/${rec}/projects`,
      headers: me,
    });
    expect(res.json()).toEqual({ projectIds: [mine.id] });
  });

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

    // Remove is final: the photos are purged too.
    const remove = await env.app.inject({
      method: 'POST',
      url: `/admin/v1/records/${rec}/moderate`,
      headers: adminHeaders,
      payload: { action: 'remove', reason: 'Test content' },
    });
    expect(remove.statusCode).toBe(204);
    const media = await env.pool.query(`select state from media where location_id = $1`, [rec]);
    expect(media.rows.map((m) => m.state)).toEqual(['purged']);
  });
});

describe('private likes (D-29)', () => {
  it('likes are per member, private, idempotent and listed newest first', async () => {
    const creator = await member(env, 'likes-creator@example.com');
    const a = await member(env, 'likes-a@example.com');
    const b = await member(env, 'likes-b@example.com');
    const first = await publishDirect(creator);
    const second = await publishDirect(creator);

    for (const id of [first, second, second]) {
      const res = await env.app.inject({
        method: 'PUT',
        url: `/v1/records/${id}/like`,
        headers: a,
      });
      expect(res.statusCode).toBe(204);
    }
    const mine = (await env.app.inject({ method: 'GET', url: '/v1/me/likes', headers: a })).json();
    expect(mine.items.map((r: { id: string }) => r.id)).toEqual([second, first]);
    expect(mine.items.every((r: { liked: boolean }) => r.liked)).toBe(true);

    // Another member sees no trace of a's likes.
    const detailB = (
      await env.app.inject({ method: 'GET', url: `/v1/records/${first}`, headers: b })
    ).json();
    expect(detailB.liked).toBe(false);
    expect(JSON.stringify(detailB)).not.toMatch(/like_count|likes"/);
    const detailA = (
      await env.app.inject({ method: 'GET', url: `/v1/records/${first}`, headers: a })
    ).json();
    expect(detailA.liked).toBe(true);

    // Unlike, and unknown records are 404.
    await env.app.inject({ method: 'DELETE', url: `/v1/records/${first}/like`, headers: a });
    const after = (await env.app.inject({ method: 'GET', url: '/v1/me/likes', headers: a })).json();
    expect(after.items.map((r: { id: string }) => r.id)).toEqual([second]);
    const missing = await env.app.inject({
      method: 'PUT',
      url: `/v1/records/${crypto.randomUUID()}/like`,
      headers: a,
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('admin library and pilot metrics', () => {
  it('lists records without creator data and reports aggregate metrics', async () => {
    const { headers: adminHeaders } = await admin(env, 'library-admin@example.com');
    const m = await member(env, 'library-member@example.com');
    const created = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers: m,
      payload: draftBody({
        capture: {
          capturedAt: '2026-05-01T16:42:10.000Z',
          altitudeM: null,
          focalLength35mm: null,
          headingDeg: null,
          origin: 'import',
        },
      }),
    });
    const id = created.json().recordId;

    const lib = await env.app.inject({
      method: 'GET',
      url: '/admin/v1/records?status=processing',
      headers: adminHeaders,
    });
    expect(lib.statusCode).toBe(200);
    const item = lib.json().items.find((r: { id: string }) => r.id === id);
    expect(item).toMatchObject({ status: 'pending_media', origin: 'import', image: null });
    // Anonymity (D-06): the library never carries who created a record.
    expect(JSON.stringify(lib.json())).not.toMatch(/library-member|user_?id|creator/i);

    const metrics = await env.app.inject({
      method: 'GET',
      url: '/admin/v1/metrics?days=7',
      headers: adminHeaders,
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().records_created).toBeGreaterThanOrEqual(1);
    expect(metrics.json().imported).toBeGreaterThanOrEqual(1);

    // Members can't reach either.
    for (const url of ['/admin/v1/records', '/admin/v1/metrics']) {
      expect((await env.app.inject({ method: 'GET', url, headers: m })).statusCode).toBe(403);
    }
  });
});

describe('admin-managed tags (D-25)', () => {
  it('add, use, relabel and hide a tag without breaking existing records', async () => {
    const { headers: adminHeaders } = await admin(env, 'tags-admin@example.com');
    const m = await member(env, 'tags-member@example.com');
    const draft = (goodFor: string[]) =>
      draftBody({ short: { label: 'Rooftop', goodFor, bestLight: ['night'], bearingDeg: 90 } });

    // Unknown until added.
    const before = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers: m,
      payload: draft(['rooftop']),
    });
    expect(before.statusCode).toBe(400);
    expect(before.json().error).toBe('unknown_tag');

    const add = await env.app.inject({
      method: 'POST',
      url: '/admin/v1/vocabulary',
      headers: adminHeaders,
      payload: { kind: 'good_for', key: 'rooftop', label: 'Rooftop' },
    });
    expect(add.statusCode).toBe(201);
    const vocab = (await env.app.inject({ method: 'GET', url: '/v1/vocabulary' })).json();
    expect(vocab.goodFor.at(-1)).toEqual({ key: 'rooftop', label: 'Rooftop' });
    expect(vocab.bestLight.length).toBe(9);

    const ok = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers: m,
      payload: draft(['rooftop']),
    });
    expect(ok.statusCode).toBe(201);

    await env.app.inject({
      method: 'PATCH',
      url: '/admin/v1/vocabulary/good_for/rooftop',
      headers: adminHeaders,
      payload: { label: 'Rooftops & terraces', active: false },
    });
    const hidden = (await env.app.inject({ method: 'GET', url: '/v1/vocabulary' })).json();
    expect(hidden.goodFor.some((t: { key: string }) => t.key === 'rooftop')).toBe(false);
    const after = await env.app.inject({
      method: 'POST',
      url: '/v1/records',
      headers: m,
      payload: draft(['rooftop']),
    });
    expect(after.statusCode).toBe(400);
    // The record created while it was active keeps its key.
    const kept = await env.pool.query(`select good_for from locations where id = $1`, [
      ok.json().recordId,
    ]);
    expect(kept.rows[0].good_for).toEqual(['rooftop']);

    const list = (
      await env.app.inject({ method: 'GET', url: '/admin/v1/vocabulary', headers: adminHeaders })
    ).json();
    expect(list.items.find((t: { key: string }) => t.key === 'rooftop')).toMatchObject({
      active: false,
      used: 1,
      label: 'Rooftops & terraces',
    });
    // Members can't manage tags.
    expect(
      (await env.app.inject({ method: 'GET', url: '/admin/v1/vocabulary', headers: m })).statusCode,
    ).toBe(403);
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
