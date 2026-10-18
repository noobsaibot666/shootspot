# Store builds (local, no EAS cloud)

The owner wants every build made locally (2026-10-17). iOS is built on the Mac and Android on the Windows PC. Store builds talk to `https://shootspot-api.expose-u.com` (D-33) and have no plain-HTTP exception. Test builds keep the LAN/Tailscale URL from `apps/mobile/.env`.

## Before every upload

- Bump the build number in `apps/mobile/app.json`: `ios.buildNumber` (string) for App Store Connect and `android.versionCode` (integer) for Play. Each store rejects a number it has already seen. Commit the bump.
- `pnpm format:check && pnpm typecheck && pnpm test` pass on the commit you build.
- The NAS runs images that match the commit, or at least nothing the app needs is missing (check `/ready` and any new routes).

## iOS (Mac)

Bundle ID `com.exposeu.shootspot` (D-36), team `RD7UU4Z3D2`.

1. `git pull && pnpm install`.
2. In the shell, set `EXPO_PUBLIC_API_URL=https://shootspot-api.expose-u.com` and `EXPO_PUBLIC_SENTRY_DSN` (the production value from EAS). Shell values win over `apps/mobile/.env`.
3. `cd apps/mobile && npx expo prebuild --platform ios --clean`.
4. Archive with `xcodebuild archive` (`-allowProvisioningUpdates`), then `xcodebuild -exportArchive` with an export options plist using `destination upload` and automatic signing (cloud-managed distribution certificate). Output goes to `apps/mobile/build-store/` (gitignored).
5. The build appears in TestFlight after processing. Listing and review details go through `tools/asc.mjs` and `tools/asc-listing.mjs` (team API key in `~/.appstoreconnect`, never committed).

**Dev builds on a device:** `npx expo run:ios --device` can fail signing ("No profiles for …") because Expo doesn't pass `-allowProvisioningUpdates`. Build directly instead:

```sh
cd apps/mobile/ios
xcodebuild -workspace ShootSpot.xcworkspace -scheme ShootSpot -configuration Debug \
  -destination id=<UDID> -derivedDataPath build DEVELOPMENT_TEAM=RD7UU4Z3D2 \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
xcrun devicectl device install app --device <UDID> build/Build/Products/Debug-iphoneos/ShootSpot.app
```

For a Release build without a Sentry upload, add `SENTRY_DISABLE_AUTO_UPLOAD=true`.

## Android (Windows)

Package `com.shootspot.app`. Play signs the app with its own key (Play App Signing); we sign the upload with the EAS upload keystore.

**One-time setup:**

1. Download the upload keystore from EAS: `cd apps/mobile && npx eas-cli credentials -p android` → **production** → **Keystore** → **Download**. It saves the `.jks` and prints the keystore password, key alias and key password. Move the `.jks` to `%USERPROFILE%\.shootspot\` (outside the repo) and save the passwords in the password manager.
2. Copy `apps/mobile/.env.store.example` to `apps/mobile/.env.store` (gitignored) and fill it in: the keystore path and passwords, plus `EXPO_PUBLIC_SENTRY_DSN` from EAS (production).

**Each upload:**

```powershell
powershell -File tools/android-local.ps1 -Store
```

This regenerates `android/` with the HTTPS URL, builds `bundleRelease` for all ABIs, signs it with the upload key, and writes `apps/mobile/build-store/shootspot-<version>-<versionCode>.aab`. Upload that file in Play Console (internal testing first). The next normal run of the script regenerates `android/` for test builds automatically.

**After the first upload:** copy the **App signing key** SHA-1 from Play Console → App integrity, and add it to the Google Maps key `shootspot-android` (HANDWORK 3.4 step 6). Until then, the Map tab is blank in apps installed from Play.

R8 shrinking stays off for v1 (backlog 5.15). The bundle is larger but behaves the same as the tested release APKs.
