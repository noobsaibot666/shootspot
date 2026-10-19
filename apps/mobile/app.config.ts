import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with values that differ per environment and must never be committed:
 * - EXPO_PUBLIC_API_URL: the API the app talks to (inlined into the JS bundle at build time).
 * - GOOGLE_MAPS_ANDROID_KEY: Maps SDK for Android key (HANDWORK 3.4), restricted to the app's
 *   package and signing certificate. iOS uses Apple Maps and needs no key.
 *
 * Plain-HTTP exception: only when the API itself is plain http (the NAS on the home network or
 * via Tailscale, before the domain exists). Release builds block cleartext by default; builds
 * pointing at an https API (TestFlight, Play, stores) get no exception at all.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
const cleartext = apiUrl.startsWith('http://');

/**
 * R8 shrinking (Expo SDK 58's release default) is off for now. It removed WorkManager's generated
 * Room database (the app crashed at start: "Failed to create an instance of class
 * androidx.work.impl.WorkDatabase"), and Expo warns that it can rename enum values that cross to
 * JavaScript. The keep rules below stay for when shrinking is turned back on (backlog: re-enable
 * with full keep rules and a release smoke test before store builds).
 */
const PROGUARD_RULES = [
  '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
  '-keep class **_Impl { <init>(); }',
].join('\n');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    infoPlist: {
      ...config.ios?.infoPlist,
      ...(cleartext ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
    },
  },
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' },
    },
  },
  plugins: [
    ...(config.plugins ?? []),
    './plugins/with-p3-app-icon',
    // iOS only: widgets and Control Center controls (targets/widget), Siri phrases (native/ios).
    '@bacons/apple-targets',
    './plugins/with-app-shortcuts',
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: cleartext,
          enableMinifyInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
          extraProguardRules: PROGUARD_RULES,
        },
      },
    ],
  ],
});
