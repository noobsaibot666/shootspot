#!/usr/bin/env node
// Minimal App Store Connect API client (no dependencies). Signs an ES256 JWT with the team API key
// in ~/.appstoreconnect/private_keys/AuthKey_<id>.p8 (never committed, never printed).
//
//   ASC_KEY_ID=UZC482Y6WF ASC_ISSUER_ID=<issuer> node tools/asc.mjs GET /v1/apps
//   node tools/asc.mjs PATCH /v1/appInfoLocalizations/<id> body.json
//
// Docs: https://developer.apple.com/documentation/appstoreconnectapi
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const keyId = process.env.ASC_KEY_ID ?? 'UZC482Y6WF';
const issuer = process.env.ASC_ISSUER_ID ?? '6617526e-7c7f-4cc9-ac54-1b8035c71918';
const key = createPrivateKey(
  readFileSync(`${homedir()}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8`),
);

export function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64({ iss: issuer, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })}`;
  const sig = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `${data}.${sig.toString('base64url')}`;
}

export async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [method = 'GET', path = '/v1/apps', bodyFile] = process.argv.slice(2);
  const body = bodyFile ? JSON.parse(readFileSync(bodyFile, 'utf8')) : undefined;
  const { status, json } = await asc(method, path, body);
  console.log(status);
  console.log(JSON.stringify(json, null, 2));
}
