import type { Framing } from '@shootspot/shared';
import { File, Paths } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { SensorType, useAnimatedSensor, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { camera as c } from '../theme/tokens';
import { Icon, type IconName } from '../ui/icon';
import { BINS, type Histogram } from './histogram';

/**
 * Camera M-style pieces for the capture screen (owner request): framing badge, level, grid,
 * live histogram, exposure readout, quick toggles, zoom wheel and the tinted control panel.
 * Only the look is borrowed: ShootSpot stays a scouting camera (JPEG, 16:9 or 1:1).
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

// MARK: - Framing badge (top left, where Camera M shows PRO RAW)

export function FramingBadge(props: { framing: Framing; onPress(): void; style?: ViewStyle }) {
  const next = props.framing === '16:9' ? '1:1' : '16:9';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Framing ${props.framing}`}
      accessibilityHint={`Switches to ${next}`}
      onPress={props.onPress}
      hitSlop={10}
      style={[styles.badge, props.style]}
    >
      <View style={styles.badgePill}>
        <Text style={styles.badgePillText}>FRAME</Text>
      </View>
      <Text style={styles.badgeValue}>{props.framing}</Text>
    </Pressable>
  );
}

// MARK: - Level (centre of the viewfinder)

const LEVEL_OK_DEG = 1;
const RAD = 180 / Math.PI;

/**
 * Horizon level on the UI thread. The side ticks follow the phone's nearest upright or sideways
 * position; the centre line follows the real horizon and both turn green within 1°. Hidden when
 * the phone lies flat (no horizon to level).
 */
export function Level() {
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' });

  const read = () => {
    'worklet';
    const { x, y, z } = gravity.sensor.value;
    const roll = Math.atan2(-x, y) * RAD;
    const snap = Math.round(roll / 90) * 90;
    const flat = Math.abs(z) > 8.6;
    return { roll, snap, ok: Math.abs(roll - snap) < LEVEL_OK_DEG, flat };
  };

  const frame = useAnimatedStyle(() => {
    const { snap, flat } = read();
    return { opacity: flat ? 0 : 1, transform: [{ rotate: `${-snap}deg` }] };
  });
  const ticks = useAnimatedStyle(() => ({
    backgroundColor: read().ok ? c.level : 'rgba(255,255,255,0.75)',
  }));
  const line = useAnimatedStyle(() => {
    const { roll, snap, ok } = read();
    return {
      backgroundColor: ok ? c.level : c.control,
      transform: [{ rotate: `${-(roll - snap)}deg` }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.level, frame]}>
      <Animated.View style={[styles.levelTick, ticks]} />
      <Animated.View style={[styles.levelLine, line]} />
      <Animated.View style={[styles.levelTick, ticks]} />
    </Animated.View>
  );
}

// MARK: - Grid (rule of thirds inside the crop)

export function Grid(props: {
  rect: { left: number; top: number; width: number; height: number };
}) {
  const { left, top, width, height } = props.rect;
  const line = { position: 'absolute', backgroundColor: c.gridLine } as const;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[1, 2].map((i) => (
        <View
          key={`v${i}`}
          style={[
            line,
            { left: left + (width * i) / 3, top, height, width: StyleSheet.hairlineWidth },
          ]}
        />
      ))}
      {[1, 2].map((i) => (
        <View
          key={`h${i}`}
          style={[
            line,
            { top: top + (height * i) / 3, left, width, height: StyleSheet.hairlineWidth },
          ]}
        />
      ))}
    </View>
  );
}

// MARK: - Histogram

const HIST_W = 180;
const HIST_H = 54;

function curve(bins: number[], close: boolean): string {
  const dx = HIST_W / (BINS - 1);
  const pts = bins.map((v, i) => `${(i * dx).toFixed(1)},${(HIST_H - v * HIST_H).toFixed(1)}`);
  const d = `M${pts.join(' L')}`;
  return close ? `${d} L${HIST_W},${HIST_H} L0,${HIST_H} Z` : d;
}

