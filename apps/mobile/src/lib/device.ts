import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Google Maps on Android crashes the whole app when the build has no API key (HANDWORK 3.4).
 * iOS uses Apple Maps and needs none. Screens show a fallback instead of a map when this is false.
 */
export const mapsAvailable =
  Platform.OS !== 'android' || Boolean(Constants.expoConfig?.android?.config?.googleMaps?.apiKey);

/** Haptics are a nicety: never let a failure (e.g. a JS/native version mismatch) surface. */
function safely(run: () => Promise<void>) {
  try {
    run().catch(() => {});
  } catch {}
}

export const haptics = {
  selection: () => safely(() => Haptics.selectionAsync()),
  light: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
};
