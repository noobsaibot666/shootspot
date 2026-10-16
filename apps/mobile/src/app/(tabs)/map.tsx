import { Icon, type IconName } from '../../ui/icon';
import type { MapPin } from '@shootspot/shared';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { mapsAvailable } from '../../lib/device';
import { mediaSource } from '../../lib/images';
import { filterQuery, scopeLabel, useScope } from '../../lib/scope';
import { radius, space, useTheme } from '../../theme/tokens';

interface Cluster {
  key: string;
  lat: number;
  lon: number;
  pins: MapPin[];
}

/** Simple grid clustering in screen space: ~8 cells across the visible width. */
function cluster(pins: MapPin[], region: Region): Cluster[] {
  const cell = region.longitudeDelta / 8;
  const cells = new Map<string, Cluster>();
  for (const p of pins) {
    const key = `${Math.floor(p.lon / cell)}:${Math.floor(p.lat / cell)}`;
    const c = cells.get(key) ?? { key, lat: 0, lon: 0, pins: [] };
    c.pins.push(p);
    cells.set(key, c);
  }
  for (const c of cells.values()) {
    c.lat = c.pins.reduce((s, p) => s + p.lat, 0) / c.pins.length;
    c.lon = c.pins.reduce((s, p) => s + p.lon, 0) / c.pins.length;
  }
  return [...cells.values()];
}

/** Map tab (plan journey 2): clustered pins with an image preview card. */
export default function MapTab() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { scope, center, here, refreshHere } = useScope();
  const map = useRef<MapView>(null);
  const start = center ?? here;
  // Without a place, start Europe-wide rather than on an arbitrary city.
  const [region, setRegion] = useState<Region>(
    start
      ? { latitude: start.lat, longitude: start.lon, latitudeDelta: 0.3, longitudeDelta: 0.3 }
      : { latitude: 50, longitude: 10, latitudeDelta: 30, longitudeDelta: 30 },
  );

  // If location access was already granted (e.g. for capture), start where the member is,
  // without prompting: the prompt stays tied to choosing "Nearby".
  useEffect(() => {
    if (start) return;
    void (async () => {
      try {
        if (!(await Location.getForegroundPermissionsAsync()).granted) return;
        const last = await Location.getLastKnownPositionAsync();
        if (last)
          map.current?.animateToRegion(
            {
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
              latitudeDelta: 0.3,
              longitudeDelta: 0.3,
            },
            0,
          );
      } catch {}
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pins, setPins] = useState<MapPin[]>([]);
  const [selected, setSelected] = useState<MapPin | null>(null);
  const [truncated, setTruncated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (r: Region) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const box = {
          minLat: Math.max(-90, r.latitude - r.latitudeDelta / 2),
          maxLat: Math.min(90, r.latitude + r.latitudeDelta / 2),
          minLon: Math.max(-180, r.longitude - r.longitudeDelta / 2),
          maxLon: Math.min(180, r.longitude + r.longitudeDelta / 2),
        };
        const f = filterQuery(scope);
        try {
          const res = await api<{ items: MapPin[]; truncated: boolean }>(
            `/v1/map?minLat=${box.minLat}&minLon=${box.minLon}&maxLat=${box.maxLat}&maxLon=${box.maxLon}${f ? `&${f}` : ''}`,
          );
          setPins(res.items);
          setTruncated(res.truncated);
        } catch {}
      }, 350);
    },
    [scope],
  );

  useEffect(() => load(region), [load]); // eslint-disable-line react-hooks/exhaustive-deps
  // Follow the scope when it changes (filters sheet).
  useEffect(() => {
    if (center)
      map.current?.animateToRegion(
        { latitude: center.lat, longitude: center.lon, latitudeDelta: 0.2, longitudeDelta: 0.2 },
        400,
      );
  }, [center]);

  const clusters = useMemo(() => cluster(pins, region), [pins, region]);

  if (!mapsAvailable)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: t.canvas,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.xl,
          gap: space.md,
        }}
      >
        <Icon name="map" size={40} color={t.muted} />
        <Text style={{ color: t.ink, fontSize: 17, fontWeight: '600' }}>Map coming soon</Text>
        <Text style={{ color: t.muted, fontSize: 15, textAlign: 'center' }}>
          The map isn't available in this build yet. Browse locations in the Feed.
        </Text>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          load(r);
        }}
        onPress={() => setSelected(null)}
        showsUserLocation={Boolean(here)}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
      >
        {clusters.map((c) =>
          c.pins.length === 1 ? (
            <Marker
              key={c.pins[0]!.id}
              coordinate={{ latitude: c.lat, longitude: c.lon }}
              tracksViewChanges={false}
              onPress={(e) => {
                e.stopPropagation();
                setSelected(c.pins[0]!);
              }}
              accessibilityLabel={c.pins[0]!.label}
            >
              <View style={[styles.dot, { backgroundColor: t.signalRed, borderColor: '#fff' }]} />
            </Marker>
          ) : (
            <Marker
              key={c.key}
              coordinate={{ latitude: c.lat, longitude: c.lon }}
              tracksViewChanges={false}
              onPress={(e) => {
                e.stopPropagation();
                map.current?.animateToRegion(
                  {
                    latitude: c.lat,
                    longitude: c.lon,
                    latitudeDelta: region.latitudeDelta / 3,
                    longitudeDelta: region.longitudeDelta / 3,
                  },
                  300,
                );
              }}
              accessibilityLabel={`${c.pins.length} locations`}
            >
              <View style={styles.cluster}>
                <Text style={styles.clusterText}>{c.pins.length}</Text>
              </View>
            </Marker>
          ),
        )}
      </MapView>

      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: space.lg,
          right: space.lg,
          flexDirection: 'row',
          gap: space.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Filters: ${scopeLabel(scope, Boolean(center))}`}
          onPress={() => router.push('/filters')}
          style={[styles.chip, { backgroundColor: t.scrim }]}
        >
          <Icon name="filters" size={16} color={t.ink} />
          <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
            {scope.goodFor.length + scope.bestLight.length
              ? scopeLabel(scope, Boolean(center)).split(' · ').slice(-1)[0]
              : 'Filters'}
          </Text>
        </Pressable>
        {truncated ? (
          <View style={[styles.chip, { backgroundColor: t.scrim }]}>
            <Text style={{ color: t.muted, fontSize: 13 }}>Zoom in to see all</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show my location"
        onPress={async () => {
          await refreshHere().catch(() => {});
          if (here)
            map.current?.animateToRegion(
              {
                latitude: here.lat,
                longitude: here.lon,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              },
              400,
            );
        }}
        style={[styles.locate, { top: insets.top + 8, backgroundColor: t.scrim }]}
      >
        <Icon name="locate" size={22} color={t.ink} />
      </Pressable>

      {selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${selected.label}`}
          onPress={() => router.push(`/records/${selected.id}`)}
          style={[
            styles.preview,
            { bottom: insets.bottom + 96, backgroundColor: t.surface, borderColor: t.divider },
          ]}
        >
          <Image
            source={mediaSource(selected.thumb)}
            style={{ width: 112, height: 63, borderRadius: 8, backgroundColor: '#000' }}
            contentFit="cover"
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>
              {selected.label}
            </Text>
            <Text style={{ color: t.muted, fontSize: 13 }}>View location</Text>
          </View>
          <Icon name="forward" size={20} color={t.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  cluster: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(17,17,17,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  clusterText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    minHeight: 40,
    maxWidth: '75%',
  },
  locate: {
    position: 'absolute',
    right: space.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