const CHANNELS = [
  { key: 'r', color: '#FF453A' },
  { key: 'g', color: '#30D158' },
  { key: 'b', color: '#0A84FF' },
] as const;

export function HistogramView({ histogram }: { histogram: Histogram | null }) {
  return (
    <View pointerEvents="none" style={styles.histogram} accessibilityElementsHidden>
      <Svg width={HIST_W} height={HIST_H}>
        {histogram
          ? CHANNELS.map(({ key, color }) => (
              <Path key={`${key}f`} d={curve(histogram[key], true)} fill={color} opacity={0.22} />
            ))
          : null}
        {histogram
          ? CHANNELS.map(({ key, color }) => (
              <Path
                key={key}
                d={curve(histogram[key], false)}
                stroke={color}
                strokeWidth={1.5}
                fill="none"
              />
            ))
          : null}
        <Rect x={0} y={HIST_H - 1} width={HIST_W} height={1} fill="rgba(255,255,255,0.35)" />
      </Svg>
    </View>
  );
}

/** Small RGB curves, the histogram toggle's icon. */
export function HistogramGlyph({ active }: { active: boolean }) {
  return (
    <Svg width={30} height={22} viewBox="0 0 30 22" opacity={active ? 1 : 0.55}>
      <Path
        d="M1,19 C5,19 6,6 9,6 C12,6 12,17 15,17 C18,17 19,10 22,10 C25,10 26,19 29,19"
        stroke="#FF453A"
        strokeWidth={1.8}
        fill="none"
      />
      <Path
        d="M1,19 C4,19 6,12 9,12 C12,12 13,4 16,4 C19,4 20,15 23,15 C26,15 27,19 29,19"
        stroke="#30D158"
        strokeWidth={1.8}
        fill="none"
      />
      <Path
        d="M1,19 C4,19 5,15 8,15 C11,15 12,9 15,9 C18,9 19,6 22,6 C25,6 26,19 29,19"
        stroke="#0A84FF"
        strokeWidth={1.8}
        fill="none"
      />
      <Rect x={1} y={20.5} width={28} height={1.2} fill={active ? c.control : c.controlMuted} />
    </Svg>
  );
}

// MARK: - Exposure readout (A · ISO · F · SEC)

export interface Exposure {
  iso: number | null;
  seconds: number | null;
  aperture: number | null;
}

/** Reads ISO and shutter speed from the running camera a few times a second. */
export function useExposureReadout(read: () => { iso: number; seconds: number } | null) {
  const [value, setValue] = useState<{ iso: number | null; seconds: number | null }>({
    iso: null,
    seconds: null,
  });
  const reader = useRef(read);
  reader.current = read;
  useEffect(() => {
    const id = setInterval(() => {
      const v = reader.current();
      setValue((old) => {
        const iso = v && v.iso > 0 ? Math.round(v.iso) : null;
        const seconds = v && v.seconds > 0 ? v.seconds : null;
        return old.iso === iso && old.seconds === seconds ? old : { iso, seconds };
      });
    }, 350);
    return () => clearInterval(id);
  }, []);
  return value;
}

export const formatShutter = (s: number) =>
  s >= 1 ? `${Math.round(s * 10) / 10}"` : `1/${Math.max(1, Math.round(1 / s))}`;
export const formatAperture = (f: number) => String(Math.round(f * 100) / 100);

