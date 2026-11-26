import { daylightSummary } from '@shootspot/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { ScoutCompassOverlay } from '../capture/scout-compass';
import { useFieldSensors } from '../capture/sensors';
import { camera as c, font, radius, space, type } from '../theme/tokens';
import { Icon } from '../ui/icon';

/**
 * Live Scout Compass launched from Location Detail ("Preview Sun Here").
 * Supports scrubbing future dates/times and validates live compass heading accuracy.
 */
export default function CompassScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    lat?: string;
    lon?: string;
    label?: string;
    date?: string;
    bearing?: string;
  }>();

  const lat = Number(params.lat);
  const lon = Number(params.lon);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  const targetBearingDeg =
    params.bearing != null && Number.isFinite(Number(params.bearing))
      ? Number(params.bearing)
      : null;

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (params.date) {
      const parsed = new Date(params.date);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const [preview, setPreview] = useState<LayoutRectangle | null>(null);

  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const sensors = useFieldSensors(true);

  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);

  const paramFix = useMemo(() => (hasCoords ? { lat, lon } : null), [hasCoords, lat, lon]);
  const activeFix = paramFix ?? sensors.fix;
  const summary = useMemo(
    () => (activeFix ? daylightSummary(selectedDate, activeFix.lat, activeFix.lon) : null),
    [activeFix, selectedDate],
  );

  function shiftDays(delta: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  function shiftMinutes(delta: number) {
    setSelectedDate((prev) => new Date(prev.getTime() + delta * 60_000));
  }

  function setSeasonPreset(monthIndex: number, day: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setMonth(monthIndex, day);
      return next;
    });
  }

  function setToInstant(d: Date | null | undefined) {
    if (!d || Number.isNaN(d.getTime())) return;
    setSelectedDate(new Date(d));
  }

  const calOk =
    sensors.headingAccuracy != null &&
    sensors.headingAccuracy >= 0 &&
    sensors.headingAccuracy <= 15;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Top Bar */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: space.md,
          paddingBottom: space.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
          zIndex: 10,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close compass"
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.closeBtn}
        >
          <Icon name="close" size={20} color={c.control} />
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[type.bodyStrong, { color: c.control }]} numberOfLines={1}>
            {params.label ?? 'Live Scout Compass'}
          </Text>
          <Text
            style={{
              color: calOk ? '#30D158' : '#FFB800',
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: '600',
            }}
          >
            {sensors.headingDeg == null
              ? 'Waiting for compass…'
              : calOk
                ? `Calibrated (±${Math.round(sensors.headingAccuracy!)}°)`
                : 'Low accuracy — move phone in a figure-8'}
          </Text>
        </View>

        <View style={{ width: 38 }} />
      </View>

      {/* Camera / Compass Viewfinder */}
      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={(e) => setPreview(e.nativeEvent.layout)}
      >
        {hasPermission && device ? (
          <Camera style={StyleSheet.absoluteFill} isActive device={device} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0C0C0E' }]} />
        )}

        {preview ? (
          <ScoutCompassOverlay
            preview={preview}
            fix={activeFix}
            headingDeg={sensors.headingDeg}
            headingAccuracy={sensors.headingAccuracy}
            date={selectedDate}
            targetBearingDeg={targetBearingDeg}
          />
        ) : null}
      </View>

      {/* Future-Date & Time Controls */}
      <View
        style={{
          backgroundColor: c.panel,
          paddingHorizontal: space.md,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.md,
          gap: space.sm,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text
            style={{ color: c.control, fontFamily: font.mono, fontSize: 14, fontWeight: '700' }}
          >
            {selectedDate.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}{' '}
            · {selectedDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => shiftDays(-1)}
              style={styles.pillBtn}
            >
              <Text style={styles.pillText}>−1d</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next day"
              onPress={() => shiftDays(1)}
              style={styles.pillBtn}
            >
              <Text style={styles.pillText}>+1d</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="1 hour earlier"
              onPress={() => shiftMinutes(-60)}
              style={styles.pillBtn}
            >
              <Text style={styles.pillText}>−1h</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="1 hour later"
              onPress={() => shiftMinutes(60)}
              style={styles.pillBtn}
            >
              <Text style={styles.pillText}>+1h</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {[
            { label: 'Today', onPress: () => setSelectedDate(new Date()) },
            { label: 'Jun 21', onPress: () => setSeasonPreset(5, 21) },
            { label: 'Dec 21', onPress: () => setSeasonPreset(11, 21) },
            { label: 'Sunrise', onPress: () => setToInstant(summary?.sunrise) },
            { label: 'Golden PM', onPress: () => setToInstant(summary?.goldenHour) },
            { label: 'Sunset', onPress: () => setToInstant(summary?.sunset) },
          ].map((b) => (
            <Pressable
              key={b.label}
              accessibilityRole="button"
              onPress={b.onPress}
              style={styles.presetBtn}
            >
              <Text style={styles.presetText}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  pillText: {
    color: c.control,
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: '700',
  },
  presetBtn: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: radius.control,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  presetText: {
    color: c.control,
    fontSize: 12,
    fontWeight: '600',
  },
});
