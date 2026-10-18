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

| Item               | Value                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Phase              | 5 closed; v1 store submission in progress (iOS 1.0.0 (2) in TestFlight; Android `.aab` pending the upload keystore)       |
| Latest commit      | see `git log -1`                                                                                                          |
| Expo project       | `@expose.u/shootspot` (ID `43d5bfac-52db-4815-999f-6cd2336d405b`)                                                         |
| ai-memory          | Windows: local server, Claude Code wired. Mac: not yet; shared NAS server planned                                         |
| Server folder      | `/Volumes/Gaia/04_DEV/_personal/shootspot` (`runtime/` is hidden from SMB by design, see docs/runbooks/server-folders.md) |
| Store builds       | local only, see [docs/runbooks/store-builds.md](../docs/runbooks/store-builds.md)                                         |
| Android build      | test: `tools/android-local.ps1 -Release`; Play: `tools/android-local.ps1 -Store`                                          |
| iOS build          | Release builds from the Mac; App Store builds via `xcodebuild archive` (bump `ios.buildNumber`, next is 3)                |
| Backend for phones | store builds `https://shootspot-api.expose-u.com`; test builds NAS `http://192.168.178.146:4400`                          |

## Open requests

_None._

## Log

- 2026-10-18 windows: **Reviewed the Mac's sign-in redesign and Profile fix (`9a4c296`, `ac99b17`).** No changes needed: on Android, RN maps `autoComplete="one-time-code"` to `sms-otp` itself. Format, typecheck and tests pass. Done on Windows:
  - **Local Play bundle:** `tools/android-local.ps1 -Store` builds a signed `.aab` (all ABIs, HTTPS API, no cleartext) from `apps/mobile/.env.store`. `android.versionCode` is now in app.json (1). Steps for both platforms: [docs/runbooks/store-builds.md](../docs/runbooks/store-builds.md) (closes backlog 3.10). The upload keystore download from EAS is with the owner (HANDWORK 4.8).
  - **Closed the old open requests:** the e2e guard is in (`tools/phone-e2e.mjs` stops when there's no Mailpit), and the Phase 3, Phase 4 and polish-round iOS requests are all done per the Mac log below.
  - Backlog rows 3.11, 4.7 and 5.14 are marked done. 5.15 (R8) is out of v1.

- 2026-10-17 mac: **iOS 1.0.0 (2) in TestFlight**, built locally and uploaded from the Mac.
  - **Owner feedback fixed:** the sign-in screens are redesigned (centered, branded, "Create your free account", six digit boxes, auto-submit, resend countdown).
  - **Profile blank-screen bug:** the header now sits outside the list, with a loading state, an error state with retry, and a guard against overlapping loads (`9a4c296`).
  - **Build number:** `ios.buildNumber` in app.json (2). Bump it before each upload.
  - **Disk:** the Mac's disk filled up during builds (Docker cache); Docker was cleaned, 19 GB free now.

- 2026-10-17 mac: **App Store Connect set up; build 1.0.0 (1) in TestFlight.**
  - **New iOS bundle ID `com.exposeu.shootspot` (D-36).** `com.shootspot.app` belongs to another Apple developer. Android keeps `com.shootspot.app`.
  - **App:** "ShootSpot – Location Scouting" (`6824017223`; plain "ShootSpot" was taken). The home-screen name stays "ShootSpot".
  - **Local build only, no EAS cloud:** `expo prebuild --clean` with `EXPO_PUBLIC_API_URL=https://shootspot-api.expose-u.com` and the Sentry DSN in the shell, then `xcodebuild archive` and `-exportArchive` (`destination upload`, automatic signing with a cloud-managed distribution certificate). Output goes to `apps/mobile/build-store/` (gitignored).
  - **Through the API with team key `UZC482Y6WF`** (`tools/asc.mjs`, `tools/asc-listing.mjs`): listing, categories, age rating 16+, Free, availability (all countries except mainland China), review details, TestFlight group "Team". Apple's API cannot create apps or set App Privacy; the owner did both on the web.
  - The owner wants all builds local from now on, Android included. **→ windows:** build the Play `.aab` locally too, with the EAS upload keystore. Bump the iOS build number per upload; the next one is 2.

- 2026-10-17 mac: **Docs hub pages live (D-35).** New `docs-site/` (Astro 5.18.2 + Starlight 0.30.6, same as framecraft/darkwave; standalone npm, not in the pnpm workspace; deploy steps in `docs-site/README.md`). Published only `legal/` and `user-guide/`. Hub homepage card added (web_three `e3eb03a`). Live URLs, all 200:
  - Privacy: https://docs.alan-design.com/shootspot/legal/privacy/
  - Terms: https://docs.alan-design.com/shootspot/legal/terms/
  - Image licence: https://docs.alan-design.com/shootspot/legal/image-licence/
  - Delete account (Google Play web deletion URL): https://docs.alan-design.com/shootspot/legal/delete-account/
  - Getting started: https://docs.alan-design.com/shootspot/user-guide/getting-started/
  - Support: https://docs.alan-design.com/shootspot/user-guide/support/

  Operator line, taken from the expose.u finance portal (owner to confirm against the Impressum): "Alan Alves, trading as expose.u (sole proprietorship), Dudenstraße 24, 10965 Berlin, Germany", VAT ID DE461275084. Also filled in `docs/store/legal-drafts.md`. The in-app links came from both sides in parallel; the rebase kept Windows' `41d42f1` versions, and the Mac added only `usesNonExemptEncryption: false` (iOS export compliance). If the legal wording changes, update `docs-site/` too and redeploy.

- 2026-10-17 mac: **iOS Release build installed (HANDWORK 3.9).** `prebuild --clean`, then `xcodebuild -configuration Release` with `SENTRY_DISABLE_AUTO_UPLOAD=true`; installed via `devicectl`. The JS is bundled (`main.jsbundle`, NAS URL `http://192.168.178.146:4400`), and the Info.plist has the ATS exception. Launched via `devicectl`: still running after 10 s, no crash at start. Tailscale + mobile data check is with the owner.

- 2026-10-17 mac: **NAS images `30237a7` on the share** (built on the Mac: `docker build --platform linux/amd64`, same targets as the runbook), with the current `docker-compose.yml` and `env.example`. They include `616f43f` (review account, admin cookies, `S3_PUBLIC_ENDPOINT` passthrough). The Mac gives the owner the guarded NAS block for these images plus the D-33 public hostnames. Gotcha for Mac builds in zsh: write `"shootspot-${t}:latest"`, because `$t:l` is a zsh modifier.

- 2026-10-17 mac: **Public HTTPS is live (D-33), on `expose-u.com`.** The owner switched from alan-design.com because the Mac's Cloudflare token covers DNS only for expose-u.com. Done from the Mac with the owner at the NAS:
  - **NAS updated to `30237a7`**: images built on the Mac, hash checked, snapshot taken, compose installed.
  - **Tunnel routes and DNS** via the Cloudflare API ([infra/cloudflare/tunnel-hostnames.py](../infra/cloudflare/tunnel-hostnames.py)): `shootspot-api.expose-u.com` → `:4400` and `shootspot-media.expose-u.com` → `:4402`. The other 9 routes on the shared `TrueNas` tunnel are unchanged (verified). `https://shootspot-api.expose-u.com/ready` → ok.
  - **NAS `.env`** (owner Block 3): `PUBLIC_API_URL`, `S3_PUBLIC_ENDPOINT` and `CLIENT_IP_HEADER=cf-connecting-ip`; the admin stays LAN-only.

  Everything, including how to change it, is in [docs/runbooks/public-endpoints.md](../docs/runbooks/public-endpoints.md) (internal; not on the docs site). **→ windows:** `infra/nas/.env.example` already uses these names. EAS production `EXPO_PUBLIC_API_URL=https://shootspot-api.expose-u.com` is set (the owner logged in on the Mac). Checked from the Mac: public `/ready` and `/v1/legal` 200, `/v1/feed` 401, `/api/auth/ok` 200; LAN API and admin unchanged; no admin on the public host. HANDWORK 4.6 is done. Owner test builds keep the LAN URL; their photo links now go through `shootspot-media.expose-u.com`. **Owner confirmed on the iPhone: Feed and photos load through the public media host.**

- 2026-10-17 mac: **iOS rebuilt at `17af7e6` (polish round `43acc49` + camera permission fix `55c0c32`)**; installed and running. The compiled `Info.plist` has `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` and `NSLocationWhenInUseUsageDescription`. Reanimated/Worklets pods linked; the AppIcon is still P3. The NAS has the likes routes (`PUT /v1/records/:id/like` → 401, not 404). **Mac fix:** `ui/chrome.tsx` `useAnimatedScrollHandler(…, [onScrollY])` logged "[Reanimated] Dependencies should only be used on the web"; dropped the array. **→ windows:** with Mailpit stopped (real email via Brevo), `tools/phone-e2e.mjs` can't read sign-in codes on the NAS. It needs a test-only code path, a test mailbox it can read, or it should only run against the local stack. Also reformatted this file (Prettier was failing on it).

- 2026-10-17 windows: **Phase 5 closed on the engineering side.**
  - NAS restore rehearsal passed (identical counts).
  - Android device checks all pass: largest font, TalkBack and the camera.
  - The oldest NAS image is removed.

  Still open, all waiting on the owner's accounts: counsel review (5.5), real email and HTTPS (5.14). The compass test (5.13) is deferred. Next is Phase 6 prep with the owner: domain and Cloudflare, Brevo, then store accounts. → mac: when the iOS rebuild from `55c0c32` is done, run the same three checks (largest text, VoiceOver, camera) and log them.

- 2026-10-17 windows → mac: **Please rebuild iOS from `55c0c32`.** `expo-image-picker`'s `cameraPermission: false` (in app.json since `8f4a00d`) blocked the camera:
  - **Android:** it stripped `android.permission.CAMERA`, so the camera showed "Camera access" even with permission granted (fixed and confirmed on the Android build).
  - **iOS:** the same option can drop `NSCameraUsageDescription`. Check that the camera opens on your current build; either way, rebuild (`prebuild --clean`) so the Info.plist has the camera text again.

  Also: after any `pnpm add`, restart Metro with `--clear`. A Metro started before installing Phosphor can't resolve `phosphor-react-native/src/icons/*` and shows a white screen.

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
