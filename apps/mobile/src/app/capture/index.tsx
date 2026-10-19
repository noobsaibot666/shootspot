import { Icon, type IconName } from '../../ui/icon';
import type { Framing } from '@shootspot/shared';
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
import {
  ExposureRow,
  FramingBadge,
  Grid,
  HistogramView,
  Level,
  Panel,
  ToggleButton,
  ZoomWheel,
  trim,
  useCameraPrefs,
  useExposureReadout,
} from '../../capture/camera-ui';
import { useCapture } from '../../capture/context';
import { iconRotation, isSideways, previewCropRect } from '../../capture/crop';
import { useHistogram } from '../../capture/histogram';
import { haptics } from '../../lib/device';
import { listImports, pickPhotos } from '../../lib/imports';
import { processCapture, toFileUri } from '../../capture/process';
import { useFieldSensors } from '../../capture/sensors';
import { camera as c } from '../../theme/tokens';

const EV_PER_POINT = 1 / 120; // drag 120 pt for one stop, as on iOS
const FLASH_ICON: Record<FlashMode, IconName> = {
  off: 'flashOff',
  auto: 'flashAuto',
  on: 'flash.fill',
};
const TOP_BAR = 56;
const READOUT = 52;
const PANEL_MIN = 200;

/**
 * Capture screen (D-22), Camera M-style look (owner request, 2026-10-19): framing badge top left,
 * viewfinder with grid, level and an optional live RGB histogram, an A · ISO · F · SEC readout,
 * and a rounded panel (tinted by the scene) with quick toggles, last shot / gallery, the shutter
 * and a vertical zoom wheel. Behaviour is unchanged: tap to focus, drag for exposure, pinch to
 * zoom, 16:9 / 1:1 crop mask, flash only when the device has one, GPS and heading captured
 * silently. Controls rotate with the device; the UI itself stays portrait.
 */
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const capture = useCapture();
  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const device = useCameraDevice(position, {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg', qualityPrioritization: 'quality' });
  const { frameOutput, histogram } = useHistogram();
  const orientation = useOrientation('device');
  const sensors = useFieldSensors(hasPermission);
  const cameraRef = useRef<CameraRef>(null);
  const [prefs, setPrefs] = useCameraPrefs();

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

  const live = useExposureReadout(() => {
    const ctl = cameraRef.current?.controller;
    return ctl ? { iso: ctl.iso, seconds: ctl.exposureDuration } : null;
  });

  // Lens steps: physical lens switch points on multi-camera devices; a digital 2× fallback on
  // devices that expose a single camera (seen on Android in the spike).
  const lensBase = device ? (device.zoomLensSwitchFactors[0] ?? device.minZoom) : 1;
  const labelBase = device?.zoomLensSwitchFactors.length ? lensBase : (device?.minZoom ?? 1);
  const lenses = useMemo(() => {
    if (!device) return [];
    const stops = device.zoomLensSwitchFactors.length
      ? [device.minZoom, ...device.zoomLensSwitchFactors]
      : [device.minZoom, Math.min(device.minZoom * 2, device.maxZoom)];
    return [...new Set(stops)].map((z) => ({ zoom: z, label: trim(z / labelBase) }));
  }, [device, labelBase]);
  const neutralZoom = lensBase;
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
          haptics.selection();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exposure, currentZoom, started, device, evMin, evMax],
  );

  async function openGallery() {
    try {
      const pending = (await listImports()).some((i) => i.state === 'todo');
      if ((await pickPhotos()) > 0 || pending) router.push('/capture/import');
    } catch {
      setError('Could not open your photos.');
    }
  }

  async function shoot() {
    if (busy || !device || !started) return;
    setBusy(true);
    setError(null);
    haptics.light();
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
        <Icon name="camera" size={44} color={c.controlMuted} />
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

  // The 4:3 viewfinder fills the width, but gives way on short screens so the panel always fits.
  const room = screenH - insets.top - TOP_BAR - READOUT - PANEL_MIN - insets.bottom;
  const previewH = Math.round(Math.max(200, Math.min((screenW * 4) / 3, room)));
  const crop = preview && previewCropRect(preview, orientation, framing);
  const rotate = { transform: [{ rotate: `${iconRotation(orientation)}deg` }] };
  const showRotateCue = framing === '16:9' && !isSideways(orientation);
  const lastShot = capture.state.photo?.uri;
  const hasFlash = !!device?.hasFlash && position === 'back';

  return (
    <View style={styles.root}>
      {/* Top bar: framing badge, close */}
      <View style={[styles.topBar, { paddingTop: insets.top, height: insets.top + TOP_BAR }]}>
        <FramingBadge
          framing={framing}
          style={rotate}
          onPress={() => {
            haptics.selection();
            setFraming((f) => (f === '16:9' ? '1:1' : '16:9'));
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.iconButton}
        >
          <Icon name="close" size={24} color={c.control} style={rotate} />
        </Pressable>
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
            outputs={[photoOutput, frameOutput]}
            orientationSource="device"
            resizeMode="contain"
            exposure={started ? exposure : undefined}
            onStarted={() => setStarted(true)}
            onStopped={() => setStarted(false)}
            onError={() => setError('The camera stopped. Close and reopen it.')}
          />
        ) : null}
        {crop && preview ? <CropMask preview={preview} crop={crop} /> : null}
        {crop && prefs.grid ? <Grid rect={crop} /> : null}
        {prefs.level ? <Level /> : null}
        {prefs.histogram ? <HistogramView histogram={histogram} /> : null}
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
            <Icon name="rotate" size={18} color={c.control} />
          </View>
        ) : null}
      </View>

      {/* A · ISO · F · SEC, histogram toggle */}
      <ExposureRow
        exposure={{
          iso: live.iso,
          seconds: live.seconds,
          aperture: device?.lensAperture ? device.lensAperture : null,
        }}
        bias={exposure}
        histogramOn={prefs.histogram}
        onHistogram={() => setPrefs({ histogram: !prefs.histogram })}
      />

      {/* Control panel */}
      <Panel tint={histogram?.mean ?? null} style={{ paddingBottom: insets.bottom + 12 }}>
        <View style={styles.toggles}>
          {hasFlash ? (
            <ToggleButton
              icon={FLASH_ICON[flash]}
              label={`Flash ${flash}`}
              iconStyle={rotate}
              onPress={() => setFlash((f) => (f === 'off' ? 'auto' : f === 'auto' ? 'on' : 'off'))}
            />
          ) : (
            <View style={styles.toggleSpacer} />
          )}
          <ToggleButton
            icon="grid"
            label="Grid"
            active={prefs.grid}
            iconStyle={rotate}
            onPress={() => setPrefs({ grid: !prefs.grid })}
          />
          <View style={styles.handle} />
          <ToggleButton
            icon="level"
            label="Level"
            active={prefs.level}
            iconStyle={rotate}
            onPress={() => setPrefs({ level: !prefs.level })}
          />
          <ToggleButton
            icon="flip"
            label="Switch camera"
            iconStyle={rotate}
            onPress={() => setPosition((p) => (p === 'back' ? 'front' : 'back'))}
          />
        </View>

        <View style={styles.mainRow}>
          {/* Last shot, or the gallery: imports open here (D-28), where native cameras keep it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import photos from your gallery"
            onPress={() => void openGallery()}
            hitSlop={8}
            style={[styles.thumb, rotate]}
          >
            {lastShot ? (
              <Image
                source={{ uri: lastShot }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Icon name="gallery" size={24} color={c.control} />
            )}
          </Pressable>
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
          {lenses.length > 1 && started ? (
            <ZoomWheel
              lenses={lenses}
              zoom={currentZoom}
              displayFactor={currentZoom / labelBase}
              onSelect={(z) => {
                haptics.selection();
                applyZoom(z);
              }}
              labelStyle={rotate}
            />
          ) : (
            <View style={styles.wheelSpacer} />
          )}
        </View>
      </Panel>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
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
        <Icon
          name="sun.fill"
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: c.control, fontSize: 20, fontWeight: '600' },
  body: { color: c.controlMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  textButtonLabel: { color: c.accent, fontSize: 17, fontWeight: '600' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mask: { position: 'absolute', backgroundColor: c.mask },
  guide: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: c.guide },
  rotateCue: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: c.backplate,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggles: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 14,
    paddingHorizontal: 12,
  },
  toggleSpacer: { width: 48, height: 48 },
  handle: { width: 40, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: c.control },
  wheelSpacer: { width: 64 },
  error: {
    position: 'absolute',
    bottom: 200,
    alignSelf: 'center',
    color: '#FF453A',
    backgroundColor: c.backplate,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
