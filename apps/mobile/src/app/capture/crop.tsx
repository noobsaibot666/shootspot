import { MIN_SHORT_EDGE, type Framing } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '../../capture/context';
import { processImportCrop, uprightSize } from '../../capture/process';
import { listImports } from '../../lib/imports';
import { camera as c } from '../../theme/tokens';

const RATIO: Record<Framing, number> = { '16:9': 16 / 9, '1:1': 1 };

/**
 * Frame an imported photo (D-13, D-28): the largest 16:9 or square frame that fits, dragged
 * into place. Same dark chrome as the camera review; "Use photo" crops and continues to the pin.
 */
export default function ImportCrop() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const capture = useCapture();
  const [uri, setUri] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState<LayoutRectangle | null>(null);
  const [framing, setFraming] = useState<Framing>('16:9');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const item = (await listImports()).find((i) => i.id === id);
      if (!item) return setError('This photo is no longer in the batch.');
      try {
        const s = await uprightSize(item.uri);
        setSize(s);
        setUri(item.uri);
        // Portrait or square sources default to square: it keeps more of the picture.
        if (s.height >= s.width) setFraming('1:1');
      } catch {
        setError('This photo could not be opened.');
      }
    })();
  }, [id]);

  // The photo fitted into the available box, and the frame inside it (display points).
  const geo = useMemo(() => {
    if (!size || !box) return null;
    const scale = Math.min(box.width / size.width, box.height / size.height);
    const dw = size.width * scale;
    const dh = size.height * scale;
    const r = RATIO[framing];
    const fw = dw / dh > r ? dh * r : dw;
    const fh = fw / r;
    return { scale, dw, dh, fw, fh, left: (box.width - dw) / 2, top: (box.height - dh) / 2 };
  }, [size, box, framing]);

  // Start centred whenever the framing or photo changes.
  useEffect(() => {
    if (geo) setOffset({ x: (geo.dw - geo.fw) / 2, y: (geo.dh - geo.fh) / 2 });
  }, [geo]);

  const start = useRef({ x: 0, y: 0 });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = offset;
        },
        onPanResponderMove: (_, g) => {
          if (!geo) return;
          setOffset({
            x: Math.max(0, Math.min(geo.dw - geo.fw, start.current.x + g.dx)),
            y: Math.max(0, Math.min(geo.dh - geo.fh, start.current.y + g.dy)),
          });
        },
      }),
    [geo, offset],
  );

  const source = geo && {
    left: Math.round(offset.x / geo.scale),
    top: Math.round(offset.y / geo.scale),
    width: Math.round(geo.fw / geo.scale),
    height: Math.round(geo.fh / geo.scale),
  };
  const tooSmall = source ? Math.min(source.width, source.height) < MIN_SHORT_EDGE : false;

  async function use() {
    if (!uri || !source || !size) return;
    setBusy(true);
    try {
      const rect = {
        ...source,
        width: Math.min(source.width, size.width - source.left),
        height: Math.min(source.height, size.height - source.top),
      };
      const out = await processImportCrop(uri, rect);
      capture.update({ photo: { uri: out.uri, width: out.width, height: out.height, framing } });
      router.push('/capture/pin');
    } catch {
      setError('Could not crop this photo. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.action}
        >
          <Text style={styles.actionText}>Back</Text>
        </Pressable>
        <View style={styles.framing} accessibilityRole="radiogroup">
          {(['16:9', '1:1'] as const).map((f) => (
            <Pressable
              key={f}
              accessibilityRole="radio"
              accessibilityState={{ selected: framing === f }}
              onPress={() => setFraming(f)}
              hitSlop={8}
            >
              <Text style={[styles.framingText, framing === f && { color: c.accent }]}>{f}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.action} />
      </View>

      <View style={styles.stage} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        {uri && geo ? (
          <View
            style={{
              position: 'absolute',
              left: geo.left,
              top: geo.top,
              width: geo.dw,
              height: geo.dh,
            }}
          >
            <Image source={uri} style={StyleSheet.absoluteFill} contentFit="fill" />
            {/* Dim everything outside the frame. */}
            <View
              pointerEvents="none"
              style={[styles.mask, { left: 0, right: 0, top: 0, height: offset.y }]}
            />
            <View
              pointerEvents="none"
              style={[styles.mask, { left: 0, right: 0, top: offset.y + geo.fh, bottom: 0 }]}
            />
            <View
              pointerEvents="none"
              style={[styles.mask, { left: 0, width: offset.x, top: offset.y, height: geo.fh }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.mask,
                { left: offset.x + geo.fw, right: 0, top: offset.y, height: geo.fh },
              ]}
            />
            <View
              {...responder.panHandlers}
              accessible
              accessibilityLabel="Frame. Drag to choose the part of the photo to publish."
              style={[
                styles.frame,
                { left: offset.x, top: offset.y, width: geo.fw, height: geo.fh },
              ]}
            />
          </View>
        ) : error ? null : (
          <ActivityIndicator color={c.control} />
        )}
      </View>

      <View style={{ gap: 8, paddingHorizontal: 24 }}>
        {error ? <Text style={styles.warn}>{error}</Text> : null}
        {tooSmall ? (
          <Text style={styles.warn}>
            Too small to publish: the frame needs at least {MIN_SHORT_EDGE} px on its short side.
          </Text>
        ) : (
          <Text style={styles.meta}>Drag the frame to choose what to publish.</Text>
        )}
        <View style={styles.bottom}>
          <View />
          <Pressable
            accessibilityRole="button"
            disabled={!geo || tooSmall || busy}
            onPress={() => void use()}
            style={[styles.action, (!geo || tooSmall) && { opacity: 0.4 }]}
            hitSlop={8}
          >
            {busy ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <Text
                style={[
                  styles.actionText,
                  { color: c.accent, fontWeight: '700', textAlign: 'right' },
                ]}
              >
                Use photo
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52 },
  framing: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 24 },
  framingText: { color: c.control, fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
  stage: { flex: 1, margin: 16, alignItems: 'center', justifyContent: 'center' },
  mask: { position: 'absolute', backgroundColor: c.mask },
  frame: { position: 'absolute', borderWidth: 1.5, borderColor: c.guide },
  meta: { color: c.controlMuted, fontSize: 13, textAlign: 'center' },
  warn: { color: '#FF9F0A', fontSize: 14, textAlign: 'center' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { minHeight: 44, minWidth: 88, justifyContent: 'center' },
  actionText: { color: c.control, fontSize: 17 },
});
