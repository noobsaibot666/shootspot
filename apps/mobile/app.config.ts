import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with values that differ per environment and must never be committed:
 * - EXPO_PUBLIC_API_URL: the API the app talks to (inlined into the JS bundle at build time).
 * - GOOGLE_MAPS_ANDROID_KEY: Maps SDK for Android key (HANDWORK 3.4), restricted to the app's
 *   package and signing certificate. iOS uses Apple Maps and needs no key.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? '' },
    },
  },
  plugins: [...(config.plugins ?? []), './plugins/with-p3-app-icon'],
});
