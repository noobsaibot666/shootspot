import type { Framing } from '@shootspot/shared';
import { File, Paths } from 'expo-file-system';
import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { SensorType, useAnimatedSensor, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import type { CameraRef } from 'react-native-vision-camera';
import { camera as c, font } from '../theme/tokens';
import { Icon, type IconName } from '../ui/icon';
import { BINS, useHistogramBins, useHistogramOutput } from './histogram';

/**
 * Capture screen pieces, Camera M-inspired but quiet (owner review 2026-10-19: "harsh and
 * tacky"): monochrome chrome, thin type, the photo is the only colour. Each piece that updates
 * often (level, histogram, exposure readout) renders on its own, so the camera never re-renders
 * because of them.
 */

// MARK: - Settings (grid / level / histogram), remembered between sessions

export interface CameraPrefs {
  grid: boolean;
  level: boolean;
  histogram: boolean;
}
const PREFS_DEFAULT: CameraPrefs = { grid: true, level: true, histogram: false };
const prefsFile = () => new File(Paths.document, 'camera.json');

export function useCameraPrefs(): [CameraPrefs, (next: Partial<CameraPrefs>) => void] {
  const [prefs, setPrefs] = useState<CameraPrefs>(PREFS_DEFAULT);
  useEffect(() => {
    void (async () => {
      try {
        const f = prefsFile();
        if (f.exists) setPrefs({ ...PREFS_DEFAULT, ...(JSON.parse(await f.text()) as object) });
      } catch {}
    })();
  }, []);
  const update = (next: Partial<CameraPrefs>) =>
    setPrefs((p) => {
      const merged = { ...p, ...next };
      try {
        const f = prefsFile();
        if (!f.exists) f.create({ overwrite: true });
        void f.write(JSON.stringify(merged));
      } catch {}
      return merged;
    });
  return [prefs, update];
}

// MARK: - Framing (16:9 · 1:1), top left

export function FramingSwitch(props: {
  framing: Framing;
  onChange(f: Framing): void;
  textStyle?: object;
}) {
  return (
    <View style={styles.framing} accessibilityRole="radiogroup" accessibilityLabel="Framing">
      {(['16:9', '1:1'] as const).map((f) => {
        const on = props.framing === f;
        return (
          <Pressable
            key={f}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => props.onChange(f)}
            hitSlop={8}
            style={styles.framingItem}
          >
            <Text style={[styles.framingText, on && styles.framingTextOn, props.textStyle]}>
              {f}
            </Text>
            <View style={[styles.framingDot, on && styles.framingDotOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

// MARK: - Level (top of the screen)

const LEVEL_OK_DEG = 1;
const RAD = 180 / Math.PI;

/**
 * Horizon level in the top bar (where Camera M has it), on the UI thread. The outer segments
 * stay put; the middle one follows the horizon (relative to the nearest upright or sideways
 * position) and everything turns green within 1°. Fades out when the phone lies flat.
 */
export function Level() {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' });

  const read = () => {
    'worklet';
    const { x, y, z } = gravity.sensor.value;
    const roll = Math.atan2(-x, y) * RAD;
    const tilt = roll - Math.round(roll / 90) * 90;
    return { tilt, ok: Math.abs(tilt) < LEVEL_OK_DEG, flat: Math.abs(z) > 8.6 };
  };

  const wrap = useAnimatedStyle(() => ({ opacity: read().flat ? 0.25 : 1 }));
  const sides = useAnimatedStyle(() => ({
    backgroundColor: read().ok ? c.level : c.levelIdle,
  }));
  const middle = useAnimatedStyle(() => {
    const { tilt, ok } = read();
    return {
      backgroundColor: ok ? c.level : c.control,
      transform: [{ rotate: `${-Math.max(-30, Math.min(30, tilt))}deg` }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.level, wrap]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.levelSide, sides]} />
      <Animated.View style={[styles.levelMiddle, middle]} />
      <Animated.View style={[styles.levelSide, sides]} />
    </Animated.View>
  );
}

// MARK: - Grid (rule of thirds inside the crop)

export const Grid = memo(function Grid(props: {
  rect: { left: number; top: number; width: number; height: number };
}) {
  const { left, top, width, height } = props.rect;
  const line = { position: 'absolute', backgroundColor: c.gridLine } as const;
  const hair = StyleSheet.hairlineWidth;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[1, 2].map((i) => (
        <View
          key={`v${i}`}
          style={[line, { left: left + (width * i) / 3, top, height, width: hair }]}
        />
      ))}
      {[1, 2].map((i) => (
        <View
          key={`h${i}`}
          style={[line, { top: top + (height * i) / 3, left, width, height: hair }]}
        />
      ))}
    </View>
  );
});

// MARK: - Histogram

const HIST_W = 112;
const HIST_H = 34;

function curve(bins: number[]): string {
  const dx = HIST_W / (BINS - 1);
  const pts = bins.map((v, i) => `${(i * dx).toFixed(1)},${(HIST_H - v * HIST_H).toFixed(1)}`);
  return `M0,${HIST_H} L${pts.join(' L')} L${HIST_W},${HIST_H} Z`;
}

/** The plotted bins; re-renders only itself when new data arrives. */
function HistogramPlot() {
  const bins = useHistogramBins();
  return (
    <Svg width={HIST_W} height={HIST_H}>
      {bins ? (
        <Path d={curve(bins)} fill="rgba(255,255,255,0.32)" stroke={c.control} strokeWidth={1} />
      ) : null}
      <Rect
        x={0}
        y={HIST_H - StyleSheet.hairlineWidth}
        width={HIST_W}
        height={1}
        fill={c.gridLine}
      />
    </Svg>
  );
}

/**
 * Mounted only while the histogram is on: owns the frame output (and its worklet thread), so
 * nothing runs on camera frames otherwise. Hands the output up for the camera to attach.
 */
export function HistogramSource(props: { onOutput(output: unknown): void }) {
  const output = useHistogramOutput();
  const report = useRef(props.onOutput);
  report.current = props.onOutput;
  useEffect(() => {
    report.current(output);
    return () => report.current(null);
  }, [output]);
  return null;
}

export function HistogramView() {
  return (
    <View pointerEvents="none" style={styles.histogram} accessibilityElementsHidden>
      <HistogramPlot />
    </View>
  );
}

// MARK: - Exposure readout (AUTO · ISO · ƒ · shutter)

export const formatShutter = (s: number) =>
  s >= 1 ? `${Math.round(s * 10) / 10}"` : `1/${Math.max(1, Math.round(1 / s))}`;
export const formatAperture = (f: number) =>
  (Math.round(f * 100) / 100).toFixed(2).replace(/0$/, '');

/** Reads ISO and shutter from the running camera twice a second; re-renders only this row. */
export const ExposureReadout = memo(function ExposureReadout(props: {
  cameraRef: RefObject<CameraRef | null>;
  aperture: number | null;
  bias: number;
  histogramOn: boolean;
  /** Omitted when frame processing isn't available: no histogram toggle. */
  onHistogram?(): void;
}) {
  const [live, setLive] = useState<{ iso: number | null; sec: number | null }>({
    iso: null,
    sec: null,
  });
  useEffect(() => {
    const id = setInterval(() => {
      const ctl = props.cameraRef.current?.controller;
      const iso = ctl && ctl.iso > 0 ? Math.round(ctl.iso) : null;
      const sec = ctl && ctl.exposureDuration > 0 ? ctl.exposureDuration : null;
      setLive((old) => (old.iso === iso && old.sec === sec ? old : { iso, sec }));
    }, 500);
    return () => clearInterval(id);
  }, [props.cameraRef]);

  const bias =
    Math.abs(props.bias) < 0.05
      ? null
      : `${props.bias > 0 ? '+' : '−'}${Math.abs(props.bias).toFixed(1)}`;
  const items = [
    { label: 'ISO', value: live.iso == null ? '—' : String(live.iso) },
    { label: 'ƒ', value: props.aperture == null ? '—' : formatAperture(props.aperture) },
    { label: 'S', value: live.sec == null ? '—' : formatShutter(live.sec) },
  ];

  return (
    <View style={styles.readout}>
      <Text
        style={[styles.readoutMode, bias != null && { color: c.control }]}
        accessibilityLabel={bias ? `Exposure ${bias} stops` : 'Auto exposure'}
      >
        {bias ? `${bias} EV` : 'AUTO'}
      </Text>
      <View
        style={styles.readoutValues}
        accessible
        accessibilityLabel={`ISO ${items[0]!.value}, aperture ${items[1]!.value}, shutter ${items[2]!.value}`}
      >
        {items.map((v) => (
          <Text key={v.label} style={styles.readoutItem}>
            <Text style={styles.readoutLabel}>{v.label} </Text>
            {v.value}
          </Text>
        ))}
      </View>
      {props.onHistogram ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Histogram"
          accessibilityState={{ checked: props.histogramOn }}
          onPress={props.onHistogram}
          hitSlop={10}
          style={styles.readoutToggle}
        >
          <HistogramGlyph active={props.histogramOn} />
        </Pressable>
      ) : (
        <View style={styles.readoutToggle} />
      )}
    </View>
  );
});

/** Three bars, the histogram toggle's icon. */
function HistogramGlyph({ active }: { active: boolean }) {
  const color = active ? c.control : c.controlMuted;
  return (
    <Svg width={20} height={16} viewBox="0 0 20 16">
      <Path
        d="M1,15 L1,10 M5,15 L5,6 M9,15 L9,2 M13,15 L13,7 M17,15 L17,11"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// MARK: - Panel controls

export function ToggleButton(props: {
  icon: IconName;
  label: string;
  /** Undefined for actions (flip); true / false for switches. */
  active?: boolean;
  onPress(): void;
  iconStyle?: object;
}) {
  const on = props.active !== false;
  return (
    <Pressable
      accessibilityRole={props.active == null ? 'button' : 'switch'}
      accessibilityLabel={props.label}
      accessibilityState={props.active == null ? undefined : { checked: props.active }}
      onPress={props.onPress}
      hitSlop={6}
      style={styles.toggle}
    >
      <Icon
        name={props.icon}
        size={22}
        color={on ? c.control : c.controlOff}
        style={props.iconStyle}
      />
    </Pressable>
  );
}

// MARK: - Zoom (right of the shutter)

export interface Lens {
  zoom: number;
  label: string;
}

/**
 * Vertical lens column: the longer lens above, the active one highlighted, the wider below.
 * Tap a lens or swipe up / down to step; between lenses (after a pinch) it shows the factor.
 */
export function ZoomWheel(props: {
  lenses: Lens[];
  zoom: number;
  displayFactor: number;
  onSelect(zoom: number): void;
  labelStyle?: object;
}) {
  const sorted = [...props.lenses].sort((a, b) => a.zoom - b.zoom);
  let idx = 0;
  sorted.forEach((l, i) => {
    if (props.zoom >= l.zoom - 0.05) idx = i;
  });
  const exact = Math.abs((sorted[idx]?.zoom ?? 0) - props.zoom) < 0.05;
  const above = sorted[idx + 1];
  const below = exact ? sorted[idx - 1] : sorted[idx];
  const current = exact ? `${sorted[idx]?.label}×` : `${trim(props.displayFactor)}×`;

  const select = useRef(props.onSelect);
  select.current = props.onSelect;
  const steps = useRef({ above, below });
  steps.current = { above, below };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12,
      onPanResponderRelease: (_, g) => {
        const target = g.dy < 0 ? steps.current.above : steps.current.below;
        if (target) select.current(target.zoom);
      },
    }),
  ).current;

  return (
    <View
      style={styles.wheel}
      {...swipe.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Zoom ${current}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const target = e.nativeEvent.actionName === 'increment' ? above : below;
        if (target) props.onSelect(target.zoom);
      }}
    >
      <WheelStep lens={above} onSelect={props.onSelect} labelStyle={props.labelStyle} />
      <View style={styles.wheelActive}>
        <Text style={[styles.wheelActiveText, props.labelStyle]}>{current}</Text>
      </View>
      <WheelStep lens={below} onSelect={props.onSelect} labelStyle={props.labelStyle} />
    </View>
  );
}

function WheelStep(props: { lens?: Lens; onSelect(z: number): void; labelStyle?: object }) {
  if (!props.lens) return <View style={styles.wheelStep} />;
  const lens = props.lens;
  return (
    <Pressable
      onPress={() => props.onSelect(lens.zoom)}
      hitSlop={6}
      style={styles.wheelStep}
      importantForAccessibility="no"
    >
      <Text style={[styles.wheelStepText, props.labelStyle]}>{lens.label}</Text>
    </Pressable>
  );
}

export const trim = (z: number) => {
  const r = Math.round(z * 10) / 10;
  return r < 1 ? `.${Math.round(r * 10)}` : String(r);
};

export const panelStyle: ViewStyle = {
  flex: 1,
  borderTopLeftRadius: 28,
  borderTopRightRadius: 28,
  backgroundColor: c.panel,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderColor: c.panelEdge,
};

const styles = StyleSheet.create({
  framing: { flexDirection: 'row', gap: 16, width: 96 },
  framingItem: { alignItems: 'center', gap: 4, minHeight: 32, justifyContent: 'center' },
  framingText: { color: c.controlOff, fontSize: 13, fontWeight: '500', letterSpacing: 0.4 },
  framingTextOn: { color: c.control, fontWeight: '600' },
  framingDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'transparent' },
  framingDotOn: { backgroundColor: c.control },
  level: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  levelSide: { width: 18, height: 1.5, borderRadius: 1 },
  levelMiddle: { width: 56, height: 1.5, borderRadius: 1 },
  histogram: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  readout: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, height: 40 },
  readoutMode: {
    width: 64,
    color: c.controlMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  readoutValues: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 18 },
  readoutItem: {
    minWidth: 58,
    textAlign: 'center',
    color: c.control,
    fontSize: 13,
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
  },
  readoutLabel: { color: c.controlMuted, fontSize: 11 },
  readoutToggle: { width: 64, alignItems: 'flex-end', justifyContent: 'center', height: 40 },
  toggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  wheel: { width: 56, alignItems: 'center', gap: 2 },
  wheelActive: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelActiveText: {
    color: c.control,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  wheelStep: { height: 28, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  wheelStepText: {
    color: c.controlOff,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
