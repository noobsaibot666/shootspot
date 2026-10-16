# iOS Phase 3 run: console report

- **Date:** 2026-10-16
- **Device:** iPhone 16 Pro Max, iOS 27.2 beta (24B5099f)
- **Build:** Debug dev build of `69ff6a7`, Xcode 27.1, Metro on the Mac
- **API:** Windows PC `http://192.168.178.63:4000`
- **Capture:** `xcrun devicectl device process launch --console` with `OS_ACTIVITY_DT_MODE=enable` (app stdout plus os_log), 17:29:04–17:31:46
- **Owner's run:** add email → receive code → sign in → take photo → enter photo data → preview. No crash, no JS exception, and no failed network request appeared in the log.

## App issues

### 1. setState during render in the capture review screen (fix this)

```
[javascript] Cannot update a component (`RoutingQueueProvider`) while rendering a different
component (`Review(./capture/review.tsx)`). To locate the bad setState() call inside
`Review(./capture/review.tsx)`, follow the stack trace as described in
https://react.dev/link/setstate-in-render
```

Logged once, at 17:30:41, when the camera reopened after the review screen. Cause: [review.tsx:15-18](../../apps/mobile/src/app/capture/review.tsx#L15-L18) calls `router.replace('/capture')` during render when `state.photo` is empty. Suggested fix: `if (!photo) return <Redirect href="/capture" />;` (from `expo-router`), or do the replace in a `useEffect`.

### 2. VisionCamera: `UIInterfaceOrientation is .unknown!` (watch)

Logged twice at 17:31:46, as the camera screens were torn down (`Removing output` at 17:31:34 and 17:31:36). It's harmless at teardown. If C12/C13 orientation results look wrong on the iPhone, start here.

## Known noise (no action needed)

- `-[UIApplication statusBarStyle] API has been deprecated and is a no-op on 27.0`: many times. React Native's status bar on iOS 27. Fixed upstream eventually; nothing to do in our code.
- `[API] cannot add handler to 0 from 0 - dropping` and `CAMetalLayer ignoring invalid setDrawableSize width=0`: UIKit and Metal layout noise.
- Sandbox denials, which iOS returns to every third-party app: `PerfPowerTelemetryClientRegistrationService … Sandbox restriction`, `PPSClientDonation … Maps / SpringfieldUsage`, `com.apple.CoreMotion.plist … permission`, `runningboard … Client not entitled`, `kern.bootsessionuuid`.
- `[ResourceManifest] Failed to locate resource named "default.csv"` / `fopen failed for data file`: from MapKit.
- `DevLauncher discovered a dev server but couldn't resolve its endpoint (CancellationError)` and `nw_connection … after cancel`: dev-client discovery at launch. The app connected to Metro anyway.
- `Sending onAnimatedValueUpdate with no listeners registered` and `instanceHandle is null, event … will be dropped`: React Native dev warnings when a screen unmounts.
