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
| Phase              | 1: technical proof (camera spike built, awaiting device tests)                                                                     |
| Latest commit      | see `git log -1`                                                                                                                   |
| Expo project       | `@expose.u/shootspot` (ID `43d5bfac-52db-4815-999f-6cd2336d405b`)                                                                  |
| ai-memory          | Windows: local server, Claude Code wired. Mac: not yet; shared NAS server planned                                                  |
| Server folder      | `/Volumes/Gaia/04_DEV/_personal/shootspot` (created; `runtime/` is hidden from SMB by design, see docs/runbooks/server-folders.md) |
| Android build      | not yet built                                                                                                                      |
| iOS build          | blocked: iPhone is on iOS 27.2 beta, Mac has Xcode 26.4 (needs Xcode 27 beta)                                                      |
| Backend for phones | local only; TrueNAS deployment not started                                                                                         |

## Open requests

- 2026-10-16 → mac: **First iOS development build of the camera spike.** Steps:
  1. Install Xcode (latest) from the App Store, open it once, and accept the licence.
  2. Install Node 24 and pnpm 11 (`corepack enable && corepack prepare pnpm@11.22.0 --activate`).
  3. `git clone https://github.com/noobsaibot666/shootspot.git && cd shootspot && pnpm install`
  4. Plug in the iPhone, trust the Mac, and turn on **Developer Mode** on the iPhone (Settings → Privacy & Security).
  5. `cd apps/mobile && npx expo run:ios --device`. Pick the iPhone. In Xcode, set Signing to your Apple ID team if it asks.
  6. Run the [camera test plan](../docs/runbooks/camera-spike-test-plan.md) and put the results in `state/reports/camera-ios.md`.
  7. Log the iPhone model, iOS version, Xcode version, and any build errors below.
  8. **App icon check:** on the iPhone home screen, compare the icon with `shared/design/app-icon/Group 15.png`. `icon.png` holds the designer's Display P3 colours with a P3 profile tag, and the colours should look as vivid as in Figma. If they look dull or shifted, report it here.

## Log

- 2026-10-16 mac: **First iOS build attempt: blocked, request stays open.** Mac has Xcode 26.4 (17E192, iOS SDK 26.4), Node 24.10.0, pnpm 11.22.0. The iPhone is an iPhone 16 Pro Max (iPhone17,2) on **iOS 27.2 beta (24B5099f)**, paired, with Developer Mode on. `pnpm install` and `expo prebuild` + CocoaPods succeeded. `npx expo run:ios --device` failed before compiling: `xcodebuild` exit 70, "Timed out waiting for all destinations… The developer disk image could not be mounted on this device." Cause: Xcode 26.4 can't deploy to iOS 27.x. Fix (owner, see HANDWORK 1.3): install the Xcode 27 beta that supports iOS 27.2, then rerun step 5. Also seen: Expo auto-picked the "3rd Party Mac Developer Application" identity for signing. If the next build fails on signing, choose the "Apple Development" identity / team RD7UU4Z3D2 in Xcode. App icon check: not possible until the app installs. Both `apps/mobile/assets/icon.png` (1024², no alpha) and the reference `Group 15.png` (in the server folder `shared/design/app-icon/`, not the repo) are tagged Display P3. Camera tests (step 6): not started.

- 2026-10-16 windows: Linked the EAS project. Installed ai-memory 3.1.0 on Windows (Claude Code only). Defined the server folder layout.
- 2026-10-16 windows: Created this handoff file. Phase 1 code is on `main` (`2b49e4a`).
