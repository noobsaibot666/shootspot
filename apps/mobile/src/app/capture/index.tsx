import { Icon, type IconName } from '../../ui/icon';
import type { Framing } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
  type CameraDevice,
  type CameraFrameOutput,
  type CameraPhotoOutput,
  type CameraRef,
  type FlashMode,
} from 'react-native-vision-camera';
import {
  ExposureReadout,
  FramingSwitch,
  Grid,
  HistogramSource,
  HistogramView,
  Level,
  ToggleButton,
  ZoomWheel,
  panelStyle,
  trim,
  useCameraPrefs,
} from '../../capture/camera-ui';
import { useCapture } from '../../capture/context';
import { iconRotation, isSideways, previewCropRect } from '../../capture/crop';
import { framesAvailable } from '../../capture/histogram';
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
const TOP_BAR = 52;
const READOUT = 40;
const PANEL_MIN = 196;

/**
 * Capture screen (D-22), Camera M-inspired (owner request 2026-10-19, reworked after the review
 * of build 7): framing switch, level and close on top; viewfinder with grid, crop mask and an
 * optional brightness histogram; an AUTO · ISO · ƒ · S readout; a dark panel with flash, grid,
 * level and flip, then last shot / gallery, shutter and the lens column. Behaviour as before:
 * tap to focus, drag for exposure, pinch to zoom, GPS and heading captured silently. Controls
 * rotate with the device; the UI itself stays portrait.
 *
 * Performance rules (build 7 stuttered and crashed): the <Camera> is memoised and only gets
 * stable props; fast-changing pieces (level, histogram, readout) render on their own; camera
 * frames are only processed while the histogram is on.
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
  // Balanced: quick to fire (quality prioritisation waits for the heaviest processing).
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    qualityPrioritization: 'balanced',
  });
  const [frameOutput, setFrameOutput] = useState<CameraFrameOutput | null>(null);
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
  useEffect(() => {
    setStarted(false);
    setZoom(null);
  }, [position]);

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
  // Starts on the 1× (wide) lens. Passed to <Camera> as a prop, so it survives reconfiguration.
  const currentZoom = zoom ?? lensBase;

  const applyZoom = (z: number) => {
    if (!device) return;
    setZoom(Math.min(Math.max(z, device.minZoom), Math.min(device.maxZoom, lensBase * 10)));
  };

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
    [exposure, currentZoom, device, evMin, evMax],
  );

  const outputs = useMemo(
    () => (frameOutput ? [photoOutput, frameOutput] : [photoOutput]),
    [photoOutput, frameOutput],
  );
  const onStarted = useCallback(() => setStarted(true), []);
  const onStopped = useCallback(() => setStarted(false), []);
  const onCameraError = useCallback(() => setError('The camera stopped. Close and reopen it.'), []);
  const onFrameOutput = useCallback(
    (o: unknown) => setFrameOutput((o as CameraFrameOutput | null) ?? null),
    [],
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
      Animated.timing(flashOverlay, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(flashOverlay, { toValue: 0, duration: 160, useNativeDriver: true }),
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
  const histogramOn = prefs.histogram && framesAvailable;

  return (
    <View style={styles.root}>
      {histogramOn ? <HistogramSource onOutput={onFrameOutput} /> : null}

      {/* Top bar: framing, level, close */}
      <View style={[styles.topBar, { paddingTop: insets.top, height: insets.top + TOP_BAR }]}>
        <FramingSwitch
          framing={framing}
          textStyle={rotate}
          onChange={(f) => {
            haptics.selection();
            setFraming(f);
          }}
        />
        <View style={styles.topCenter}>{prefs.level ? <Level /> : null}</View>
        <View style={styles.topRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.iconButton}
          >
            <Icon name="close" size={22} color={c.control} style={rotate} />
          </Pressable>
        </View>
      </View>

      {/* Viewfinder */}
      <View
        style={{ width: screenW, height: previewH }}
        onLayout={(e) => setPreview(e.nativeEvent.layout)}
      >
        {device ? (
          <CameraView
            cameraRef={cameraRef}
            device={device}
            outputs={outputs}
            zoom={currentZoom}
            exposure={exposure}
            onStarted={onStarted}
            onStopped={onStopped}
            onError={onCameraError}
          />
        ) : null}
        {crop && preview ? <CropMask preview={preview} crop={crop} /> : null}
        {crop && prefs.grid ? <Grid rect={crop} /> : null}
        {histogramOn && frameOutput ? <HistogramView /> : null}
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
            <Icon name="rotate" size={16} color={c.control} />
          </View>
        ) : null}
      </View>

      <ExposureReadout
        cameraRef={cameraRef}
        aperture={device?.lensAperture ? device.lensAperture : null}
        bias={exposure}
        histogramOn={histogramOn}
        onHistogram={framesAvailable ? () => setPrefs({ histogram: !prefs.histogram }) : undefined}
      />

      {/* Control panel */}
      <View style={[panelStyle, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.toggles}>
          {hasFlash ? (
            <ToggleButton
              icon={FLASH_ICON[flash]}
              label={`Flash ${flash}`}
              active={flash !== 'off'}
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
              <Icon name="gallery" size={22} color={c.controlMuted} />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            disabled={busy || !started}
            onPress={() => void shoot()}
            style={({ pressed }) => [
              styles.shutter,
              (pressed || busy) && { transform: [{ scale: 0.94 }] },
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
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** The camera itself, memoised: it re-renders only when one of these props really changes. */
const CameraView = memo(function CameraView(props: {
  cameraRef: RefObject<CameraRef | null>;
  device: CameraDevice;
  outputs: (CameraPhotoOutput | CameraFrameOutput)[];
  zoom: number;
  exposure: number;
  onStarted(): void;
  onStopped(): void;
  onError(): void;
}) {
  return (
    <Camera
      ref={props.cameraRef}
      style={StyleSheet.absoluteFill}
      isActive
      device={props.device}
      outputs={props.outputs}
      orientationSource="device"
      resizeMode="contain"
      zoom={props.zoom}
      exposure={props.exposure}
      onStarted={props.onStarted}
      onStopped={props.onStopped}
      onError={props.onError}
    />
  );
});

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

/** Focus square with a sun marker that moves with exposure. */
function FocusSquare({ at, exposure }: { at: { x: number; y: number }; exposure: number }) {
  const size = 68;
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
          size={14}
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
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  topCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRight: { width: 96, alignItems: 'flex-end' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mask: { position: 'absolute', backgroundColor: c.mask },
  guide: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: c.guide },
  rotateCue: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: c.backplate,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  toggles: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 10,
    paddingHorizontal: 24,
  },
  toggleSpacer: { width: 48, height: 48 },
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: c.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.control },
  wheelSpacer: { width: 56 },
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
