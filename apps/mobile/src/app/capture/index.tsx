import { Ionicons } from '@expo/vector-icons';
import type { Framing } from '@shootspot/shared';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutRectangle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useOrientation,
  usePhotoOutput,
  type CameraRef,
  type FlashMode,
} from 'react-native-vision-camera';
import { useCapture } from '../../capture/context';
import { iconRotation, isSideways, previewCropRect } from '../../capture/crop';
import { processCapture, toFileUri } from '../../capture/process';
import { useFieldSensors } from '../../capture/sensors';
import { camera as c } from '../../theme/tokens';

const EV_PER_POINT = 1 / 120; // drag 120 pt for one stop, as on iOS
const FLASH_ICON: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off',
  auto: 'flash-outline',
  on: 'flash',
};

/**
 * Capture screen (D-22): minimal and close to the native Camera app. Viewfinder, shutter, lens
 * pills, tap-to-focus with drag-to-adjust exposure, pinch to zoom, a quiet 16:9 / 1:1 switch,
 * flash only when the device has one, flip, and a thumbnail of the last shot. GPS and heading are
 * captured silently. Controls rotate with the device; the UI itself stays portrait.
 */
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const capture = useCapture();
  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(position, {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg', qualityPrioritization: 'quality' });
  const orientation = useOrientation('device');
  const sensors = useFieldSensors(hasPermission);
  const cameraRef = useRef<CameraRef>(null);

  const [started, setStarted] = useState(false);
  const [framing, setFraming] = useState<Framing>('16:9');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState<number | null>(null);
  const [exposure, setExposure] = useState(0);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LayoutRectangle | null>(null);
  const flashOverlay = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasPermission && canRequestPermission) void requestPermission();
  }, [hasPermission, canRequestPermission, requestPermission]);
  useEffect(() => setStarted(false), [position]);

  // Lens pills: physical lens switch points on multi-camera devices; a digital 2× fallback on
  // devices that expose a single camera (seen on Android in the spike).
  const lenses = useMemo(() => {
    if (!device) return [];
    const base = device.zoomLensSwitchFactors[0] ?? device.minZoom;
    const stops = device.zoomLensSwitchFactors.length
      ? [device.minZoom, ...device.zoomLensSwitchFactors]
      : [device.minZoom, Math.min(device.minZoom * 2, device.maxZoom)];
    return [...new Set(stops)].map((z) => ({
      zoom: z,
      label: trim(z / (device.zoomLensSwitchFactors.length ? base : device.minZoom)),
    }));
  }, [device]);
  const neutralZoom = device ? (device.zoomLensSwitchFactors[0] ?? device.minZoom) : 1;
  const currentZoom = zoom ?? neutralZoom;

  const applyZoom = (z: number) => {
    if (!device || !started) return;
    const clamped = Math.min(
      Math.max(z, device.minZoom),
      Math.min(device.maxZoom, neutralZoom * 10),
    );
    setZoom(clamped);
    void cameraRef.current?.controller?.setZoom(clamped).catch(() => {});
  };
  // Start at the 1× (wide) lens, not the ultra-wide, once the session runs.
  useEffect(() => {
    if (started && device) applyZoom(neutralZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, device?.id]);

  const evMin = device?.supportsExposureBias ? device.minExposureBias : 0;
  const evMax = device?.supportsExposureBias ? device.maxExposureBias : 0;

  // One responder for the viewfinder: tap = focus, vertical drag = exposure, pinch = zoom.
  const gesture = useRef({ ev0: 0, zoom0: 1, dist0: 0, moved: false });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          gesture.current = { ev0: exposure, zoom0: currentZoom, dist0: 0, moved: false };
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length === 2) {
            const [a, b] = touches;
            const dist = Math.hypot(a!.pageX - b!.pageX, a!.pageY - b!.pageY);
            if (!gesture.current.dist0) gesture.current.dist0 = dist;
            gesture.current.moved = true;
            applyZoom(gesture.current.zoom0 * (dist / gesture.current.dist0));
          } else if (Math.abs(g.dy) > 8 && device?.supportsExposureBias) {
            gesture.current.moved = true;
            setExposure(
              Math.min(evMax, Math.max(evMin, gesture.current.ev0 - g.dy * EV_PER_POINT)),
            );
          }
        },
        onPanResponderRelease: (e: GestureResponderEvent, g) => {
          if (gesture.current.moved || Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) return;
          const { locationX: x, locationY: y } = e.nativeEvent;
          setFocus({ x, y });
          setExposure(0);
          void cameraRef.current?.focusTo({ x, y }).catch(() => {});
          void Haptics.selectionAsync();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exposure, currentZoom, started, device, evMin, evMax],
  );

  async function shoot() {
    if (busy || !device || !started) return;
    setBusy(true);
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(flashOverlay, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(flashOverlay, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    const capturedAt = new Date().toISOString();
    const fix = sensors.fix;
    try {
      const file = await photoOutput.capturePhotoToFile(
        { flashMode: device.hasFlash ? flash : 'off', enableShutterSound: true },
        {},
      );
      const processed = await processCapture(toFileUri(file.filePath), framing);
      if (!processed.check.ok && processed.check.reason !== 'too_small') {
        throw new Error('crop');
      }
      capture.update({
        photo: { uri: processed.uri, width: processed.width, height: processed.height, framing },
        capturedAt,
        altitudeM: fix?.altitudeM ?? null,
        headingDeg: sensors.headingDeg,
        bearingDeg: sensors.headingDeg == null ? null : Math.round(sensors.headingDeg) % 360,
        gps: fix ? { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM } : null,
      });
      router.push('/capture/review');
    } catch {
      setError('Could not take the photo. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!hasPermission) {
    return (
      <View style={[styles.root, styles.center, { padding: 32 }]}>
        <Ionicons name="camera-outline" size={44} color={c.controlMuted} />
        <Text style={styles.title}>Camera access</Text>
        <Text style={styles.body}>
          ShootSpot uses the camera to photograph the locations you scout.
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.textButton}
          onPress={() =>
            canRequestPermission ? void requestPermission() : void Linking.openSettings()
          }
        >
          <Text style={styles.textButtonLabel}>
            {canRequestPermission ? 'Allow camera' : 'Open Settings'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.textButton}
        >
          <Text style={[styles.textButtonLabel, { color: c.controlMuted }]}>Not now</Text>
        </Pressable>
      </View>
    );
  }

  const previewH = Math.round((screenW * 4) / 3);
  const crop = preview && previewCropRect(preview, orientation, framing);
  const rotate = { transform: [{ rotate: `${iconRotation(orientation)}deg` }] };
  const showRotateCue = framing === '16:9' && !isSideways(orientation);

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.side}>
          {device?.hasFlash && position === 'back' ? (
            <IconButton
              icon={FLASH_ICON[flash]}
              label={`Flash ${flash}`}
              tint={flash === 'off' ? c.control : c.accent}
              style={rotate}
              onPress={() => setFlash((f) => (f === 'off' ? 'auto' : f === 'auto' ? 'on' : 'off'))}
            />
          ) : null}
        </View>
        <View style={styles.framing} accessibilityRole="radiogroup">
          {(['16:9', '1:1'] as const).map((f) => (
            <Pressable
              key={f}
              accessibilityRole="radio"
              accessibilityState={{ selected: framing === f }}
              onPress={() => setFraming(f)}
              hitSlop={8}
            >
              <Text style={[styles.framingText, framing === f && { color: c.accent }, rotate]}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          <IconButton
            icon="close"
            label="Close camera"
            onPress={() => router.back()}
            style={rotate}
          />
        </View>
      </View>

      {/* Viewfinder */}
      <View
        style={{ width: screenW, height: previewH }}
        onLayout={(e) => setPreview(e.nativeEvent.layout)}
      >
        {device ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            isActive
            device={device}
            outputs={[photoOutput]}
            orientationSource="device"
            resizeMode="contain"
            exposure={started ? exposure : undefined}
            onStarted={() => setStarted(true)}
            onStopped={() => setStarted(false)}
            onError={() => setError('The camera stopped. Close and reopen it.')}
          />
        ) : null}
        {crop && preview ? <CropMask preview={preview} crop={crop} /> : null}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: flashOverlay }]}
        />
        <View
          style={StyleSheet.absoluteFill}
          {...responder.panHandlers}
          accessible
          accessibilityLabel="Viewfinder. Tap to focus, drag up or down to adjust brightness, pinch to zoom."
        />
        {focus ? <FocusSquare at={focus} exposure={exposure} /> : null}
        {showRotateCue ? (
          <View pointerEvents="none" style={styles.rotateCue}>
            <Ionicons name="phone-landscape-outline" size={18} color={c.control} />
          </View>
        ) : null}
        {lenses.length > 1 && started ? (
          <View style={styles.lenses}>
            {lenses.map((l) => {
              const active = Math.abs(currentZoom - l.zoom) < 0.05;
              return (
                <Pressable
                  key={l.zoom}
                  accessibilityRole="button"
                  accessibilityLabel={`${l.label} times zoom`}
                  onPress={() => applyZoom(l.zoom)}
                  style={[styles.lens, active && styles.lensActive]}
                >
                  <Text style={[styles.lensText, active && { color: c.accent }, rotate]}>
                    {active ? `${l.label}×` : l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.side}>
          {capture.state.photo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Last photo"
              onPress={() => router.push('/capture/review')}
            >
              <Image
                source={capture.state.photo.uri}
                style={[styles.thumb, rotate]}
                contentFit="cover"
              />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          disabled={busy || !started}
          onPress={() => void shoot()}
          style={({ pressed }) => [
            styles.shutter,
            (pressed || busy) && { transform: [{ scale: 0.92 }] },
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          <IconButton
            icon="camera-reverse-outline"
            label="Switch camera"
            style={rotate}
            onPress={() => setPosition((p) => (p === 'back' ? 'front' : 'back'))}
          />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function IconButton(props: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress(): void;
  tint?: string;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      hitSlop={12}
      style={styles.iconButton}
    >
      <Ionicons name={props.icon} size={24} color={props.tint ?? c.control} style={props.style} />
    </Pressable>
  );
}

function CropMask({
  preview,
  crop,
}: {
  preview: LayoutRectangle;
  crop: ReturnType<typeof previewCropRect>;
}) {
  const right = preview.width - crop.left - crop.width;
  const bottom = preview.height - crop.top - crop.height;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.mask, { left: 0, right: 0, top: 0, height: crop.top }]} />
      <View style={[styles.mask, { left: 0, right: 0, bottom: 0, height: bottom }]} />
      <View
        style={[styles.mask, { left: 0, width: crop.left, top: crop.top, height: crop.height }]}
      />
      <View style={[styles.mask, { right: 0, width: right, top: crop.top, height: crop.height }]} />
      <View
        style={[
          styles.guide,
          { left: crop.left, top: crop.top, width: crop.width, height: crop.height },
        ]}
      />
    </View>
  );
}

/** iOS-style focus square with a sun marker that moves with exposure. */
function FocusSquare({ at, exposure }: { at: { x: number; y: number }; exposure: number }) {
  const size = 72;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: at.x - size / 2,
        top: at.y - size / 2,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View style={{ width: size, height: size, borderWidth: 1, borderColor: c.accent }} />
      <View style={{ marginLeft: 6, height: size, justifyContent: 'center' }}>
        <Ionicons
          name="sunny"
          size={16}
          color={c.accent}
          style={{
            transform: [{ translateY: Math.max(-size / 2, Math.min(size / 2, -exposure * 20)) }],
          }}
        />
      </View>
    </View>
  );
}

const trim = (z: number) => {
  const r = Math.round(z * 10) / 10;
  return r < 1 ? `.${Math.round(r * 10)}` : String(r);
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: c.control, fontSize: 20, fontWeight: '600' },
  body: { color: c.controlMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  textButtonLabel: { color: c.accent, fontSize: 17, fontWeight: '600' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  side: { width: 64 },
  framing: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 20 },
  framingText: { color: c.control, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mask: { position: 'absolute', backgroundColor: c.mask },
  guide: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: c.guide },
  rotateCue: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: c.backplate,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lenses: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: c.backplate,
    borderRadius: 999,
    padding: 4,
  },
  lens: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensActive: { backgroundColor: 'rgba(0,0,0,0.55)' },
  lensText: { color: c.control, fontSize: 12, fontWeight: '600' },
  bottomBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  thumb: { width: 44, height: 44, borderRadius: 6, borderWidth: 1, borderColor: c.controlMuted },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: c.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: c.control },
  error: {
    position: 'absolute',
    bottom: 140,
    alignSelf: 'center',
    color: '#FF453A',
    backgroundColor: c.backplate,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
