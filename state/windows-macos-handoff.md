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

| Item               | Value                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase              | 3 built (capture/publish app); waiting on device tests. NAS deploy pending owner answer                                            |
| Latest commit      | see `git log -1`                                                                                                                   |
| Expo project       | `@expose.u/shootspot` (ID `43d5bfac-52db-4815-999f-6cd2336d405b`)                                                                  |
| ai-memory          | Windows: local server, Claude Code wired. Mac: not yet; shared NAS server planned                                                  |
| Server folder      | `/Volumes/Gaia/04_DEV/_personal/shootspot` (created; `runtime/` is hidden from SMB by design, see docs/runbooks/server-folders.md) |
| Android build      | not yet built                                                                                                                      |
| iOS build          | Phase 3 dev build (`69ff6a7`) installed on iPhone 16 Pro Max (iOS 27.2 beta), Xcode 27.1; flow tests pending                       |
| Backend for phones | local only; TrueNAS deployment not started                                                                                         |

## Open requests

- 2026-10-16 → mac: **Switch the iPhone to the NAS backend.** In `apps/mobile/.env`, set `EXPO_PUBLIC_API_URL=http://192.168.178.146:4400`, then restart Metro with `npx expo start --dev-client --clear` (the env value is baked into the bundle, so `--clear` is required) and reload the app. No rebuild needed. The old session token belongs to the PC backend: the app signs out on the first 401, then the owner signs in again; codes appear at `http://192.168.178.146:4403`. The NAS database is fresh, so onboarding runs again. Log "done" here.

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
