#!/usr/bin/env node
// Applies the App Store listing for ShootSpot (docs/store/listing.md) through the App Store Connect
// API. Safe to re-run: it only PATCHes existing records. Usage: node tools/asc-listing.mjs
import { asc } from './asc.mjs';

const APP_ID = '6824017223'; // "ShootSpot – Location Scouting", bundle com.exposeu.shootspot (D-36)
const DOCS = 'https://docs.alan-design.com/shootspot';

const description = `ShootSpot is a location-scouting app for photographers and filmmakers.

Photograph a place you'd shoot, and ShootSpot records what matters for the next visit:

• where it is, and which way the camera points
• where the sun was
• the best light
• what it's good for
• access, permits and practical notes

Browse locations near you or anywhere else, filter by what you're shooting, and save the best ones into private projects for your next job.

SCOUT FAST
A minimal camera close to your phone's own. Or import photos you already took; their location and time fill in automatically.

LIGHT AND DIRECTION
Each location shows its compass direction and the sun's position when it was shot, so you know when to go.

ANONYMOUS BY DEFAULT
Nobody sees who added a location unless you choose to show your name.

PRIVATE PROJECTS
Collect locations for a shoot. Only you can see them.

YOUR DATA
Export it any time, or delete your account in the app.

Shared by the community: access and conditions change, so always check before you go.`;

const listing = {
  subtitle: 'Find & share photo locations',
  privacyPolicyUrl: `${DOCS}/legal/privacy/`,
  versionString: '1.0.0',
  copyright: '2026 Alan Alves',
  description,
  keywords:
    'location scouting,photography,film,locations,photo spots,golden hour,sun,shoot,filmmaker,scout',
  supportUrl: `${DOCS}/user-guide/support/`,
  marketingUrl: `${DOCS}/`,
  promotionalText:
    'Scout, pin and share photo and film locations, with light, direction and access notes.',
};

async function must(label, p) {
  const { status, json } = await p;
  if (status >= 300) {
    console.error(`${label}: HTTP ${status}`, JSON.stringify(json?.errors ?? json, null, 1));
    process.exit(1);
  }
  console.log(`${label}: ok`);
  return json;
}

const infos = await must(
  'read appInfos',
  asc('GET', `/v1/apps/${APP_ID}/appInfos?include=appInfoLocalizations`),
);
const info =
  infos.data.find((i) => i.attributes.state !== 'READY_FOR_DISTRIBUTION') ?? infos.data[0];
const infoLoc = infos.included.find(
  (x) => x.type === 'appInfoLocalizations' && x.attributes.locale === 'en-US',
);

await must(
  'subtitle + privacy URL',
  asc('PATCH', `/v1/appInfoLocalizations/${infoLoc.id}`, {
    data: {
      type: 'appInfoLocalizations',
      id: infoLoc.id,
      attributes: { subtitle: listing.subtitle, privacyPolicyUrl: listing.privacyPolicyUrl },
    },
  }),
);

await must(
  'categories',
  asc('PATCH', `/v1/appInfos/${info.id}`, {
    data: {
      type: 'appInfos',
      id: info.id,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: 'PHOTO_AND_VIDEO' } },
        secondaryCategory: { data: { type: 'appCategories', id: 'TRAVEL' } },
      },
    },
  }),
);

const versions = await must(
  'read version',
  asc(
    'GET',
    `/v1/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&include=appStoreVersionLocalizations`,
  ),
);
const version = versions.data[0];
const verLoc = versions.included.find(
  (x) => x.type === 'appStoreVersionLocalizations' && x.attributes.locale === 'en-US',
);

await must(
  'version 1.0.0 + copyright',
  asc('PATCH', `/v1/appStoreVersions/${version.id}`, {
    data: {
      type: 'appStoreVersions',
      id: version.id,
      attributes: { versionString: listing.versionString, copyright: listing.copyright },
    },
  }),
);

await must(
  'description, keywords, URLs',
  asc('PATCH', `/v1/appStoreVersionLocalizations/${verLoc.id}`, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: verLoc.id,
      attributes: {
        description: listing.description,
        keywords: listing.keywords,
        supportUrl: listing.supportUrl,
        marketingUrl: listing.marketingUrl,
        promotionalText: listing.promotionalText,
      },
    },
  }),
);
