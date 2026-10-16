# Windows ↔ macOS handoff

This file is how the **Windows** dev machine (main development, Android builds, TrueNAS ops) and the **macOS** dev machine (iOS builds and iPhone testing) talk to each other. Both sides, people and Claude sessions alike, read it before starting work and update it before pushing.

## How to use it

1. `git pull` before you start, then read **Current state** and **Open requests**.
2. When you need something from the other machine, add a line under **Open requests** with the date and who it's for (`→ mac` or `→ windows`).
3. When you finish a request, move it to **Log** with the result: what happened, any error text, the commit hash.
4. Keep entries short. Long output goes in a file under `state/reports/` with a link from here.
5. Commit with a message starting `state:` and push right away, so the other side sees it.

Rules:

- Never put secrets here: tokens, passwords, keys, `.env` values.
- Only one side edits a given section at a time. Pull before editing to avoid conflicts.

---

## Current state

| Item               | Value                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase              | 5 built (tags admin, rate limits, backups, alerts, server Sentry); Phase 4/5 NAS images `9e2b35d` ready, owner loading them; then bug review from device tests |
| Latest commit      | see `git log -1`                                                                                                                                               |
| Expo project       | `@expose.u/shootspot` (ID `43d5bfac-52db-4815-999f-6cd2336d405b`)                                                                                              |
| ai-memory          | Windows: local server, Claude Code wired. Mac: not yet; shared NAS server planned                                                                              |
| Server folder      | `/Volumes/Gaia/04_DEV/_personal/shootspot` (created; `runtime/` is hidden from SMB by design, see docs/runbooks/server-folders.md)                             |
| Android build      | not yet built                                                                                                                                                  |
| iOS build          | Phase 3 dev build (`69ff6a7`) installed on iPhone 16 Pro Max (iOS 27.2 beta), Xcode 27.1; flow tests pending                                                   |
| Backend for phones | NAS `http://192.168.178.146:4400`                                                                                                                              |

## Open requests

- 2026-10-16 → mac: **Phase 4 is built (JS only, no new native modules, no rebuild).** `git pull`, restart Metro with `--clear`, and reload. Test on the iPhone:
  - the floating Feed · Map · Profile bar and the camera button
  - the Feed's scope chip and filter sheet (Everywhere, Nearby, a searched place, radius, tags)
  - Map clusters and the preview card
  - the location detail: Open in Maps, Save to a project, Report, and the owner switch/delete on your own location
  - Profile: My locations, Projects (create, rename, delete), and Settings (edit profile, request data export, schedule then cancel deletion)

  **Needs the NAS redeploy first** for the Map tab (new `/v1/map` endpoint). Windows prepares the images and the owner loads them. Log the results or issues here.

- 2026-10-16 → mac: **Phase 3 iOS dev build (real app: sign-in, camera, publish).** New native modules (maps, secure store, router, haptics, expo-image), so a fresh build is needed.
  1. `git pull && pnpm install`
  2. Create `apps/mobile/.env` with `EXPO_PUBLIC_API_URL=http://192.168.178.63:4000` (the Windows PC on the same Wi-Fi; the Windows side starts the API, worker and Mailpit before testing).
  3. `cd apps/mobile && npx expo prebuild --platform ios --clean`, then build and install with the `xcodebuild … -allowProvisioningUpdates` workaround from the log below.
  4. **Icon check (backlog 3.9):** the new `plugins/with-p3-app-icon.js` copies the P3-tagged icon into the AppIcon set. Confirm `ios/…/AppIcon.appiconset/*1024*.png` still has an ICC profile (`sips -g profile <file>` should say Display P3) and that the home-screen icon looks as vivid as in Figma.
  5. Run the Phase 3 flow and log the results here:
     - sign in (the code arrives in Mailpit at `http://192.168.178.63:8025`)
     - onboarding
     - capture held sideways and held upright
     - confirm the pin
     - notes
     - publish
     - the status screen shows **Published**
  6. ~~Heading test C16/C17~~: deferred to Phase 5 by the owner (low priority).

## Log

- 2026-10-17 mac: **iOS rebuilt at `42b9087`** (new native `react-native-svg` for Phosphor icons; this build also includes `expo-image-picker` and `@sentry/react-native` from `2ae505a`/`5718c20`). Prebuild, build and install succeeded; built with `SENTRY_DISABLE_AUTO_UPLOAD=true`. `tools/phone-e2e.mjs` against NAS `5718c20`: 30/30, and the server now accepts `example.com` links. The 00:35–00:40 console on the previous build had no app errors; the only drop was the dev websocket when the app went to background. Metro warns that `expo-router`'s `exports` entry for `build/global-state/router-store` points to a missing file and falls back; harmless. The owner is testing gallery import and the new UI, with console capture running.

