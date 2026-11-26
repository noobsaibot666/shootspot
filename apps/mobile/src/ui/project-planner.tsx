import {
  autoSequenceShootDay,
  distanceMeters,
  formatBearing,
  formatDistance,
  spotBestWindow,
  type PublicRecord,
} from '@shootspot/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { mapsAvailable } from '../lib/device';
import { mediaSource } from '../lib/images';
import { font, radius, space, type, useTheme } from '../theme/tokens';
import { Icon } from './icon';
import { Body, Button, Mono, Row, Tap } from './index';

export type ProjectListItem =
  | { recordId: string; note: string | null; available: true; record: PublicRecord }
  | { recordId: string; note: string | null; available: false; record: null };

export function toLocalYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseLocalYmd(ymd: string | null): Date {
  if (!ymd) return new Date();
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0);
}

function bestWindowForRecord(record: PublicRecord, date: Date): { label: string; timeMs: number } {
  return spotBestWindow(
    {
      id: record.id,
      lat: record.lat,
      lon: record.lon,
      bestLight: record.bestLight,
      bearingDeg: record.bearingDeg,
    },
    date,
  );
}

/** Shoot-day timeline view with target date, chronological light sorting, reordering, and notes. */
export function ProjectSchedule(props: {
  items: ProjectListItem[];
  shootDate: string | null;
  onShootDateChange(next: string | null): void;
  onMove(index: number, delta: -1 | 1): void;
  onSortByLight(orderedIds: string[]): void;
  onSaveNote(recordId: string, note: string | null): Promise<void>;
}) {
  const t = useTheme();
  const [editingNote, setEditingNote] = useState<{
    recordId: string;
    label: string;
    text: string;
  } | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const targetDate = useMemo(() => parseLocalYmd(props.shootDate), [props.shootDate]);
  const todayYmd = toLocalYmd(new Date());
  const tomorrowYmd = toLocalYmd(new Date(Date.now() + 86_400_000));
  const nextWeekYmd = toLocalYmd(new Date(Date.now() + 7 * 86_400_000));

  function shiftShootDate(delta: number) {
    const d = parseLocalYmd(props.shootDate);
    d.setDate(d.getDate() + delta);
    props.onShootDateChange(toLocalYmd(d));
  }

  function sortChronologically() {
    const available = props.items.filter(
      (i): i is Extract<ProjectListItem, { available: true }> => i.available,
    );
    const unavailable = props.items.filter((i) => !i.available);
    const seq = autoSequenceShootDay(
      available.map((a) => ({
        id: a.recordId,
        lat: a.record.lat,
        lon: a.record.lon,
        bestLight: a.record.bestLight,
        bearingDeg: a.record.bearingDeg,
      })),
      targetDate,
    );
    props.onSortByLight([...seq.orderedIds, ...unavailable.map((i) => i.recordId)]);
  }

  const sequenced = useMemo(() => {
    const available = props.items.filter(
      (i): i is Extract<ProjectListItem, { available: true }> => i.available,
    );
    const map = new Map<string, string | null>();
    let totalDist = 0;
    for (let i = 1; i < available.length; i++) {
      const prev = available[i - 1]!;
      const curr = available[i]!;
      const dist = distanceMeters(
        prev.record.lat,
        prev.record.lon,
        curr.record.lat,
        curr.record.lon,
      );
      totalDist += dist;
      const gapMin =
        Math.abs(
          bestWindowForRecord(curr.record, targetDate).timeMs -
            bestWindowForRecord(prev.record, targetDate).timeMs,
        ) / 60_000;
      if (gapMin <= 45 && dist > 15_000) {
        map.set(curr.recordId, `Tight window · ${Math.round(dist / 1000)} km from prev stop`);
      }
    }
    return { conflicts: map, totalDist };
  }, [props.items, targetDate]);

  let prevCoord: { lat: number; lon: number } | null = null;

  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
      {/* Shoot Date selector */}
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: radius.card,
          padding: space.md,
          gap: space.sm,
        }}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={[type.bodyStrong, { color: t.ink }]}>
            {props.shootDate
              ? `Shoot date: ${targetDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
              : 'Shoot date: Today (preview)'}
          </Text>
          <Row style={{ gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => shiftShootDate(-1)}
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
              onPress={() => shiftShootDate(1)}
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

        <Row style={{ gap: 6, flexWrap: 'wrap' }}>
          {[
            {
              label: 'Today',
              active: props.shootDate === todayYmd,
              onPress: () => props.onShootDateChange(todayYmd),
            },
            {
              label: 'Tomorrow',
              active: props.shootDate === tomorrowYmd,
              onPress: () => props.onShootDateChange(tomorrowYmd),
            },
            {
              label: '+7d',
              active: props.shootDate === nextWeekYmd,
              onPress: () => props.onShootDateChange(nextWeekYmd),
            },
            ...(props.shootDate
              ? [{ label: 'Clear', active: false, onPress: () => props.onShootDateChange(null) }]
              : []),
          ].map((p) => (
            <Pressable
              key={p.label}
              accessibilityRole="button"
              onPress={p.onPress}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: p.active ? t.ink : t.raised,
              }}
            >
              <Text
                style={[
                  type.caption,
                  { color: p.active ? t.onInk : t.ink, fontWeight: '600', fontSize: 12 },
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}

          {props.items.some((i) => i.available) ? (
            <Pressable
              accessibilityRole="button"
              onPress={sortChronologically}
              style={{
                marginLeft: 'auto',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: t.ink,
              }}
            >
              <Text style={[type.caption, { color: t.onInk, fontWeight: '600', fontSize: 12 }]}>
                Auto-plan shoot day
              </Text>
            </Pressable>
          ) : null}
        </Row>
        {sequenced.totalDist > 0 ? (
          <Text style={[type.caption, { color: t.muted, fontFamily: font.mono, fontSize: 11 }]}>
            Total route: {formatDistance(sequenced.totalDist)}
          </Text>
        ) : null}
      </View>

      {/* Chronological stops */}
      {props.items.map((item, idx) => {
        if (!item.available) {
          return (
            <View
              key={item.recordId}
              style={{
                backgroundColor: t.surface,
                borderRadius: radius.card,
                padding: space.md,
              }}
            >
              <Body muted>Stop {idx + 1} · No longer available</Body>
            </View>
          );
        }

        const r = item.record;
        const dist = prevCoord ? distanceMeters(prevCoord.lat, prevCoord.lon, r.lat, r.lon) : null;
        prevCoord = { lat: r.lat, lon: r.lon };
        const win = bestWindowForRecord(r, targetDate);
        const conflict = sequenced.conflicts.get(item.recordId) ?? null;

        return (
          <View
            key={item.recordId}
            style={{
              backgroundColor: t.surface,
              borderRadius: radius.card,
              padding: space.md,
              gap: space.sm,
            }}
          >
            <Row style={{ gap: space.md, alignItems: 'center' }}>
              <Tap
                accessibilityRole="button"
                accessibilityLabel={`Open ${r.label}`}
                onPress={() => router.push(`/records/${r.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}
              >
                <View style={{ position: 'relative' }}>
                  <Image
                    source={mediaSource(r.images.thumb)}
                    style={{ width: 72, height: 54, borderRadius: 10, backgroundColor: t.raised }}
                    contentFit="cover"
                  />
                  <View
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: t.ink,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: t.onInk, fontSize: 11, fontWeight: '700' }}>
                      {idx + 1}
                    </Text>
                  </View>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: t.ink }]} numberOfLines={1}>
                    {r.label}
                  </Text>
                  <Text
                    style={[type.caption, { color: t.ink, fontFamily: font.mono, fontSize: 11 }]}
                  >
                    ☀ {win.label}
                  </Text>
                  <Text style={[type.caption, { color: t.muted, fontSize: 11 }]}>
                    {r.bearingDeg != null ? formatBearing(r.bearingDeg) : 'No bearing'}
                    {dist != null ? ` · ${formatDistance(dist)} from prev` : ''}
                  </Text>
                </View>
              </Tap>

              <View style={{ gap: 4 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move stop up"
                  disabled={idx === 0}
                  onPress={() => props.onMove(idx, -1)}
                  style={{
                    width: 28,
                    height: 24,
                    borderRadius: 6,
                    backgroundColor: t.raised,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: idx === 0 ? 0.3 : 1,
                  }}
                >
                  <Text style={{ color: t.ink, fontSize: 12, fontWeight: '700' }}>↑</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move stop down"
                  disabled={idx === props.items.length - 1}
                  onPress={() => props.onMove(idx, 1)}
                  style={{
                    width: 28,
                    height: 24,
                    borderRadius: 6,
                    backgroundColor: t.raised,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: idx === props.items.length - 1 ? 0.3 : 1,
                  }}
                >
                  <Text style={{ color: t.ink, fontSize: 12, fontWeight: '700' }}>↓</Text>
                </Pressable>
              </View>
            </Row>

            {/* Conflict warning if two close light windows are >15 km apart */}
            {conflict ? (
              <Text style={[type.caption, { color: t.accent, fontWeight: '600', fontSize: 11 }]}>
                ⚠ {conflict}
              </Text>
            ) : null}

            {/* Private per-spot note */}
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setEditingNote({
                  recordId: item.recordId,
                  label: r.label,
                  text: item.note ?? '',
                })
              }
              style={{
                backgroundColor: t.raised,
                borderRadius: radius.control,
                paddingHorizontal: space.md,
                paddingVertical: 6,
              }}
            >
              <Text style={[type.caption, { color: item.note ? t.ink : t.muted }]}>
                {item.note ? `Note: ${item.note}` : '+ Add private shoot note'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <Modal
        visible={Boolean(editingNote)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingNote(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            padding: space.lg,
          }}
        >
          <View
            style={{
              backgroundColor: t.surface,
              borderRadius: radius.card,
              padding: space.lg,
              gap: space.md,
            }}
          >
            <Text style={[type.headline, { color: t.ink }]} numberOfLines={1}>
              {editingNote?.label}
            </Text>
            <TextInput
              value={editingNote?.text ?? ''}
              onChangeText={(text) => setEditingNote((prev) => (prev ? { ...prev, text } : null))}
              placeholder="Parking spot, gear to bring, call time..."
              placeholderTextColor={t.muted}
              multiline
              maxLength={300}
              style={[
                type.body,
                {
                  backgroundColor: t.raised,
                  color: t.ink,
                  borderRadius: radius.control,
                  padding: space.md,
                  minHeight: 84,
                  textAlignVertical: 'top',
                },
              ]}
            />
            <Row style={{ justifyContent: 'flex-end', gap: space.sm }}>
              <Button
                label="Cancel"
                kind="secondary"
                size="small"
                onPress={() => setEditingNote(null)}
              />
              <Button
                label={savingNote ? 'Saving…' : 'Save note'}
                size="small"
                disabled={savingNote}
                onPress={async () => {
                  if (!editingNote) return;
                  setSavingNote(true);
                  try {
                    await props.onSaveNote(
                      editingNote.recordId,
                      editingNote.text.trim() ? editingNote.text.trim() : null,
                    );
                    setEditingNote(null);
                  } finally {
                    setSavingNote(false);
                  }
                }}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Numbered route map of all available locations in the project. */
export function ProjectMap(props: { items: ProjectListItem[] }) {
  const t = useTheme();
  const mapRef = useRef<MapView>(null);
  const available = useMemo(
    () =>
      props.items.filter((i): i is Extract<ProjectListItem, { available: true }> => i.available),
    [props.items],
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(available.length ? 0 : null);

  useEffect(() => {
    if (!available.length || !mapsAvailable) return;
    const coords = available.map((i) => ({
      latitude: i.record.lat,
      longitude: i.record.lon,
    }));
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 48, right: 48, bottom: 96, left: 48 },
        animated: false,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [available]);

  if (!mapsAvailable) {
    return (
      <View style={{ padding: space.lg }}>
        <Body muted>The map isn't available in this build yet.</Body>
      </View>
    );
  }

  if (!available.length) {
    return (
      <View style={{ padding: space.lg }}>
        <Body muted>Save locations to see them on your project map.</Body>
      </View>
    );
  }

  const first = available[0]!.record;
  const activeItem = selectedIdx != null ? available[selectedIdx] : null;

  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
      <View
        style={{
          height: 360,
          borderRadius: radius.card,
          overflow: 'hidden',
          backgroundColor: t.surface,
        }}
      >
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: first.lat,
            longitude: first.lon,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
          pitchEnabled={false}
        >
          {available.length > 1 ? (
            <Polyline
              coordinates={available.map((i) => ({
                latitude: i.record.lat,
                longitude: i.record.lon,
              }))}
              strokeColor={t.ink}
              strokeWidth={2}
              lineDashPattern={[6, 6]}
            />
          ) : null}
          {available.map((item, idx) => (
            <Marker
              key={item.recordId}
              coordinate={{ latitude: item.record.lat, longitude: item.record.lon }}
              onPress={() => setSelectedIdx(idx)}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: selectedIdx === idx ? t.accent : t.ink,
                  borderWidth: 2,
                  borderColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{idx + 1}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
      </View>

      {activeItem ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Open ${activeItem.record.label}`}
          onPress={() => router.push(`/records/${activeItem.record.id}`)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            backgroundColor: t.surface,
            borderRadius: radius.card,
            padding: space.sm,
          }}
        >
          <Image
            source={mediaSource(activeItem.record.images.thumb)}
            style={{ width: 96, height: 54, borderRadius: 8, backgroundColor: t.raised }}
            contentFit="cover"
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.bodyStrong, { color: t.ink }]} numberOfLines={1}>
              {selectedIdx! + 1}. {activeItem.record.label}
            </Text>
            <Mono style={{ fontSize: 11, color: t.muted }}>
              {activeItem.note
                ? activeItem.note
                : activeItem.record.bearingDeg != null
                  ? formatBearing(activeItem.record.bearingDeg)
                  : 'Tap to open location'}
            </Mono>
          </View>
          <Icon name="forward" size={18} color={t.muted} />
        </Tap>
      ) : null}
    </View>
  );
}
