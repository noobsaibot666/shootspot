import {
  formatBearing,
  formatCoordinates,
  formatSun,
  lightAngle,
  sunAtCapture,
} from '@shootspot/shared';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { camera as c, font, radius, space } from '../theme/tokens';
import type { CaptureResult } from './CameraScreen';

/**
 * Spike review: shows exactly what would be published plus the raw measurements the device test
 * plan asks testers to record (crop dimensions, GPS accuracy, heading vs. a reference compass).
 */
export function ReviewScreen({ result, onRetake }: { result: CaptureResult; onRetake(): void }) {
  const { width } = useWindowDimensions();
  const aspect = result.width / result.height;
  const sun = result.fix ? sunAtCapture(result.capturedAt, result.fix.lat, result.fix.lon) : null;

  const rows: [string, string][] = [
    [
      'Publishable',
      result.check.ok ? `yes · ${result.check.framing}` : `NO · ${result.check.reason}`,
    ],
    ['Output', `${result.width} × ${result.height}`],
    ['Source (upright)', `${result.source.width} × ${result.source.height}`],
    ['Held', result.heldSideways ? 'sideways' : 'upright'],
    ['Captured', result.capturedAt.toISOString()],
    [
      'Pin',
      result.fix
        ? `${formatCoordinates(result.fix.lat, result.fix.lon, 5)} ±${Math.round(result.fix.accuracyM ?? 0)} m`
        : 'no GPS fix — manual pin needed',
    ],
    ['Altitude', result.fix?.altitudeM != null ? `${Math.round(result.fix.altitudeM)} m` : '—'],
    [
      'Camera points',
      result.headingDeg != null
        ? `${formatBearing(result.headingDeg)} (acc ${result.headingAccuracy ?? '?'})`
        : '—',
    ],
    ['Sun', sun ? formatSun(sun) : '—'],
    ['Light', sun && result.headingDeg != null ? lightAngle(result.headingDeg, sun) : '—'],
    [
      'Lens',
      `${result.lens.position} · zoom ${result.lens.zoom?.toFixed(2) ?? '?'} · f ${result.lens.focalLength?.toFixed(1) ?? '?'} mm`,
    ],
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Image
        source={{ uri: result.uri }}
        style={{ width, height: width / aspect }}
        resizeMode="contain"
        accessibilityLabel="Captured photo, as it will be published"
      />
      <View style={styles.table}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value} selectable>
              {v}
            </Text>
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={onRetake} style={styles.button}>
        <Text style={styles.buttonText}>Retake</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { paddingTop: 48, paddingBottom: 48, gap: space.lg },
  table: { paddingHorizontal: space.lg, gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  key: { color: c.controlMuted, fontSize: 13 },
  value: {
    color: c.control,
    fontFamily: font.mono,
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'right',
  },
  button: {
    alignSelf: 'center',
    backgroundColor: c.control,
    borderRadius: radius.control,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  buttonText: { color: c.background, fontWeight: '600' },
});