export function ExposureRow(props: {
  exposure: Exposure;
  bias: number;
  histogramOn: boolean;
  onHistogram(): void;
}) {
  const { iso, seconds, aperture } = props.exposure;
  const values = [
    { label: 'ISO', value: iso == null ? '—' : String(iso) },
    { label: 'F', value: aperture == null ? '—' : formatAperture(aperture) },
    { label: 'SEC', value: seconds == null ? '—' : formatShutter(seconds) },
  ];
  const biasText =
    Math.abs(props.bias) < 0.05 ? null : `${props.bias > 0 ? '+' : ''}${props.bias.toFixed(1)}`;
  return (
    <View style={styles.readout}>
      <View
        style={styles.readoutSide}
        accessible
        accessibilityLabel={biasText ? `Auto exposure, ${biasText} stops` : 'Auto exposure'}
      >
        <Text style={styles.mode}>A</Text>
        {biasText ? <Text style={styles.bias}>{biasText}</Text> : null}
      </View>
      <View
        style={styles.readoutValues}
        accessible
        accessibilityLabel={values.map((v) => `${v.label} ${v.value}`).join(', ')}
      >
        {values.map((v) => (
          <View key={v.label} style={styles.readoutItem}>
            <Text style={styles.readoutLabel}>{v.label}</Text>
            <Text style={styles.readoutValue}>{v.value}</Text>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Histogram"
        accessibilityState={{ checked: props.histogramOn }}
        onPress={props.onHistogram}
        hitSlop={10}
        style={[styles.readoutSide, { alignItems: 'flex-end' }]}
      >
        <HistogramGlyph active={props.histogramOn} />
      </Pressable>
    </View>
  );
}

// MARK: - Control panel

/** Rounded panel tinted by the scene's average colour (like Camera M's red glow on a red subject). */
export function Panel(props: {
  tint: { r: number; g: number; b: number } | null;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const t = props.tint;
  const color = t ? `rgb(${Math.round(t.r)},${Math.round(t.g)},${Math.round(t.b)})` : '#3A3A3C';
  return (
    <View style={[styles.panel, props.style]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="tint" cx="20%" cy="0%" rx="90%" ry="120%">
            <Stop offset="0" stopColor={color} stopOpacity={0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tint)" />
      </Svg>
      {props.children}
    </View>
  );
}

export function ToggleButton(props: {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress(): void;
  iconStyle?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={props.active == null ? undefined : { selected: props.active }}
      onPress={props.onPress}
      hitSlop={6}
      style={styles.toggle}
    >
      <Icon
        name={props.icon}
        size={26}
        color={props.active === false ? c.controlMuted : c.control}
        style={props.iconStyle}
      />
    </Pressable>
  );
}

// MARK: - Zoom wheel (right of the shutter)

export interface Lens {
  zoom: number;
  label: string;
}

/**
 * Vertical lens picker: the active lens in a ring, the next lenses faded above (longer) and
 * below (wider). Tap one or swipe up / down to step.
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
      <Text style={[styles.wheelStepText, props.labelStyle]}>{lens.label}×</Text>
    </Pressable>
  );
}

export const trim = (z: number) => {
  const r = Math.round(z * 10) / 10;
  return r < 1 ? `.${Math.round(r * 10)}` : String(r);
};

const styles = StyleSheet.create({
  badge: { alignItems: 'center', gap: 1 },
  badgePill: {
    backgroundColor: c.accent,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgePillText: { color: '#000', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  badgeValue: { color: c.accent, fontSize: 19, fontWeight: '600', letterSpacing: 0.3 },
  level: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelTick: { width: 26, height: 2, borderRadius: 1 },
  levelLine: { width: 96, height: 2, borderRadius: 1 },
  histogram: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 52,
  },
  readoutSide: { width: 56, flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  mode: { color: c.control, fontSize: 22, fontWeight: '400' },
  bias: { color: c.accent, fontSize: 12, fontWeight: '600' },
  readoutValues: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 22 },
  readoutItem: { alignItems: 'center' },
  readoutLabel: { color: c.controlMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.8 },
  readoutValue: {
    color: c.control,
    fontSize: 18,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  panel: {
    flex: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: c.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  toggle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  wheel: { width: 64, alignItems: 'center', gap: 6 },
  wheelActive: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelActiveText: { color: c.control, fontSize: 15, fontWeight: '600' },
  wheelStep: { height: 26, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  wheelStepText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
});
