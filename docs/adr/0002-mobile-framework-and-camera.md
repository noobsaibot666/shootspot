# ADR 0002 — Mobile framework and camera

**Status:** Accepted, pending the device spike · 2026-10-16

## Context

The plan (§7) recommends React Native with small native camera modules. The camera needs:

- tap-to-focus
- exposure bias
- lens and zoom switching
- torch and flash
- device orientation
- a live crop guide (16:9 or 1:1, D-13)

We develop on Windows, so iOS binaries need a cloud build or a Mac.

## Decision

- **Expo SDK 58** with Continuous Native Generation: `ios/` and `android/` are generated and never committed, and native configuration lives in `app.json` and config plugins. **EAS Build** produces development and store builds for both platforms from Windows.
- **react-native-vision-camera v5** (Nitro modules) provides the camera. It wraps AVFoundation and CameraX and exposes everything the spike needs. We write our own Swift/Kotlin module only where the spike proves a gap.
- The UI is **locked to portrait**. Icons rotate with `useOrientation('device')`, as native camera apps do. The crop mask is computed with the shared `centerCrop` rules, so the preview, the client crop and the server validation agree.
- **expo-location** provides GPS and heading. **expo-image-manipulator** crops and re-encodes the capture to JPEG.

## Known risk to verify in the spike

**Heading while the phone is upright.** OS compass headings describe where the top of the device points when it lies flat. On iOS, Core Location compensates when the device is held upright. On Android, the heading may be unstable or wrong unless the rotation vector is remapped to the camera axis (`SensorManager.remapCoordinateSystem(AXIS_X, AXIS_Z)`). If the spike confirms this, we add a small Kotlin Expo module that returns the camera azimuth.

## Consequences

- The camera spike app runs only in a **development build**, not in Expo Go.
- Android development builds come from EAS on the Windows machine. **iOS builds are made locally on the macOS machine** (`npx expo run:ios --device`; a free Apple ID is enough for on-device testing). The Apple Developer Program is needed only for TestFlight and the App Store. The two machines coordinate through [state/windows-macos-handoff.md](../../state/windows-macos-handoff.md).
