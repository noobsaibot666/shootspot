# Phase 4/5 test from the Mac: NAS backend and iPhone

- **Date:** 2026-10-16
- **Backend:** NAS `9e2b35d` (`http://192.168.178.146:4400`, storage `:4402`, Mailpit `:4403`)
- **App:** iPhone 16 Pro Max, iOS 27.2 beta, dev build of `39fe8a8` (rebuilt for the Expo patches) plus the fixes below

The Mac can't tap a physical iPhone, so the checklist ran as the phone's API calls from [`tools/phone-e2e.mjs`](../../tools/phone-e2e.mjs). It uses a throwaway account and a generated 4032×2268 JPEG (the iPhone's 16:9 crop size), then deletes its record and project and schedules the account for deletion. On-device state was read with `devicectl` (app container) and the console with `devicectl --console`.

## Result: 30/30 checks pass

| Area             | Checked                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in          | Code requested, arrives in Mailpit, bearer token issued, onboarding                                                                         |
| Settings         | Profile save (link, bio, handle), data export (202), deletion scheduled then cancelled                                                      |
| Tags (Phase 5)   | `/v1/vocabulary`: 15 good-for, 9 best-light; an unknown tag is refused (`400 unknown_tag`)                                                  |
| Publish          | Create, presigned PUT to `:4402`, upload-complete, worker **published in ~1.5 s**                                                           |
| Feed             | Everywhere, Nearby 10 km (with `distanceM`), tag filter, excluded from a Lisbon feed, anonymous by default; thumb/feed/detail WebP all load |
| Map              | `/v1/map` box returns the pin                                                                                                               |
| Detail and owner | Detail loads; attribution without the notice is refused (`409`); My locations lists it                                                      |
| Projects         | Create, rename, save location, list items, delete                                                                                           |
| Rate limit       | Feed limit trips at 60/min per IP (`429`)                                                                                                   |

**Phone state:** the stale Phase 3 `processing` draft is gone (Windows fix `5f5efb2`), and `Documents/drafts` is empty. The saved scope is `nearby`, 5 km. The console since the 21:17 launch shows no JS errors or failed requests.

## Fixed on the Mac

1. **Portfolio link without `https://`** (`3beb970`): `normalizeWebUrl()` in shared, used by the schema and Settings. **The NAS still answers `400` to `example.com/portfolio`** because its image predates the change. The app normalizes before sending, so members aren't affected, but the server half needs the next image build.
2. **Feed reloads on focus** (`3beb970`), so a newly published location shows when you return to the tab.
3. **Image cache key** (this commit). Media URLs are re-signed on every response: two identical feed calls returned **0/2 identical image URLs**. expo-image caches by URI, so every feed load re-downloaded every image, and the focus reload above made that more frequent. New `lib/images.ts` `mediaSource(url)` keys the cache on the object path (before `?`); it's used by Feed, record detail, projects and profile thumbnails.

## Improvement data (→ windows)

Timings from the Mac on the LAN (phone ≈ similar, Wi-Fi adds a few ms):

| Call                         | Time           | Size                        |
| ---------------------------- | -------------- | --------------------------- |
| create record                | 22–27 ms       | 677 B                       |
| upload 6 MB JPEG (presigned) | 241–272 ms     |                             |
| worker processing            | ~1.5 s         |                             |
| feed (12)                    | 11–23 ms       | ~5 KB (3 items)             |
| map box                      | 14 ms          | 1.7 KB                      |
| thumb / feed / detail WebP   | 5 / 31 / 63 ms | 1 KB / 100 KB / **~960 KB** |

- **Detail WebP is ~1 MB** for a 4032×2268 source. The test image is noisy, so real photos will be smaller, but check the detail variant's max width and quality: on mobile data, every detail open costs about this much.
- **Presigned URLs change every response.** The app now caches by path. Consider whether public variants could use stable URLs (public-read bucket path or longer-lived, deterministic signatures) so CDNs and other clients can cache too.
- **The rate limit is per IP and counts unauthenticated requests.** Fine on the LAN, but behind carrier-grade NAT many members share one IP, so 60/min per IP could throttle unrelated users in production. Consider keying on the user id when signed in.
- **Server link validation** needs the next NAS image (item 1 above).
- **Nearby 5 km is the saved default** on this phone. A member publishing from further away won't see their own new photo in Nearby, which looks like the earlier "photo not in feed" report. Consider a hint ("Your new location is outside Nearby · 5 km") or briefly showing it after publishing.
