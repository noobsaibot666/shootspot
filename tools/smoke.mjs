// End-to-end smoke test against running local services (API :4000, admin :3000, worker, Mailpit).
//   node tools/smoke.mjs
// Signs in through the admin proxy with a real emailed code, enrols TOTP, publishes a photo from a
// "phone" (bearer token), waits for the worker, and checks the feed and admin views.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('services/api/package.json'));
const { TOTP, Secret } = require('otpauth');
const sharp = createRequire(path.resolve('services/worker/package.json'))('sharp');

const API = 'http://127.0.0.1:4000';
const ADMIN = 'http://localhost:3000';
const MAILPIT = 'http://127.0.0.1:8025';
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

async function latestCode(email) {
  for (let i = 0; i < 20; i++) {
    const list = await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json();
    const msg = list.messages?.[0];
    if (msg) {
      const code = msg.Subject.match(/\d{6}/)?.[0];
      await fetch(`${MAILPIT}/api/v1/messages`, {
        method: 'DELETE',
        body: JSON.stringify({ IDs: [msg.ID] }),
      });
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code for ${email}`);
}

/** Cookie-jar client for the admin origin. */
function browser() {
  const jar = new Map();
  return async (url, init = {}) => {
    const res = await fetch(`${ADMIN}${url}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        origin: ADMIN,
        cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...init.headers,
      },
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, ...v] = pair.split('=');
      jar.set(k.trim(), v.join('='));
    }
    return res;
  };
}

const stamp = Date.now();
const ownerEmail = `owner+${stamp}@shootspot.local`;
const phoneEmail = `phone+${stamp}@shootspot.local`;

console.log('admin web (cookies via proxy)');
const b = browser();
const stranger = `stranger+${stamp}@shootspot.local`;
await b('/api/auth/email-otp/send-verification-otp', {
  method: 'POST',
  body: JSON.stringify({ email: stranger, type: 'sign-in' }),
});
const strangerMail = await (
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${stranger}`)}`)
).json();
ok(strangerMail.messages_count === 0, 'admin web sends no code to a non-owner');
console.log(`  … granting owner to ${ownerEmail}`);
const { execSync } = await import('node:child_process');
execSync(`pnpm --silent --filter @shootspot/api owner:grant ${ownerEmail}`, { stdio: 'inherit' });
ok(
  (
    await b('/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      body: JSON.stringify({ email: ownerEmail, type: 'sign-in' }),
    })
  ).status === 200,
  'code sent via admin proxy',
);
const signIn = await b('/api/auth/sign-in/email-otp', {
  method: 'POST',
  body: JSON.stringify({ email: ownerEmail, otp: await latestCode(ownerEmail) }),
});
ok(signIn.status === 200, 'owner signed in with emailed code');
const noMfa = await b('/admin/v1/summary');
ok(
  noMfa.status === 403 && (await noMfa.json()).error === 'mfa_required',
  'owner without MFA is refused',
);
const { otpauthUri } = await (
  await b('/admin/v1/mfa/enroll', { method: 'POST', body: '{}' })
).json();
const secret = new URL(otpauthUri).searchParams.get('secret');
const code = new TOTP({ secret: Secret.fromBase32(secret) }).generate();
ok(
  (await b('/admin/v1/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) })).status ===
    204,
  'TOTP verified',
);
ok((await b('/admin/v1/summary')).status === 200, 'owner + MFA reaches the admin API');

console.log('phone (bearer token, direct to API)');
const phoneSend = await fetch(`${API}/api/auth/email-otp/send-verification-otp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'expo-origin': 'shootspot://' },
  body: JSON.stringify({ email: phoneEmail, type: 'sign-in' }),
});
ok(
  phoneSend.status === 200,
  `code requested by the app (${phoneSend.status} ${phoneSend.status === 200 ? '' : await phoneSend.text()})`,
);
const phoneSignIn = await fetch(`${API}/api/auth/sign-in/email-otp`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'expo-origin': 'shootspot://' },
  body: JSON.stringify({ email: phoneEmail, otp: await latestCode(phoneEmail) }),
});
const token = phoneSignIn.headers.get('set-auth-token');
ok(Boolean(token), 'bearer token issued');
const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const legal = await (await fetch(`${API}/v1/legal`)).json();
ok(
  (
    await fetch(`${API}/v1/me/onboarding`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        ageConfirmed16: true,
        accept: { terms: legal.terms, privacy: legal.privacy, image_license: legal.image_license },
        firstName: 'Phone',
      }),
    })
  ).status === 204,
  'onboarded',
);
const draft = {
  draftId: crypto.randomUUID(),
  framing: '16:9',
  pin: { lat: 38.7139, lon: -9.1334, accuracyM: 6, source: 'gps' },
  short: {
    label: `Smoke test ${stamp}`,
    goodFor: ['landscape'],
    bestLight: ['golden_pm'],
    bearingDeg: 250,
  },
  capture: {
    capturedAt: new Date().toISOString(),
    altitudeM: 80,
    focalLength35mm: 26,
    headingDeg: 250,
  },
};
const created = await (
  await fetch(`${API}/v1/records`, { method: 'POST', headers: h, body: JSON.stringify(draft) })
).json();
const jpeg = await sharp({
  create: { width: 3840, height: 2160, channels: 3, background: '#c0602a' },
})
  .jpeg()
  .toBuffer();
ok(
  (await fetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: jpeg }))
    .ok,
  'uploaded to presigned URL',
);
await fetch(`${API}/v1/records/${created.recordId}/upload-complete`, {
  method: 'POST',
  headers: h,
});
let status;
for (let i = 0; i < 60; i++) {
  status = await (
    await fetch(`${API}/v1/records/${created.recordId}/status`, { headers: h })
  ).json();
  if (status.status === 'published' || status.status === 'rejected') break;
  await new Promise((r) => setTimeout(r, 500));
}
ok(status.status === 'published', `worker published the record (${status.media.state})`);
const feed = await (
  await fetch(`${API}/v1/feed?lat=38.7139&lon=-9.1334&radiusKm=1`, { headers: h })
).json();
const item = feed.items.find((r) => r.id === created.recordId);
ok(
  item && item.attribution === null && !JSON.stringify(item).includes(phoneEmail),
  'record in feed, anonymous',
);
ok(
  (await fetch(item.images.feed)).headers.get('content-type') === 'image/webp',
  'feed image served as WebP',
);

console.log('admin sees it');
const summary = await (await b('/admin/v1/summary')).json();
ok(summary.published >= 1, `summary shows ${summary.published} published`);
console.log('\nSMOKE TEST PASSED');
