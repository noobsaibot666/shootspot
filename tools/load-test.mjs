// Load and upload test (backlog 5.9). Run against the LOCAL stack, never the NAS (other apps
// share it):
//   API=http://127.0.0.1:4000 MAIL=http://127.0.0.1:8025 node tools/load-test.mjs
// The local API must run with CLIENT_IP_HEADER=x-load-client so per-IP rate limits apply per
// simulated client (production keeps real IPs). Options: CLIENTS (20), SECONDS (30), UPLOADS (20).
import { createRequire } from 'node:module';
import path from 'node:path';

const sharp = createRequire(path.resolve('services/worker/package.json'))('sharp');
const API = process.env.API ?? 'http://127.0.0.1:4000';
const MAIL = process.env.MAIL ?? 'http://127.0.0.1:8025';
const CLIENTS = Number(process.env.CLIENTS ?? 20);
const SECONDS = Number(process.env.SECONDS ?? 30);
const UPLOADS = Number(process.env.UPLOADS ?? 20);
if (/192\.168\.178\.146|:4400/.test(API)) throw new Error('Refusing to load-test the NAS.');

const app = { 'content-type': 'application/json', 'expo-origin': 'shootspot://' };
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN;
};

async function latestCode(email) {
  for (let i = 0; i < 40; i++) {
    const list = await (
      await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json();
    const code = list.messages?.[0]?.Subject?.match(/\d{6}/)?.[0];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code for ${email}`);
}

async function member(i) {
  const email = `load+${Date.now()}-${i}@shootspot.local`;
  const ip = { 'x-load-client': `10.9.0.${i + 1}` };
  await fetch(`${API}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers: { ...app, ...ip },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  const otp = await latestCode(email);
  const res = await fetch(`${API}/api/auth/sign-in/email-otp`, {
    method: 'POST',
    headers: { ...app, ...ip },
    body: JSON.stringify({ email, otp }),
  });
  const h = {
    authorization: `Bearer ${res.headers.get('set-auth-token')}`,
    'content-type': 'application/json',
    ...ip,
  };
  const legal = await (await fetch(`${API}/v1/legal`)).json();
  await fetch(`${API}/v1/me/onboarding`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      ageConfirmed18: true,
      accept: { terms: legal.terms, privacy: legal.privacy, image_license: legal.image_license },
      firstName: `Load ${i}`,
    }),
  });
  return h;
}

// --- 1. Uploads: create → presigned PUT → complete, then time until published -----------------
console.log(`Signing in ${CLIENTS} clients…`);
const clients = [];
for (let i = 0; i < CLIENTS; i++) clients.push(await member(i));

console.log(`Uploading ${UPLOADS} photos (3840×2160 JPEG) in parallel…`);
const jpeg = await sharp({
  create: { width: 3840, height: 2160, channels: 3, background: { r: 30, g: 80, b: 120 } },
})
  .jpeg({ quality: 90 })
  .toBuffer();
const uploadMs = [];
const publishMs = [];
let uploadErrors = 0;
await Promise.all(
  Array.from({ length: UPLOADS }, async (_, i) => {
    const h = clients[i % clients.length];
    const t0 = performance.now();
    try {
      const created = await (
        await fetch(`${API}/v1/records`, {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            draftId: crypto.randomUUID(),
            framing: '16:9',
            pin: { lat: 52.5 + i / 1000, lon: 13.4 + i / 1000, accuracyM: 8, source: 'gps' },
            short: {
              label: `Load ${i}`,
              goodFor: ['urban'],
              bestLight: ['golden_pm'],
              bearingDeg: 90,
            },
            capture: {
              capturedAt: new Date().toISOString(),
              altitudeM: null,
              focalLength35mm: null,
              headingDeg: null,
            },
          }),
        })
      ).json();
      const put = await fetch(created.upload.url, {
        method: 'PUT',
        headers: created.upload.headers,
        body: jpeg,
      });
      if (!put.ok) throw new Error(`put ${put.status}`);
      const done = await fetch(`${API}/v1/records/${created.recordId}/upload-complete`, {
        method: 'POST',
        headers: h,
      });
      if (!done.ok) throw new Error(`complete ${done.status}`);
      uploadMs.push(performance.now() - t0);
      for (let n = 0; n < 240; n++) {
        const s = await (
          await fetch(`${API}/v1/records/${created.recordId}/status`, { headers: h })
        ).json();
        if (s.status === 'published') return publishMs.push(performance.now() - t0);
        if (s.status === 'rejected') throw new Error('rejected');
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error('not published within 2 min');
    } catch (e) {
      uploadErrors++;
      console.log(`  upload ${i}: ${e.message}`);
    }
  }),
);

// --- 2. Reads: feed, map and vocabulary for SECONDS with CLIENTS concurrent clients -----------
console.log(`Reading feed/map/vocabulary with ${CLIENTS} clients for ${SECONDS} s…`);
const lat = { feed: [], map: [], vocabulary: [] };
const statuses = {};
const until = Date.now() + SECONDS * 1000;
await Promise.all(
  clients.map(async (h) => {
    while (Date.now() < until) {
      for (const [name, url] of [
        ['feed', `${API}/v1/feed?lat=52.5&lon=13.4&radiusKm=50&limit=24`],
        ['map', `${API}/v1/map?minLat=52.3&minLon=13.1&maxLat=52.7&maxLon=13.7`],
        ['vocabulary', `${API}/v1/vocabulary`],
      ]) {
        const t0 = performance.now();
        const res = await fetch(url, { headers: h });
        await res.arrayBuffer();
        lat[name].push(performance.now() - t0);
        statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      }
      // About one screen load per second per client, like a person scrolling and panning.
      await new Promise((r) => setTimeout(r, 1000));
    }
  }),
);

const fmt = (xs) =>
  xs.length
    ? `n=${xs.length}  p50 ${Math.round(pct(xs, 50))} ms  p95 ${Math.round(pct(xs, 95))} ms  p99 ${Math.round(pct(xs, 99))} ms`
    : 'n=0';
console.log('\nResults');
console.log(`  uploads    ${fmt(uploadMs)}  errors ${uploadErrors}/${UPLOADS}`);
console.log(`  published  ${fmt(publishMs)}  (create → visible in feed)`);
for (const k of Object.keys(lat)) console.log(`  ${k.padEnd(10)} ${fmt(lat[k])}`);
console.log(`  HTTP status counts ${JSON.stringify(statuses)}`);
