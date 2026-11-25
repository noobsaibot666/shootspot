import {
  daylightSummary,
  formatBearing,
  normalizeBearing,
  sunAtCapture,
  toCardinal,
} from '@shootspot/shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { camera as c, font } from '../theme/tokens';
import type { FieldFix } from './sensors';

const GOLD = '#FFD60A';
const VIEW_FOV_DEG = 68;
const ELEVATION_SPAN_DEG = 55;

/** Signed angular difference in [-180, 180]. */
function signedDeltaDeg(target: number, center: number): number {
  const d = normalizeBearing(target - center);
  return d > 180 ? d - 360 : d;
}

/**
 * Opt-in Live Scout Compass overlay (Phase 1.5E) for the camera viewfinder.
 * Projects the current sun position and today's sun-path arc onto the live compass heading
 * without interfering with tap-to-focus, exposure drag, or pinch-to-zoom.
 */
export function ScoutCompassOverlay(props: {
  preview: LayoutRectangle;
  fix: FieldFix | null;
  headingDeg: number | null;
}) {
  const { preview, fix, headingDeg } = props;
  const now = useMemo(() => new Date(), []);

  const solar = useMemo(() => {
    if (!fix) return null;
    const summary = daylightSummary(now, fix.lat, fix.lon);
    const sun = sunAtCapture(now, fix.lat, fix.lon);
    const sunriseAz = summary.sunrise
      ? sunAtCapture(summary.sunrise, fix.lat, fix.lon).azimuthDeg
      : null;
    const sunsetAz = summary.sunset
      ? sunAtCapture(summary.sunset, fix.lat, fix.lon).azimuthDeg
      : null;
    const goldenPmAz = summary.goldenHour
      ? sunAtCapture(summary.goldenHour, fix.lat, fix.lon).azimuthDeg
      : null;
    return { summary, sun, sunriseAz, sunsetAz, goldenPmAz };
  }, [fix, now]);

  if (headingDeg == null) {
    return (
      <View pointerEvents="none" style={styles.statusWrap}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Calibrating compass…</Text>
        </View>
      </View>
    );
  }

  const w = preview.width;
  const h = preview.height;
  const horizonY = h * 0.58;
  const pxPerDegX = w / VIEW_FOV_DEG;
  const pxPerDegY = (h * 0.42) / ELEVATION_SPAN_DEG;

  const projectX = (azDeg: number) => w / 2 + signedDeltaDeg(azDeg, headingDeg) * pxPerDegX;
  const projectY = (elDeg: number) => horizonY - elDeg * pxPerDegY;

  // Build visible sun-path arc segments (only points near the horizon/in front of the camera).
  const arcSegments: string[] = [];
  if (solar) {
    let current = '';
    for (const pt of solar.summary.sunPath) {
      const dx = signedDeltaDeg(pt.azimuthDeg, headingDeg);
      if (pt.elevationDeg < -6 || Math.abs(dx) > VIEW_FOV_DEG * 0.75) {
        if (current) {
          arcSegments.push(current);
          current = '';
        }
        continue;
      }
      const x = projectX(pt.azimuthDeg).toFixed(1);
      const y = projectY(pt.elevationDeg).toFixed(1);
      current += current ? ` L ${x} ${y}` : `M ${x} ${y}`;
    }
    if (current) arcSegments.push(current);
  }

  const sunDelta = solar ? signedDeltaDeg(solar.sun.azimuthDeg, headingDeg) : null;
  const sunInView = sunDelta != null && Math.abs(sunDelta) <= VIEW_FOV_DEG / 2;

  // Cardinal ticks every 45° inside the visible tape.
  const cardinals = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((deg) => ({ deg, label: toCardinal(deg), delta: signedDeltaDeg(deg, headingDeg) }))
    .filter((item) => Math.abs(item.delta) <= VIEW_FOV_DEG * 0.55);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={w} height={h}>
        {/* Subtle horizon line */}
        <Line
          x1={0}
          y1={horizonY}
          x2={w}
          y2={horizonY}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Cardinal ticks along horizon */}
        {cardinals.map((item) => {
          const x = w / 2 + item.delta * pxPerDegX;
          return (
            <SvgText
              key={item.deg}
              x={x}
              y={horizonY + 14}
              fontSize={10}
              fontWeight="700"
              fill="rgba(255,255,255,0.65)"
              textAnchor="middle"
            >
              {item.label}
            </SvgText>
          );
        })}

        {/* Sun path arc */}
        {arcSegments.map((d, idx) => (
          <Path key={idx} d={d} stroke={GOLD} strokeWidth={2} strokeOpacity={0.75} fill="none" />
        ))}

        {/* Sunrise / Sunset / Golden PM horizon markers */}
        {solar?.sunriseAz != null &&
        Math.abs(signedDeltaDeg(solar.sunriseAz, headingDeg)) <= VIEW_FOV_DEG / 2 ? (
          <SvgText
            x={projectX(solar.sunriseAz)}
            y={horizonY - 8}
            fontSize={10}
            fontWeight="700"
            fill={GOLD}
            textAnchor="middle"
          >
            RISE
          </SvgText>
        ) : null}
        {solar?.sunsetAz != null &&
        Math.abs(signedDeltaDeg(solar.sunsetAz, headingDeg)) <= VIEW_FOV_DEG / 2 ? (
          <SvgText
            x={projectX(solar.sunsetAz)}
            y={horizonY - 8}
            fontSize={10}
            fontWeight="700"
            fill="#FF6B4A"
            textAnchor="middle"
          >
            SET
          </SvgText>
        ) : null}
        {solar?.goldenPmAz != null &&
        Math.abs(signedDeltaDeg(solar.goldenPmAz, headingDeg)) <= VIEW_FOV_DEG / 2 ? (
          <Circle
            cx={projectX(solar.goldenPmAz)}
            cy={projectY(6)}
            r={4}
            fill="none"
            stroke={GOLD}
            strokeWidth={1.5}
          />
        ) : null}

        {/* Active sun dot */}
        {solar && sunInView ? (
          <>
            <Circle
              cx={projectX(solar.sun.azimuthDeg)}
              cy={projectY(solar.sun.elevationDeg)}
              r={8}
              fill={solar.sun.elevationDeg >= 0 ? GOLD : 'rgba(255,214,10,0.2)'}
              stroke={GOLD}
              strokeWidth={2}
            />
            <SvgText
              x={projectX(solar.sun.azimuthDeg)}
              y={projectY(solar.sun.elevationDeg) - 13}
              fontSize={10}
              fontWeight="700"
              fill={GOLD}
              textAnchor="middle"
            >
              {`${Math.round(solar.sun.elevationDeg)}°`}
            </SvgText>
          </>
        ) : null}
      </Svg>

      {/* Top HUD: live heading + sun direction cue */}
      <View style={styles.hud}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{formatBearing(headingDeg)}</Text>
          {solar && sunDelta != null ? (
            <Text style={styles.sunCue}>
              {sunInView
                ? ` · ☀ ${Math.round(solar.sun.elevationDeg)}° el`
                : sunDelta < 0
                  ? ` · ☀ ${Math.round(Math.abs(sunDelta))}° L`
                  : ` · ☀ ${Math.round(sunDelta)}° R`}
            </Text>
          ) : !fix ? (
            <Text style={styles.sunCue}> · Waiting for GPS</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statusWrap: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hud: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.backplate,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: {
    color: c.control,
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: '700',
  },
  sunCue: {
    color: GOLD,
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: '600',
  },
});