- 2026-10-17 windows: **NAS updated to `5718c20`**: gallery import works against the NAS (pin source `photo`), the portfolio-link fix is live, and the admin website is redesigned (Locations page, pilot metrics).

- 2026-10-16 windows → mac: **The iOS rebuild request below now also covers `@sentry/react-native`** (native; off until `EXPO_PUBLIC_SENTRY_DSN` is set). Build from `5718c20` or later: `git pull && pnpm install && npx expo prebuild --platform ios --clean`, then build. Since then:
  - Design pass finished: Profile grid and menu, project boards, the admin website redesign.
  - Security fix F9: rate limits could be bypassed with a fake `X-Forwarded-For`.
  - Accessibility actions.
  - Load test: local only; the NAS is never load-tested.

  If `pod install` complains about Sentry, log it here.

- 2026-10-16 windows → mac: **New iOS dev build needed** (`2ae505a`): `expo-image-picker` (gallery import, D-28) is a new native module, and app.json adds `NSPhotoLibraryUsageDescription`. `git pull && pnpm install`, then `npx expo prebuild --platform ios --clean` and rebuild. Then test on the iPhone:
  - **Gallery import:** use **+** → Import from gallery (or the camera's gallery button) and pick a few photos, ideally some with location and one portrait. Frame each one (drag; 16:9 or 1:1), check the pin is prefilled from the photo, add notes and publish; it returns to the batch. Close halfway, then check the Profile banner "photos to review" resumes the batch.
  - **Design pass:** masonry Feed; tapping a tile should grow the photo into the detail page, and Back, swipe or a pull-down should shrink it back. Check the icon tab bar with the **+** sheet.
  - Log anything odd here. Windows also runs local Android builds now (`tools/android-local.ps1`).

- 2026-10-16 mac: **Owner on the iPhone: navigation is good so far** (tab bar, Feed, Map, Profile, detail on the current build). Design review is deferred; the focus stays on functionality.

- 2026-10-16 mac: **Phase 4/5 checklist: 30/30 against the NAS** (as API calls; the Mac can't tap the phone). Report: [reports/ios-phase4-test.md](reports/ios-phase4-test.md). Reusable script: `tools/phone-e2e.mjs`. Stale draft fix `5f5efb2` confirmed on the phone. **New Mac fix:** presigned image URLs change on every response (0/2 identical), so expo-image re-downloaded every image on every feed load; `lib/images.ts` `mediaSource()` now caches by object path. **→ windows:** rebuild the NAS images for the `normalizeWebUrl` schema change (the NAS still 400s `example.com`). Also see the report's improvement notes: ~1 MB detail WebP, per-IP rate limit vs carrier NAT, Nearby-scope hint after publishing.

- 2026-10-16 mac: **iOS rebuilt for the Expo SDK 58 patch updates (`2d51479`), running `39fe8a8`.** `pnpm install`, `expo prebuild --platform ios --clean` and the `xcodebuild -allowProvisioningUpdates` build succeeded first try; installed on the iPhone. The AppIcon is still Display P3. Metro restarted with `--dev-client --clear` against the NAS. The owner is re-testing the portfolio-link and Feed fixes (`3beb970`) and the draft fix (`5f5efb2`), with console capture running.

- 2026-10-16 windows → mac: **Expo patch updates need a new iOS dev build** (`2d51479`): expo 58.0.13, expo-crypto/haptics 58.0.7, expo-location 58.0.17, expo-router 58.0.22. `git pull && pnpm install`, then `npx expo prebuild --platform ios --clean` and rebuild as before. Until then, the current iOS build may warn about a native/JS mismatch (Android hit one with haptics; it's now wrapped safely). Android now has a Google Maps key (EAS env `GOOGLE_MAPS_ANDROID_KEY`); iOS is unaffected (Apple Maps).

- 2026-10-16 windows: **Stuck `processing` draft fixed** (your note). On app start and foreground, `resumeDrafts()` now checks `processing` drafts against `/v1/records/:id/status`. It settles a draft once the server is done with it and discards it on 404 (the record isn't on this backend). Pull and reload: the stale `3dc38564…` draft should disappear from Profile. Your portfolio-link fix needs a server image: it goes into the next NAS build.

- 2026-10-16 windows: **Android device test (in progress, logs via adb).** Two fixes, JS only:
  - Google Maps crashed the app (fatal `API key not found`, no key in the build). New `lib/device.ts` `mapsAvailable`: the Android Map tab shows a fallback and the pin screen works with GPS and search only. iOS is unaffected.
  - `expo-haptics` threw `NoSuchMethodError` (a JS/native mismatch in the APK). All haptics now go through `haptics.*` in `lib/device.ts`, which swallows failures.

- 2026-10-16 mac: **Phase 4 test on the iPhone: two owner bugs, fixed on the Mac (owner asked).** Console capture of the session showed no JS errors, failed requests or crashes.
  1. **Portfolio link required `https://`.** New `normalizeWebUrl()` in `packages/shared` adds `https://` when the scheme is missing. `profileUpdateSchema.portfolioUrl` preprocesses with it (2 new tests), and Settings normalizes before sending, so it already works against the current NAS. Placeholder is now `example.com`. **→ windows: the server side applies after the next NAS image build.**
  2. **New photo not in the Feed.** The Feed loaded only on mount or scope change, and tabs stay mounted, so a record published from capture didn't appear until pull-to-refresh. The Feed now reloads on focus (`useFocusEffect`); the spinner shows only when scope or filters change.
  - **→ windows, not fixed:** a stale local draft from the Phase 3 PC-backend run (record `3dc38564…`, 17:30) is stuck at `processing` on the phone forever. Drafts in `processing` are only settled from the record screen, and that record doesn't exist on the NAS. Suggest settling or discarding `processing` drafts whose record returns 404 (and on backend switch).

- 2026-10-16 windows: **NAS updated to `9e2b35d`.** `/v1/map` now answers (401 without sign-in, so the route exists). → mac: the Phase 4 test above can now include the Map tab. Pull and reload Metro (JS only).

- 2026-10-16 windows: **Phase 5 built** (`9e2b35d`, JS only for the app; no rebuild). Tags now come from the server (`/v1/vocabulary`), so publishing with an unknown tag returns 400 `unknown_tag`. Feed and map are limited to 60 requests/min. NAS images `9e2b35d` (with `/v1/map`) are on the share for the owner to load; the Map tab works once they are loaded. Phase 4 test request above still stands; please also log any bugs, since a bug-fix pass comes next.

- 2026-10-16 mac: **Switched the iPhone to the NAS backend (done).** `.env` → `http://192.168.178.146:4400`. Restarted Metro with `--dev-client --clear` and loaded the Phase 4 bundle (`be3b1cf`). NAS checks from the Mac: `/health` 200, `/ready` 200, Mailpit `:4403` 200. **→ windows: `/v1/map` returns 404**, so the NAS is still on the pre-Phase-4 images, and the Map tab can't be tested until the redeploy. The Phase 3 `review.tsx` fix is confirmed in the code. Gotcha: after the restart, the dev client stayed on its launcher ("couldn't resolve its endpoint"). Opening `shootspot://expo-development-client/?url=http%3A%2F%2F<mac-ip>%3A8081` with `devicectl … --payload-url` connects it directly. The Phase 4 device test is in progress, with the console being captured.

- 2026-10-16 windows: **NAS backend deployed** (compose project `shootspot`, images `1c69406`, about 420 MB of RAM). The home network reaches the API at `http://192.168.178.146:4400`, the admin web at `:4401` and Mailpit at `:4403`. For iPhone tests against the NAS instead of the Windows PC, set `EXPO_PUBLIC_API_URL=http://192.168.178.146:4400` in `apps/mobile/.env` and restart Metro.

- 2026-10-16 windows: **iOS end-to-end confirmed:** the owner's capture "Dudenstraße 24, Friedrichshain-Kreuzberg" is `published`, with media `ready` on the server. Console report #1 is fixed: review.tsx now uses `<Redirect>`, and publish no longer resets the capture state before closing. The real bug was `router.dismissAll()`: it only went back to the camera, the first screen of the capture stack, which is why the camera reopened after publishing. It's now `router.dismissTo('/home')`. Pull and reload in Metro (no rebuild needed: JS only). Still open for the iPhone: **heading test C16/C17**. Report #2 (`UIInterfaceOrientation .unknown` at teardown) is noted; there's no action unless C12/C13 look wrong.

- 2026-10-16 mac: **Phase 3 flow run on the iPhone (step 5, partial).** The owner signed up with email, received the code, signed in, took a photo, entered the photo data and previewed it, against the Windows API (now reachable: `/health` 200). No crash, no JS exception, no failed request. **→ windows: one bug to fix.** `capture/review.tsx` calls `router.replace` during render ("Cannot update a component `RoutingQueueProvider` while rendering `Review`"); use `<Redirect>` instead. Full console report: [reports/ios-phase3-console.md](reports/ios-phase3-console.md). Still pending: confirming the publish reaches **Published**, the home-screen icon look, and the heading test C16/C17 (step 6).

- 2026-10-16 windows: **Backend is running for device tests:** API `http://192.168.178.63:4000` (`/ready` ok), worker, local S3 on `:8333`, Mailpit. The API had crashed on start (storage not ready); fixed in `4272ba5` with a startup retry. **Still blocked by the Windows Firewall:** the owner adds the rule from HANDWORK 1.7, which allows 4000, 8081 and 8333 from the local network. Both PC adapters are on the _Public_ profile, so the earlier Private-only rule would not have worked. Mailpit stays local to the PC: the owner reads sign-in codes at `http://127.0.0.1:8025` on Windows. Android dev build is running on EAS.

- 2026-10-16 mac: **Phase 3 request, steps 1–4 done; 5–6 pending.** `pnpm install`, `apps/mobile/.env` created (gitignored), `expo prebuild --platform ios --clean`, and the `xcodebuild -allowProvisioningUpdates` build succeeded first try; the app is installed and running against Metro on the Mac. **Icon (3.9) fixed:** the generated `App-Icon-1024x1024@1x.png` is tagged Display P3, and `Assets.car` now compiles it as `extended srgb` / DisplayGamut `P3` (it was `srgb`); home-screen visual check pending. **→ windows: the API isn't reachable from the Mac.** `http://192.168.178.63:4000/health` and Mailpit `:8025` time out. Please start the API, worker and Mailpit, and check that Windows Firewall allows inbound TCP 4000 and 8025 on the private network.

- 2026-10-16 mac: **Closed the 2026-10-16 "First iOS development build" request.** Build and install were done on the Mac (entries below). Camera results reached Windows and Phase 1 was closed in `885a209`. Follow-ups are in the backlog: 3.7 (heading test C16/C17), 3.9 (iOS icon P3 plugin), 3.10 (signing workaround). Mac is idle until the Phase 3 iOS build request.

- 2026-10-16 mac: **iOS dev build installed (steps 1–5 done; steps 6–8 pending on the owner).** Upgraded to Xcode 27.1 (27A9275, iOS SDK 27.1), which deploys fine to the iOS 27.2 beta. Removed the old iOS 18.5/26.4 simulator runtimes (~49 GB). Gotcha: a second `npx expo run:ios --device` failed signing ("No profiles for 'com.shootspot.app'") because Expo didn't pass `-allowProvisioningUpdates`. The workaround that worked: `cd apps/mobile/ios && xcodebuild -workspace ShootSpot.xcworkspace -scheme ShootSpot -configuration Debug -destination id=<UDID> -derivedDataPath build DEVELOPMENT_TEAM=RD7UU4Z3D2 -allowProvisioningUpdates -allowProvisioningDeviceRegistration build`, then `xcrun devicectl device install app --device <UDID> build/Build/Products/Debug-iphoneos/ShootSpot.app`. **→ windows: app icon loses P3.** `expo prebuild` copies `icon.png` into `ios/…/AppIcon.appiconset/App-Icon-1024x1024@1x.png` with identical pixels but **no ICC profile**, and `Assets.car` compiles it as `srgb`. The P3 red (255,0,0) therefore shows as sRGB red, which is less vivid than Figma. A fix needs a config plugin that keeps the P3 profile (or sets the asset's display-gamut), after owner sign-off; on-phone visual confirmation pending.

- 2026-10-16 mac: **First iOS build attempt: blocked, request stays open.** Mac has Xcode 26.4 (17E192, iOS SDK 26.4), Node 24.10.0, pnpm 11.22.0. The iPhone is an iPhone 16 Pro Max (iPhone17,2) on **iOS 27.2 beta (24B5099f)**, paired, with Developer Mode on. `pnpm install` and `expo prebuild` + CocoaPods succeeded. `npx expo run:ios --device` failed before compiling: `xcodebuild` exit 70, "Timed out waiting for all destinations… The developer disk image could not be mounted on this device." Cause: Xcode 26.4 can't deploy to iOS 27.x. Fix (owner, see HANDWORK 1.3): install the Xcode 27 beta that supports iOS 27.2, then rerun step 5. Also seen: Expo auto-picked the "3rd Party Mac Developer Application" identity for signing. If the next build fails on signing, choose the "Apple Development" identity / team RD7UU4Z3D2 in Xcode. App icon check: not possible until the app installs. Both `apps/mobile/assets/icon.png` (1024², no alpha) and the reference `Group 15.png` (in the server folder `shared/design/app-icon/`, not the repo) are tagged Display P3. Camera tests (step 6): not started.

- 2026-10-16 windows: **Phase 2 done.** API, worker, admin web and Docker/NAS stack, tested (19 API integration, 5 worker e2e, live smoke test). For the Mac: nothing to build yet. Phase 3 changes the app (real camera UI per D-22, sign-in, publish), and a new iOS build request will follow. API contract: docs/api.md. The app must send `expo-origin: shootspot://` on auth requests.
- 2026-10-16 windows: Linked the EAS project. Installed ai-memory 3.1.0 on Windows (Claude Code only). Defined the server folder layout.
- 2026-10-16 windows: Created this handoff file. Phase 1 code is on `main` (`2b49e4a`).
