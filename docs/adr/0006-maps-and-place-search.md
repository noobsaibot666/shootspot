# ADR 0006 — Maps and place search

**Status:** Accepted (from decisions D-18 and D-21) · 2026-10-16

## Decision

- **react-native-maps**, using the platform default provider: **Apple Maps on iOS** (no key needed) and **Google Maps on Android** (needs a Maps SDK for Android API key, restricted to the app's package name and signing certificate).
- **Place search:** MapKit local search on iOS. On Android, Google Places Autocomplete (New) with session tokens and a **monthly budget cap**.
- **Reverse geocoding** for the record label uses the OS geocoder on each platform (`expo-location`'s `reverseGeocodeAsync`). The member can edit the result.
- **Theming:** Google Maps gets a JSON style matching the light and dark tokens. Apple Maps uses its standard light and dark appearance, so we accept the visual difference.

## Revisit when

- Android Places costs exceed the cap during the pilot, or
- users report inconsistent results between platforms.

Either would trigger a move to a single geocoder routed through the API.
