import { Ionicons } from '@expo/vector-icons';
import { formatCoordinates, distanceMeters } from '@shootspot/shared';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '../../capture/context';
import { radius, space, useTheme } from '../../theme/tokens';
import { Body, Button, Mono } from '../../ui';

const DELTA = 0.004; // ~400 m across: street level

/**
 * Confirm or correct the pin (plan journey 4, D-15). The map moves under a fixed centre pin; GPS
 * is a suggestion, search and manual placement always work, even without location permission.
 */
export default function PinScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, update } = useCapture();
  const map = useRef<MapView>(null);
  const gps = state.gps;
  const start =
    state.pin ?? (gps ? { lat: gps.lat, lon: gps.lon } : { lat: 38.7223, lon: -9.1393 });
  const [center, setCenter] = useState({ lat: start.lat, lon: start.lon });
  const [source, setSource] = useState<'gps' | 'manual' | 'search'>(
    state.pin?.source ?? (gps ? 'gps' : 'manual'),
  );
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const moveTo = (lat: number, lon: number) =>
    map.current?.animateToRegion(
      { latitude: lat, longitude: lon, latitudeDelta: DELTA, longitudeDelta: DELTA },
      350,
    );

  function onRegionChangeComplete(r: Region) {
    const next = { lat: r.latitude, lon: r.longitude };
    setCenter(next);
    if (source === 'gps' && gps && distanceMeters(gps.lat, gps.lon, next.lat, next.lon) > 3)
      setSource('manual');
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const [hit] = await Location.geocodeAsync(query.trim());
      if (!hit) return setSearchError('No place found. Try a different name or move the map.');
      setSource('search');
      moveTo(hit.latitude, hit.longitude);
    } catch {
      setSearchError('Search is unavailable right now. Move the map instead.');
    } finally {
      setSearching(false);
    }
  }

  async function confirm() {
    setBusy(true);
    let label = state.label;
    if (!label) {
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: center.lat,
          longitude: center.lon,
        });
        label = [place?.name, place?.district ?? place?.city]
          .filter(Boolean)
          .join(', ')
          .slice(0, 120);
      } catch {}
    }
    update({
      pin: {
        lat: center.lat,
        lon: center.lon,
        accuracyM: source === 'gps' ? (gps?.accuracyM ?? null) : null,
        source,
      },
      label,
    });
    setBusy(false);
    router.push('/capture/details');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ flex: 1 }}>
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: start.lat,
            longitude: start.lon,
            latitudeDelta: DELTA,
            longitudeDelta: DELTA,
          }}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation={Boolean(gps)}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        />
        {/* Fixed centre pin: its tip marks the location. */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <Ionicons
            name="location-sharp"
            size={40}
            color={t.signalRed}
            style={{ marginTop: -40 }}
          />
        </View>
        <View style={[styles.search, { backgroundColor: t.raised, borderColor: t.divider }]}>
          <Ionicons name="search" size={18} color={t.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search a place"
            placeholderTextColor={t.muted}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            editable={!searching}
            accessibilityLabel="Search a place"
            style={{ flex: 1, color: t.ink, fontSize: 16, minHeight: 44 }}
          />
        </View>
        {gps ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my GPS position"
            onPress={() => {
              setSource('gps');
              moveTo(gps.lat, gps.lon);
            }}
            style={[styles.gpsButton, { backgroundColor: t.raised, borderColor: t.divider }]}
          >
            <Ionicons name="locate" size={22} color={t.ink} />
          </Pressable>
        ) : null}
      </View>
      <View
        style={{
          padding: space.lg,
          paddingBottom: insets.bottom + space.lg,
          gap: space.sm,
          backgroundColor: t.canvas,
        }}
      >
        <Mono style={{ fontSize: 13 }}>
          {formatCoordinates(center.lat, center.lon, 5)}
          {source === 'gps' && gps?.accuracyM != null ? `  ±${Math.round(gps.accuracyM)} m` : ''}
        </Mono>
        <Body muted>
          {searchError ??
            (source === 'gps'
              ? 'Pinned from your GPS. Move the map if the spot is off.'
              : gps
                ? 'Placed by hand. Move the map until the pin is on the spot.'
                : 'Location is off. Search for the place or move the map to put the pin on the spot.')}
        </Body>
        <Button label="Confirm location" busy={busy} onPress={() => void confirm()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pinWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  gpsButton: {
    position: 'absolute',
    right: space.md,
    bottom: space.md,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
