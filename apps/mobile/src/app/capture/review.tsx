import { MIN_SHORT_EDGE } from '@shootspot/shared';
import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '../../capture/context';
import { camera as c } from '../../theme/tokens';

/** Shows exactly the crop that will be published (plan §5): Retake or Use photo. */
export default function Review() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state } = useCapture();
  const photo = state.photo;
  // No photo (e.g. state was reset after publishing while this screen was still mounted):
  // redirect declaratively. Navigating during render is a React error.
  if (!photo) return <Redirect href="/capture" />;
  const tooSmall = Math.min(photo.width, photo.height) < MIN_SHORT_EDGE;
  const h = width / (photo.width / photo.height);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.center}>
        <Image
          source={photo.uri}
          style={{ width, height: h }}
          contentFit="contain"
          accessibilityLabel="Captured photo, as it will be published"
        />
        <Text style={styles.meta}>
          {photo.framing} · {photo.width} × {photo.height}
        </Text>
        {tooSmall ? (
          <Text style={styles.warn}>
            This photo is too small to publish (needs at least {MIN_SHORT_EDGE} px on the short
            side). Try the back camera.
          </Text>
        ) : null}
      </View>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.action}
          hitSlop={8}
        >
          <Text style={styles.actionText}>Retake</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={tooSmall}
          onPress={() => router.push('/capture/pin')}
          style={[styles.action, tooSmall && { opacity: 0.4 }]}
          hitSlop={8}
        >
          <Text style={[styles.actionText, { color: c.accent, fontWeight: '700' }]}>Use photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', gap: 12 },
  meta: { color: c.controlMuted, fontSize: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },
  warn: { color: '#FF9F0A', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24 },
  action: { minHeight: 44, minWidth: 88, justifyContent: 'center' },
  actionText: { color: c.control, fontSize: 17 },
});
