import {
  buildShootIcs,
  daylightSummary,
  formatBearing,
  horizontalFovDeg,
  lightAngle,
  moonSummary,
  nextBestLight,
  sunAtCapture,
  type LightAngle,
} from '@shootspot/shared';
import { File, Paths } from 'expo-file-system';
import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  Share,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { font, radius, space, type, useTheme } from '../theme/tokens';
import { Icon } from './icon';
import { Mono, Row } from './index';

const LIGHT_LABEL: Record<LightAngle, string> = {
  backlit: 'Backlit',
  side_lit: 'Side-lit',
  front_lit: 'Front-lit',
  sun_down: 'Sun below horizon',
};

const GOLD = '#FFB800';
const BLUE_HOUR = '#3B82F6';

function fmtTime(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function polarToXY(cx: number, cy: number, r: number, degClockwiseFromNorth: number) {
  const rad = ((degClockwiseFromNorth - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sectorPath(
  cx: number,
  cy: number,
  r: number,
  centerDeg: number,
  spreadDeg: number,
): string {
  const start = polarToXY(cx, cy, r, centerDeg - spreadDeg / 2);
  const end = polarToXY(cx, cy, r, centerDeg + spreadDeg / 2);
  const largeArc = spreadDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)} Z`;
}

/**
 * Interactive Sun-Path & Light Planner (Phase 1.5A).
 * Runs 100% locally via `suncalc` in `@shootspot/shared` with zero external API calls.
 */
export function LightPlanner(props: {
  recordId?: string;
  recordLabel?: string;
  lat: number;
  lon: number;
  bearingDeg: number | null;
  focalLength35mm: number | null;
  capturedAt: string;
  showMoonByDefault?: boolean;
  selectedTime: Date;
  onTimeChange(next: Date): void;
}) {
  const t = useTheme();
  const { lat, lon, bearingDeg, focalLength35mm, selectedTime, onTimeChange } = props;
  const [showMoon, setShowMoon] = useState(Boolean(props.showMoonByDefault));
  const [barWidth, setBarWidth] = useState(0);

  const summary = useMemo(
    () => daylightSummary(selectedTime, lat, lon),
    // Recompute only when calendar day or coordinates change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTime.getFullYear(), selectedTime.getMonth(), selectedTime.getDate(), lat, lon],
  );

  const sun = useMemo(() => sunAtCapture(selectedTime, lat, lon), [selectedTime, lat, lon]);
  const angle = bearingDeg != null ? lightAngle(bearingDeg, sun) : null;
  const nextGolden = useMemo(
    () => nextBestLight(new Date(), lat, lon, bearingDeg),
    [lat, lon, bearingDeg],
  );
  const moon = useMemo(() => moonSummary(selectedTime, lat, lon), [selectedTime, lat, lon]);

  const minutesOfDay = selectedTime.getHours() * 60 + selectedTime.getMinutes();

  function setDateKeepingTime(target: Date) {
    const next = new Date(target);
    next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
    onTimeChange(next);
  }

  function shiftDays(delta: number) {
    const next = new Date(selectedTime);
    next.setDate(next.getDate() + delta);
    onTimeChange(next);
  }

  function setMinutes(mins: number) {
    const clamped = Math.max(0, Math.min(1439, Math.round(mins)));
    const next = new Date(selectedTime);
    next.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
    onTimeChange(next);
  }

  function setToInstant(d: Date | null) {
    if (!d || Number.isNaN(d.getTime())) return;
    onTimeChange(new Date(d));
  }

  function handleBarTouch(e: GestureResponderEvent) {
    if (barWidth <= 0) return;
    const x = Math.max(0, Math.min(barWidth, e.nativeEvent.locationX));
    setMinutes((x / barWidth) * 1439);
  }

  async function exportCalendarWindow() {
    const isMorning = selectedTime.getHours() < 12;
    const start =
      (isMorning ? summary.sunrise : summary.goldenHour) ?? new Date(selectedTime.getTime());
    const end =
      (isMorning ? summary.goldenHourEnd : summary.sunset) ??
      new Date(start.getTime() + 60 * 60 * 1000);
    const labelName = props.recordLabel ?? 'ShootSpot location';
    const windowName = isMorning ? 'Golden Hour AM' : 'Golden Hour PM';
    const descParts = [
      bearingDeg != null ? `Camera faces ${formatBearing(bearingDeg)}` : null,
      angle ? `Light: ${LIGHT_LABEL[angle]}` : null,
      `Coordinates: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    ].filter(Boolean);

    const ics = buildShootIcs({
      uid: `${props.recordId ?? 'spot'}-${start.toISOString()}`,
      title: `${windowName} · ${labelName}`,
      start,
      end,
      lat,
      lon,
      description: descParts.join('\n'),
    });

    try {
      const file = new File(Paths.cache, 'shootspot-window.ics');
      if (!file.exists) file.create({ overwrite: true });
      await file.write(ics);
      if (Platform.OS === 'ios') {
        await Share.share({ url: file.uri, title: `${windowName} · ${labelName}` });
      } else {
        await Share.share({
          title: `${windowName} · ${labelName}`,
          message: `${windowName} at ${labelName} (${fmtTime(start)}–${fmtTime(end)})\n${descParts.join('\n')}`,
        });
      }
    } catch {
      Alert.alert('Could not export', 'Calendar export is unavailable right now.');
    }
  }

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const nextWeek = new Date(today.getTime() + 7 * 86_400_000);
  const captureDate = new Date(props.capturedAt);

  // Build SVG sun-path polyline for points above -6° (civil twilight to daylight).
  const dialSize = 132;
  const cx = dialSize / 2;
  const cy = dialSize / 2;
  const rimR = 50;
  const fov = horizontalFovDeg(focalLength35mm);

  const sunArcPath = useMemo(() => {
    const pts = summary.sunPath
      .filter((p) => p.elevationDeg >= -6)
      .map((p) => {
        // Project elevation [0..90] -> [rimR..8]; negative clamped to rimR.
        const elev = Math.max(0, Math.min(90, p.elevationDeg));
        const r = rimR * (1 - elev / 90);
        return polarToXY(cx, cy, r, p.azimuthDeg);
      });
    if (pts.length < 2) return '';
    return pts
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
  }, [summary.sunPath, cx, cy, rimR]);

  const activeSunR = rimR * (1 - Math.max(0, Math.min(90, sun.elevationDeg)) / 90);
  const activeSunPt = polarToXY(cx, cy, activeSunR, sun.azimuthDeg);
  const sunrisePos = summary.sunrise ? sunAtCapture(summary.sunrise, lat, lon) : null;
  const sunsetPos = summary.sunset ? sunAtCapture(summary.sunset, lat, lon) : null;

  // Timeline bar percentages (0..100%)
  const pct = (d: Date | null) => {
    if (!d || !sameDay(d, selectedTime)) return null;
    return ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;
  };
  const dawnPct = pct(summary.dawn) ?? 0;
  const risePct = pct(summary.sunrise) ?? dawnPct;
  const gAmEndPct = pct(summary.goldenHourEnd) ?? risePct;
  const gPmStartPct = pct(summary.goldenHour) ?? 75;
  const setPct = pct(summary.sunset) ?? gPmStartPct;
  const duskPct = pct(summary.dusk) ?? setPct;
  const thumbPct = (minutesOfDay / 1440) * 100;

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.md,
      }}
    >
      {/* Header + Next Best Light banner */}
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: space.xs }}>
          <Icon name="sun" size={18} color={GOLD} />
          <Text style={[type.headline, { color: t.ink }]}>Sun & light planner</Text>
        </Row>
        <Text style={[type.caption, { color: t.muted }]}>{fmtShortDate(selectedTime)}</Text>
      </Row>

      {nextGolden ? (
        <View
          style={{
            backgroundColor: t.raised,
            borderRadius: radius.control,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
          }}
        >
          <Icon name="sunset" size={16} color={GOLD} />
          <Text style={[type.caption, { color: t.ink, flex: 1 }]}>
            Next golden hour:{' '}
            <Text style={{ fontWeight: '600' }}>
              {sameDay(nextGolden.start, today) ? 'Today' : 'Tomorrow'} {fmtTime(nextGolden.start)}–
              {fmtTime(nextGolden.end)}
            </Text>
            {nextGolden.lightAngle ? ` · ${LIGHT_LABEL[nextGolden.lightAngle]}` : ''}
          </Text>
        </View>
      ) : null}

      {/* Date quick-select + steppers */}
      <Row style={{ justifyContent: 'space-between', gap: space.xs }}>
        <Row style={{ gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {[
            {
              label: 'Today',
              active: sameDay(selectedTime, today),
              onPress: () => setDateKeepingTime(today),
            },
            {
              label: 'Tomorrow',
              active: sameDay(selectedTime, tomorrow),
              onPress: () => setDateKeepingTime(tomorrow),
            },
            {
              label: '+7d',
              active: sameDay(selectedTime, nextWeek),
              onPress: () => setDateKeepingTime(nextWeek),
            },
            {
              label: 'Capture',
              active: sameDay(selectedTime, captureDate),
              onPress: () => onTimeChange(new Date(captureDate)),
            },
          ].map((p) => (
            <Pressable
              key={p.label}
              accessibilityRole="button"
              onPress={p.onPress}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: p.active ? t.accent : t.raised,
              }}
            >
              <Text
                style={[
                  type.caption,
                  { color: p.active ? '#FFFFFF' : t.ink, fontWeight: '700', fontSize: 12 },
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </Row>
        <Row style={{ gap: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => shiftDays(-1)}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: t.raised,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="back" size={14} color={t.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next day"
            onPress={() => shiftDays(1)}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: t.raised,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="forward" size={14} color={t.ink} />
          </Pressable>
        </Row>
      </Row>

      {/* Compass Dial + Scrubbed Readout */}
      <Row style={{ gap: space.md, alignItems: 'center' }}>
        <Svg width={dialSize} height={dialSize} viewBox={`0 0 ${dialSize} ${dialSize}`}>
          {/* Compass ring */}
          <Circle cx={cx} cy={cy} r={rimR} stroke={t.divider} strokeWidth={1.5} fill={t.raised} />
          <Circle
            cx={cx}
            cy={cy}
            r={rimR * 0.5}
            stroke={t.divider}
            strokeWidth={0.75}
            strokeDasharray="3 3"
            fill="none"
          />

          {/* Camera FOV cone */}
          {bearingDeg != null ? (
            <>
              <Path
                d={sectorPath(cx, cy, rimR - 2, bearingDeg, fov)}
                fill={t.accent}
                fillOpacity={0.24}
              />
              {(() => {
                const aim = polarToXY(cx, cy, rimR - 2, bearingDeg);
                return (
                  <Line x1={cx} y1={cy} x2={aim.x} y2={aim.y} stroke={t.accent} strokeWidth={2} />
                );
              })()}
            </>
          ) : null}

          {/* Sun path arc */}
          {sunArcPath ? (
            <Path d={sunArcPath} stroke={GOLD} strokeWidth={2.5} strokeOpacity={0.95} fill="none" />
          ) : null}

          {/* Sunrise & Sunset rim ticks */}
          {sunrisePos
            ? (() => {
                const p1 = polarToXY(cx, cy, rimR - 5, sunrisePos.azimuthDeg);
                const p2 = polarToXY(cx, cy, rimR + 3, sunrisePos.azimuthDeg);
                return (
                  <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={GOLD} strokeWidth={2} />
                );
              })()
            : null}
          {sunsetPos
            ? (() => {
                const p1 = polarToXY(cx, cy, rimR - 5, sunsetPos.azimuthDeg);
                const p2 = polarToXY(cx, cy, rimR + 3, sunsetPos.azimuthDeg);
                return (
                  <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={t.accent} strokeWidth={2} />
                );
              })()
            : null}

          {/* Active sun vector + dot */}
          <Line
            x1={cx}
            y1={cy}
            x2={activeSunPt.x}
            y2={activeSunPt.y}
            stroke={GOLD}
            strokeWidth={1.5}
            strokeDasharray={sun.elevationDeg < 0 ? '3 3' : undefined}
            strokeOpacity={sun.elevationDeg < 0 ? 0.5 : 0.9}
          />
          <Circle
            cx={activeSunPt.x}
            cy={activeSunPt.y}
            r={5.5}
            fill={sun.elevationDeg >= 0 ? GOLD : t.surface}
            stroke={GOLD}
            strokeWidth={2}
          />

          {/* Center pin */}
          <Circle cx={cx} cy={cy} r={3.5} fill={t.ink} />

          {/* Cardinal labels */}
          <SvgText x={cx} y={11} fontSize={10} fontWeight="700" fill={t.muted} textAnchor="middle">
            N
          </SvgText>
          <SvgText
            x={dialSize - 7}
            y={cy + 3.5}
            fontSize={10}
            fontWeight="600"
            fill={t.muted}
            textAnchor="middle"
          >
            E
          </SvgText>
          <SvgText
            x={cx}
            y={dialSize - 4}
            fontSize={10}
            fontWeight="600"
            fill={t.muted}
            textAnchor="middle"
          >
            S
          </SvgText>
          <SvgText
            x={7}
            y={cy + 3.5}
            fontSize={10}
            fontWeight="600"
            fill={t.muted}
            textAnchor="middle"
          >
            W
          </SvgText>
        </Svg>

        <View style={{ flex: 1, gap: 4 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Mono style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', color: t.ink }}>
              {fmtTime(selectedTime)}
            </Mono>
            {angle ? (
              <View
                style={{
                  backgroundColor: angle === 'sun_down' ? t.raised : t.accent,
                  borderRadius: radius.pill,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                }}
              >
                <Text
                  style={[
                    type.caption,
                    {
                      color: angle === 'sun_down' ? t.ink : '#FFFFFF',
                      fontWeight: '700',
                      fontSize: 11,
                    },
                  ]}
                >
                  {LIGHT_LABEL[angle]}
                </Text>
              </View>
            ) : null}
          </Row>
          <Text style={[type.caption, { color: t.muted, fontFamily: font.mono }]}>
            Sun {formatBearing(sun.azimuthDeg)} · {Math.round(sun.elevationDeg)}° el
          </Text>
          {bearingDeg != null ? (
            <Text style={[type.caption, { color: t.muted, fontFamily: font.mono }]}>
              Cam {formatBearing(bearingDeg)} · {Math.round(fov)}° FOV
            </Text>
          ) : null}
          <Row style={{ gap: 6, marginTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="30 minutes earlier"
              onPress={() => setMinutes(minutesOfDay - 30)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: t.raised,
              }}
            >
              <Text style={[type.caption, { color: t.ink, fontWeight: '600' }]}>−30m</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="30 minutes later"
              onPress={() => setMinutes(minutesOfDay + 30)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: radius.pill,
                backgroundColor: t.raised,
              }}
            >
              <Text style={[type.caption, { color: t.ink, fontWeight: '600' }]}>+30m</Text>
            </Pressable>
          </Row>
        </View>
      </Row>

      {/* 24-hour interactive scrub bar */}
      <View style={{ gap: 6 }}>
        <View
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleBarTouch}
          onResponderMove={handleBarTouch}
          accessibilityLabel="Scrub time of day"
          style={{
            height: 22,
            borderRadius: 11,
            backgroundColor: t.raised,
            overflow: 'hidden',
            justifyContent: 'center',
          }}
        >
          {/* Daylight + Blue/Golden hour bands */}
          {summary.alwaysUp ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: GOLD,
                opacity: 0.45,
              }}
            />
          ) : !summary.alwaysDown ? (
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
              <View
                style={{
                  position: 'absolute',
                  left: `${dawnPct}%`,
                  width: `${Math.max(0, duskPct - dawnPct)}%`,
                  top: 0,
                  bottom: 0,
                  backgroundColor: BLUE_HOUR,
                  opacity: 0.78,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: `${risePct}%`,
                  width: `${Math.max(0, setPct - risePct)}%`,
                  top: 0,
                  bottom: 0,
                  backgroundColor: t.accent,
                  opacity: 0.92,
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: `${gAmEndPct}%`,
                  width: `${Math.max(0, gPmStartPct - gAmEndPct)}%`,
                  top: 0,
                  bottom: 0,
                  backgroundColor: GOLD,
                  opacity: 0.92,
                }}
              />
            </View>
          ) : null}

          {/* Scrub thumb */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${thumbPct}%`,
              marginLeft: -8,
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: '#FFFFFF',
              borderWidth: 3,
              borderColor: t.accent,
            }}
          />
        </View>

        {/* Quick time-of-day jumps */}
        <Row style={{ justifyContent: 'space-between', gap: 4 }}>
          {[
            { label: 'Sunrise', onPress: () => setToInstant(summary.sunrise) },
            { label: 'Noon', onPress: () => setToInstant(summary.solarNoon) },
            { label: 'Golden', onPress: () => setToInstant(summary.goldenHour) },
            { label: 'Sunset', onPress: () => setToInstant(summary.sunset) },
            { label: 'Now', onPress: () => onTimeChange(new Date()) },
          ].map((b) => (
            <Pressable
              key={b.label}
              accessibilityRole="button"
              onPress={b.onPress}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 5,
                borderRadius: radius.control,
                backgroundColor: t.raised,
              }}
            >
              <Text style={[type.caption, { color: t.ink, fontSize: 11, fontWeight: '600' }]}>
                {b.label}
              </Text>
            </Pressable>
          ))}
        </Row>
      </View>

      {/* Key solar times */}
      <Row style={{ justifyContent: 'space-between', paddingTop: 2 }}>
        <TimeCell label="Sunrise" value={fmtTime(summary.sunrise)} />
        <TimeCell label="Golden AM" value={fmtTime(summary.goldenHourEnd)} />
        <TimeCell label="Golden PM" value={fmtTime(summary.goldenHour)} />
        <TimeCell label="Sunset" value={fmtTime(summary.sunset)} />
      </Row>

      {/* Moon & Astro toggle */}
      <View
        style={{ borderTopWidth: 1, borderColor: t.divider, paddingTop: space.sm, gap: space.sm }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowMoon((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={[type.caption, { color: t.ink, fontWeight: '600' }]}>
            Moon & astro · {moon.phaseLabel} ({Math.round(moon.fraction * 100)}%)
          </Text>
          <Icon name={showMoon ? 'down' : 'forward'} size={14} color={t.muted} />
        </Pressable>

        {showMoon ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <TimeCell label="Moonrise" value={fmtTime(moon.rise)} />
            <TimeCell label="Moonset" value={fmtTime(moon.set)} />
            <TimeCell label="Dark from" value={fmtTime(summary.night)} />
            <TimeCell label="Dark until" value={fmtTime(summary.nightEnd)} />
          </Row>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add shoot window to calendar"
        onPress={() => void exportCalendarWindow()}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.xs,
          backgroundColor: t.raised,
          borderRadius: radius.control,
          paddingVertical: 9,
        }}
      >
        <Icon name="share" size={14} color={t.ink} />
        <Text style={[type.caption, { color: t.ink, fontWeight: '600' }]}>
          Add shoot window to calendar
        </Text>
      </Pressable>
    </View>
  );
}

function TimeCell({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={[type.caption, { color: t.muted, fontSize: 11 }]}>{label}</Text>
      <Mono style={{ fontSize: 12, color: t.ink, fontWeight: '600' }}>{value}</Mono>
    </View>
  );
}
