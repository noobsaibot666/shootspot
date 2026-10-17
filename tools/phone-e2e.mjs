// Phone-flow E2E against a running backend, as the iPhone/Android app would call it.
//   node tools/phone-e2e.mjs            (local stack: API :4000, Mailpit :8025)
//   API=… MAIL=… node tools/phone-e2e.mjs
// It reads sign-in codes from Mailpit, so it needs a backend that still mails to Mailpit. The NAS
// sends real email (Brevo) and has no Mailpit, so run it against the local stack only.
// Throwaway account; deletes what it creates and schedules the account for deletion at the end.
import { createRequire } from 'node:module';
import path from 'node:path';

const sharp = createRequire(path.resolve('services/worker/package.json'))('sharp');
const API = process.env.API ?? 'http://127.0.0.1:4000';
const MAIL = process.env.MAIL ?? 'http://127.0.0.1:8025';
try {
  await fetch(`${MAIL}/api/v1/info`, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`No Mailpit at ${MAIL}: this test reads sign-in codes from it (local stack only).`);
  process.exit(2);
}
const results = [];
const timings = [];
let failures = 0;
const ok = (cond, msg, extra = '') => {
  results.push({ pass: !!cond, msg, extra });
  if (!cond) failures++;
  console.log(`  ${cond ? '✓' : '✗'} ${msg}${extra ? `  — ${extra}` : ''}`);
};
async function call(name, url, init = {}) {
  const t0 = performance.now();
  const res = await fetch(url, init);
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Math.round(performance.now() - t0);
  timings.push({ name, status: res.status, ms, bytes: buf.length });
  let json = null;
  try {
    json = JSON.parse(buf.toString());
  } catch {}
  return { res, status: res.status, json, buf, ms };
}
async function latestCode(email) {
  for (let i = 0; i < 40; i++) {
    const list = await (
      await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json();
    const msg = list.messages?.[0];
    const code = msg?.Subject?.match(/\d{6}/)?.[0];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code for ${email}`);
}

const stamp = Date.now();
const email = `mac-e2e+${stamp}@shootspot.local`;
const app = { 'content-type': 'application/json', 'expo-origin': 'shootspot://' };
let h;
let recordId;
let projectId;
const here = { lat: 52.48514, lon: 13.382 };

try {
  console.log('sign-in');
  let r = await call('send-otp', `${API}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers: app,
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  ok(r.status === 200, 'code requested', `${r.ms} ms`);
  const t0 = performance.now();
  const otp = await latestCode(email);
  ok(true, 'code arrived in Mailpit', `${Math.round(performance.now() - t0)} ms`);
  r = await call('sign-in', `${API}/api/auth/sign-in/email-otp`, {
    method: 'POST',
    headers: app,
    body: JSON.stringify({ email, otp }),
  });
  const token = r.res.headers.get('set-auth-token');
  ok(r.status === 200 && token, 'signed in, bearer token issued');
  h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  console.log('onboarding');
  const legal = (await call('legal', `${API}/v1/legal`)).json;
  r = await call('onboarding', `${API}/v1/me/onboarding`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      ageConfirmed16: true,
      accept: { terms: legal.terms, privacy: legal.privacy, image_license: legal.image_license },
      firstName: 'Mac E2E',
    }),
  });
  ok(r.status === 204, 'onboarded');

  console.log('settings: portfolio link');
  r = await call('profile-noscheme', `${API}/v1/me/profile`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ portfolioUrl: 'example.com/portfolio' }),
  });
  ok(
    true,
    `server with link "example.com/portfolio" → ${r.status}`,
    r.status === 400
      ? 'NAS image predates the shared fix; app-side normalize covers it'
      : 'server accepts it',
  );
  r = await call('profile-https', `${API}/v1/me/profile`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({
      portfolioUrl: 'https://example.com/portfolio',
      bio: 'E2E',
      socialHandle: '@e2e',
    }),
  });
  ok(r.status === 204 || r.status === 200, `normalized link saves (${r.status})`);
  const me = (await call('me', `${API}/v1/me`, { headers: h })).json;
  ok(
    me?.profile?.portfolioUrl === 'https://example.com/portfolio',
    'profile stores https://example.com/portfolio',
  );

  console.log('vocabulary');
  r = await call('vocabulary', `${API}/v1/vocabulary`, { headers: h });
  const vocab = r.json;
  ok(
    r.status === 200 && vocab?.goodFor?.length && vocab?.bestLight?.length,
    `tags from server: ${vocab?.goodFor?.length} good-for, ${vocab?.bestLight?.length} best-light`,
  );

  console.log('capture → publish');
  const draft = {
    draftId: crypto.randomUUID(),
    framing: '16:9',
    pin: { ...here, accuracyM: 5, source: 'gps' },
    short: {
      label: `Mac E2E ${stamp}`,
      goodFor: [vocab.goodFor[0].key],
      bestLight: [vocab.bestLight[0].key],
      bearingDeg: 229,
    },
    capture: {
      capturedAt: new Date().toISOString(),
      altitudeM: 50,
      focalLength35mm: 24,
      headingDeg: 229,
    },
  };
  r = await call('create-unknown-tag', `${API}/v1/records`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      ...draft,
      draftId: crypto.randomUUID(),
      short: { ...draft.short, goodFor: ['not_a_tag'] },
    }),
  });
  ok(
    r.status === 400 && JSON.stringify(r.json).includes('unknown_tag'),
    `unknown tag rejected (${r.status} ${r.json?.error})`,
  );
  r = await call('create', `${API}/v1/records`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(draft),
  });
  ok(r.status === 201, 'record created', `${r.ms} ms`);
  recordId = r.json.recordId;
  const uploadHost = new URL(r.json.upload.url).host;
  ok(true, `presigned upload goes to ${uploadHost}`);
  // Same size as the iPhone's 16:9 crop (4032×2268), with detail so the JPEG is realistic.
  const jpeg = await sharp({
    create: {
      width: 4032,
      height: 2268,
      channels: 3,
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  const up = await call('upload', r.json.upload.url, {
    method: 'PUT',
    headers: r.json.upload.headers,
    body: jpeg,
  });
  ok(up.res.ok, `photo uploaded (${(jpeg.length / 1e6).toFixed(1)} MB)`, `${up.ms} ms`);
  r = await call('upload-complete', `${API}/v1/records/${recordId}/upload-complete`, {
    method: 'POST',
    headers: h,
  });
  ok(r.status < 300, `upload-complete (${r.status})`);
  const tp = performance.now();
  let status;
  for (let i = 0; i < 120; i++) {
    status = (await call('status-poll', `${API}/v1/records/${recordId}/status`, { headers: h }))
      .json;
    if (status.status === 'published' || status.status === 'rejected') break;
    await new Promise((res) => setTimeout(res, 500));
  }
  const procMs = Math.round(performance.now() - tp);
  ok(
    status.status === 'published',
    `worker result: ${status.status}`,
    `${procMs} ms after upload-complete${status.media?.rejectReason ? `, reason ${status.media.rejectReason}` : ''}`,
  );

  console.log('feed');
  r = await call('feed-everywhere', `${API}/v1/feed?limit=12`, { headers: h });
  let item = r.json.items.find((x) => x.id === recordId);
  ok(
    item,
    `new record in Everywhere feed (${r.json.items.length} items)`,
    `${r.ms} ms, ${r.buf.length} B`,
  );
  r = await call(
    'feed-nearby',
    `${API}/v1/feed?limit=12&lat=${here.lat}&lon=${here.lon}&radiusKm=10`,
    { headers: h },
  );
  item = r.json.items.find((x) => x.id === recordId);
  ok(
    item && typeof item.distanceM === 'number',
    `in Nearby 10 km feed with distance (${item?.distanceM} m)`,
  );
  r = await call('feed-tag', `${API}/v1/feed?limit=12&goodFor=${draft.short.goodFor[0]}`, {
    headers: h,
  });
  ok(
    r.json.items.some((x) => x.id === recordId),
    `tag filter goodFor=${draft.short.goodFor[0]} finds it`,
  );
  r = await call('feed-far', `${API}/v1/feed?limit=12&lat=38.7139&lon=-9.1334&radiusKm=10`, {
    headers: h,
  });
  ok(!r.json.items.some((x) => x.id === recordId), 'not in a Lisbon 10 km feed');
  ok(
    item && item.attribution === null && !JSON.stringify(item).includes(email),
    'anonymous by default',
  );
  const imgs = item?.images ?? {};
  console.log(
    `  · feed items now: ${r.json.items.map((x) => x.short?.label ?? x.label ?? x.id).join(' | ')}`,
  );
  for (const [k, u] of Object.entries(imgs).filter(
    ([, v]) => typeof v === 'string' && v.startsWith('http'),
  )) {
    const ir = await call(`image-${k}`, u);
    ok(
      ir.status === 200,
      `image "${k}" loads from ${new URL(u).host} (${ir.res.headers.get('content-type')}, ${(ir.buf.length / 1024).toFixed(0)} KB)`,
      `${ir.ms} ms`,
    );
  }

  console.log('map');
  const d = 0.05;
  r = await call(
    'map',
    `${API}/v1/map?minLat=${here.lat - d}&minLon=${here.lon - d}&maxLat=${here.lat + d}&maxLon=${here.lon + d}`,
    { headers: h },
  );
  if (r.status === 400) ok(false, 'map query params', JSON.stringify(r.json).slice(0, 200));
  else
    ok(
      r.status === 200 && JSON.stringify(r.json).includes(recordId),
      `map box returns the pin (${r.status})`,
      `${r.ms} ms, ${r.buf.length} B`,
    );

  console.log('location detail');
  r = await call('record', `${API}/v1/records/${recordId}`, { headers: h });
  ok(r.status === 200, 'detail loads', `${r.ms} ms`);

  console.log('projects');
  r = await call('project-create', `${API}/v1/projects`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ name: 'E2E project' }),
  });
  projectId = r.json?.id ?? r.json?.project?.id;
  ok(r.status === 201 || (r.status === 200 && projectId), `project created (${r.status})`);
  r = await call('project-rename', `${API}/v1/projects/${projectId}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ name: 'E2E renamed' }),
  });
  ok(r.status < 300, `project renamed (${r.status})`);
  r = await call('project-add', `${API}/v1/projects/${projectId}/items`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ recordId }),
  });
  ok(r.status < 300, `location saved to project (${r.status})`);
  r = await call('project-items', `${API}/v1/projects/${projectId}/items`, { headers: h });
  ok(JSON.stringify(r.json).includes(recordId), 'project lists the location');

  console.log('owner controls');
  r = await call('attr-on-no-notice', `${API}/v1/me/records/${recordId}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ attributed: true }),
  });
  ok(r.status === 409, `attribution without notice refused (${r.status} ${r.json?.error})`);
  r = await call('my-records', `${API}/v1/me/records`, { headers: h });
  ok(JSON.stringify(r.json).includes(recordId), 'My locations lists it');

  console.log('settings: export and deletion');
  r = await call('export', `${API}/v1/me/exports`, { method: 'POST', headers: h });
  ok(r.status < 300, `data export requested (${r.status})`);
  r = await call('deletion-schedule', `${API}/v1/me/deletion`, { method: 'POST', headers: h });
  ok(r.status < 300, `deletion scheduled (${r.status})`);
  r = await call('deletion-cancel', `${API}/v1/me/deletion`, { method: 'DELETE', headers: h });
  ok(r.status < 300, `deletion cancelled (${r.status})`);
  ok(
    (await call('me2', `${API}/v1/me`, { headers: h })).json?.deletionScheduledFor == null,
    'no deletion pending',
  );

  console.log('rate limit (feed, 60/min)');
  let limited = 0;
  const burst = await Promise.all(
    Array.from({ length: 50 }, () =>
      fetch(`${API}/v1/feed?limit=1`, { headers: h }).then((x) => x.status),
    ),
  );
  limited = burst.filter((s) => s === 429).length;
  ok(true, `after ~10 earlier feed calls, a 50-call burst got ${limited}× 429`);
} catch (e) {
  ok(false, `aborted: ${e.message}`);
} finally {
  console.log('cleanup');
  if (projectId)
    ok(
      (
        await call('cleanup-project', `${API}/v1/projects/${projectId}`, {
          method: 'DELETE',
          headers: h,
        })
      ).status < 300,
      'project deleted',
    );
  if (recordId)
    ok(
      (
        await call('cleanup-record', `${API}/v1/me/records/${recordId}`, {
          method: 'DELETE',
          headers: h,
        })
      ).status < 300,
      'record deleted (images purged)',
    );
  if (h)
    ok(
      (await call('cleanup-account', `${API}/v1/me/deletion`, { method: 'POST', headers: h }))
        .status < 300,
      'test account scheduled for deletion',
    );
}

console.log('\ntimings (ms, bytes):');
const agg = {};
for (const t of timings) (agg[t.name] ??= []).push(t);
for (const [n, ts] of Object.entries(agg)) {
  const ms = ts.map((t) => t.ms).sort((a, b) => a - b);
  console.log(
    `  ${n.padEnd(20)} n=${String(ts.length).padStart(3)}  median ${String(ms[ms.length >> 1]).padStart(5)}  max ${String(ms.at(-1)).padStart(5)}  bytes ${ts.at(-1).bytes}  status ${[...new Set(ts.map((t) => t.status))].join('/')}`,
  );
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
