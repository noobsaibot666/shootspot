// Google Play Developer API helper (dependency-free), like tools/asc.mjs for Apple.
// Service account key: %USERPROFILE%\.shootspot\play-key.json (never committed).
//   node tools/play.mjs check [package]
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const key = JSON.parse(readFileSync(join(homedir(), '.shootspot', 'play-key.json'), 'utf8'));
const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
export const PACKAGE = 'com.shootspot.app';

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

let token;
export async function accessToken() {
  if (token) return token;
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetch(key.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token: ${res.status} ${JSON.stringify(json)}`);
  return (token = json.access_token);
}

export async function play(method, path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${json.error?.message ?? text}`);
  return json;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [cmd, pkg = PACKAGE] = process.argv.slice(2);
  if (cmd === 'check') {
    const edit = await play('POST', `${pkg}/edits`);
    const details = await play('GET', `${pkg}/edits/${edit.id}/details`);
    console.log(`ok: ${pkg}, default language ${details.defaultLanguage}`);
    await play('DELETE', `${pkg}/edits/${edit.id}`);
  } else if (cmd === 'upload') {
    // node tools/play.mjs upload <file.aab> [track]: a draft release; roll it out in Play Console.
    const [, file, track = 'internal'] = process.argv.slice(2);
    const edit = await play('POST', `${PACKAGE}/edits`);
    const res = await fetch(
      `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${edit.id}/bundles?uploadType=media`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          'content-type': 'application/octet-stream',
        },
        body: readFileSync(file),
      },
    );
    const bundle = await res.json();
    if (!res.ok) throw new Error(`upload: ${res.status} ${bundle.error?.message}`);
    console.log(`uploaded versionCode ${bundle.versionCode}`);
    await play('PUT', `${PACKAGE}/edits/${edit.id}/tracks/${track}`, {
      track,
      releases: [{ status: 'draft', versionCodes: [String(bundle.versionCode)] }],
    });
    await play('POST', `${PACKAGE}/edits/${edit.id}:commit`);
    console.log(`committed: draft release on ${track}`);
  } else {
    console.log('usage: node tools/play.mjs check [package] | upload <file.aab> [track]');
  }
}
