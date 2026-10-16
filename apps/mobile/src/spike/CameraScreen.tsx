import { cropRetention, type Framing } from '@shootspot/shared';
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutRectangle,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useOrientation,
  usePhotoOutput,
  type CameraRef,
  type FlashMode,
  type TargetCameraPosition,
} from 'react-native-vision-camera';
import { camera as c, font, radius, space } from '../theme/tokens';
import { iconRotation, isSideways, previewCropRect } from './crop-overlay';
import { processCapture, toFileUri, type ProcessedCapture } from './process-capture';
import { useFieldSensors, type FieldFix } from './useFieldSensors';

export interface CaptureResult extends ProcessedCapture {
  framing: Framing;
  capturedAt: Date;
  heldSideways: boolean;
  fix: FieldFix | null;
  headingDeg: number | null;
  headingAccuracy: number | null;
  lens: {
    position: TargetCameraPosition;
    zoom: number | undefined;
    focalLength: number | undefined;
  };
}

const EV_STEP = 1 / 3;

/**
 * Phase 1 camera spike: landscape guidance, 16:9/1:1 live crop mask, tap-to-focus, pinch and lens
 * zoom, exposure bias, torch and flash. See docs/runbooks/camera-spike-test-plan.md.
 */
export function CameraScreen({ onCaptured }: { onCaptured(result: CaptureResult): void }) {
  const { hasPermission, requestPermission, canRequestPermission } = useCameraPermission();
  const [position, setPosition] = useState<TargetCameraPosition>('back');
  const device = useCameraDevice(position, {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg', qualityPrioritization: 'quality' });
  const orientation = useOrientation('device');
  const sensors = useFieldSensors(hasPermission);
  const cameraRef = useRef<CameraRef>(null);

  const [framing, setFraming] = useState<Framing>('16:9');
  const [exposure, setExposure] = useState(0);
  const [torch, setTorch] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LayoutRectangle | null>(null);

  const { width: screenWidth } = useWindowDimensions();
  const previewHeight = Math.round((screenWidth * 4) / 3);
  const sideways = isSideways(orientation);
  const rotate = { transform: [{ rotate: `${iconRotation(orientation)}deg` }] };

  const lensPresets = useMemo(() => {
    if (!device) return [];
    const factors = [device.minZoom, ...device.zoomLensSwitchFactors];
    const base = device.zoomLensSwitchFactors[0] ?? 1;
    return factors.map((zoom) => ({ zoom, label: `${trimZoom(zoom / base)}×` }));
  }, [device]);

  if (!hasPermission) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.title}>Camera access</Text>
        <Text style={styles.body}>
          ShootSpot needs the camera to photograph the locations you scout.
        </Text>
        {canRequestPermission ? (
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <Text style={styles.body}>Camera access is off. Enable it in Settings to capture.</Text>
        )}
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.body}>No camera available on this device.</Text>
      </View>
    );
  }

  const evMin = device.supportsExposureBias ? device.minExposureBias : 0;
  const evMax = device.supportsExposureBias ? device.maxExposureBias : 0;
  const crop = preview && previewCropRect(preview, orientation, framing);
  // Uncropped sensor frame is 4:3 in the user's view; warn when the crop discards most of it.
  const retention = cropRetention(
    sideways ? { width: 4, height: 3 } : { width: 3, height: 4 },
    framing,
  );

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const capturedAt = new Date();
    const fix = sensors.fix;
    const headingDeg = sensors.headingDeg;
    const headingAccuracy = sensors.headingAccuracy;
    try {
      const file = await photoOutput.capturePhotoToFile(
        { flashMode: flash, enableShutterSound: true },
        {},
      );
      const processed = await processCapture(toFileUri(file.filePath), framing);
      onCaptured({
        ...processed,
        framing,
        capturedAt,
        heldSideways: sideways,
        fix,
        headingDeg,
        headingAccuracy,
        lens: {
          position,
          zoom: cameraRef.current?.controller?.zoom,
          focalLength: device.focalLength,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View
        style={{ width: screenWidth, height: previewHeight }}
        onLayout={(e) => setPreview(e.nativeEvent.layout)}
      >
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          isActive
          device={device}
          outputs={[photoOutput]}
          orientationSource="device"
          resizeMode="contain"
          enableNativeTapToFocusGesture
          enableNativeZoomGesture
          exposure={exposure}
          torchMode={torch ? 'on' : 'off'}
          onError={(e) => setError(e.message)}
        />
        {crop && preview && <CropMask preview={preview} crop={crop} />}
        {!sideways && framing === '16:9' && (
          <View style={styles.rotateCue} pointerEvents="none">
            <Text style={styles.rotateText}>
              ↻ Turn your phone sideways for the full 16:9 frame
            </Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <View style={styles.row}>
          <Toggle
            label="16:9"
            active={framing === '16:9'}
            onPress={() => setFraming('16:9')}
            style={rotate}
          />
          <Toggle
            label="1:1"
            active={framing === '1:1'}
            onPress={() => setFraming('1:1')}
            style={rotate}
          />
          <Text style={[styles.meta, rotate]}>keeps {Math.round(retention * 100)}%</Text>
        </View>

        <View style={styles.row}>
          {lensPresets.map((p) => (
            <Toggle
              key={p.zoom}
              label={p.label}
              onPress={() => void cameraRef.current?.controller?.setZoom(p.zoom)}
              style={rotate}
            />
          ))}
        </View>

        <View style={styles.row}>
          <Toggle
            label="EV−"
            onPress={() => setExposure((v) => Math.max(evMin, v - EV_STEP))}
            disabled={!device.supportsExposureBias}
            style={rotate}
          />
          <Text style={[styles.meta, rotate]}>{formatEv(exposure)}</Text>
          <Toggle
            label="EV+"
            onPress={() => setExposure((v) => Math.min(evMax, v + EV_STEP))}
            disabled={!device.supportsExposureBias}
            style={rotate}
          />
          {device.hasTorch && (
            <Toggle
              label="Torch"
              active={torch}
              onPress={() => setTorch((t) => !t)}
              style={rotate}
            />
          )}
          {device.hasFlash && (
            <Toggle
              label={`Flash ${flash}`}
              onPress={() => setFlash((f) => (f === 'off' ? 'auto' : f === 'auto' ? 'on' : 'off'))}
              style={rotate}
            />
          )}
        </View>

        <View style={styles.row}>
          <Toggle
            label="Flip"
            onPress={() => setPosition((p) => (p === 'back' ? 'front' : 'back'))}
            style={rotate}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            onPress={() => void capture()}
            disabled={busy}
            style={({ pressed }) => [styles.shutter, (pressed || busy) && styles.shutterPressed]}
          />
          <Text style={[styles.meta, styles.sensorText]}>
            {sensors.permission === 'denied'
              ? 'GPS off · pin manually'
              : sensors.fix
                ? `±${Math.round(sensors.fix.accuracyM ?? 0)} m`
                : 'GPS…'}
            {'\n'}
            {sensors.headingDeg == null ? 'heading…' : `${Math.round(sensors.headingDeg)}°`}
          </Text>
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
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

function Toggle(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress(): void;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.active, disabled: !!props.disabled }}
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        styles.toggle,
        props.active && styles.toggleActive,
        props.disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.toggleText, props.active && styles.toggleTextActive, props.style]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function Button({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const trimZoom = (z: number) => (Math.round(z * 10) / 10).toString();
const formatEv = (ev: number) => `${ev >= 0 ? '+' : '−'}${Math.abs(ev).toFixed(1)} EV`;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background, paddingTop: 48 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  title: { color: c.control, fontSize: 20, fontWeight: '600' },
  body: { color: c.controlMuted, fontSize: 15, textAlign: 'center' },
  mask: { position: 'absolute', backgroundColor: c.mask },
  guide: { position: 'absolute', borderWidth: 1, borderColor: c.guide },
  rotateCue: {
    position: 'absolute',
    bottom: space.md,
    alignSelf: 'center',
    backgroundColor: c.backplate,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rotateText: { color: c.control, fontSize: 13 },
  controls: { flex: 1, justifyContent: 'space-evenly', paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  toggle: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: c.controlMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: c.control, borderColor: c.control },
  toggleText: { color: c.control, fontSize: 13, fontWeight: '600' },
  toggleTextActive: { color: c.background },
  disabled: { opacity: 0.35 },
  meta: { color: c.controlMuted, fontFamily: font.mono, fontSize: 12 },
  sensorText: { width: 96, textAlign: 'right' },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: c.control,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: space.xl,
  },
  shutterPressed: { backgroundColor: c.control },
  error: { color: '#FF453A', textAlign: 'center', fontSize: 13 },
  button: {
    backgroundColor: c.control,
    borderRadius: radius.control,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  buttonText: { color: c.background, fontWeight: '600' },
});
