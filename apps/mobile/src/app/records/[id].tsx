import { Ionicons } from '@expo/vector-icons';
import {
  formatBearing,
  formatCoordinates,
  formatDistance,
  formatSun,
  lightAngle,
  type Page,
  type PublicRecord,
  type RecordStatusResponse,
} from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../../lib/api';
import { listDrafts, settleDraft } from '../../lib/drafts';
import { mediaSource } from '../../lib/images';
import { REJECT_LABEL, STATUS_LABEL } from '../../lib/labels';
import { getOrigin, useReduceMotion, type Origin } from '../../lib/motion';
import { useVocabulary } from '../../lib/vocabulary';
import { grid, motion, radius, space, type, useTheme } from '../../theme/tokens';
import { Body, Button, Card, IconButton, Label, Mono, Row, Sheet, SheetAction } from '../../ui';
import { Masonry, aspectOf } from '../../ui/masonry';

const LIGHT = {
  backlit: 'Backlit',
  side_lit: 'Side-lit',
  front_lit: 'Front-lit',
  sun_down: 'Sun below horizon',
} as const;

const HERO_RADIUS = 24;

/**
 * Location detail (plan journey 5), Savee-style: the photo grows out of the tapped tile, then
 * actions (Save pill, Maps, share, more), the scouting notes, technical data, and more
 * locations nearby. Close reverses the animation. The owner also sees status and controls.
 */
export default function RecordScreen() {
  const { label } = useVocabulary();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<PublicRecord | null>(null);
  const [status, setStatus] = useState<RecordStatusResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [nearby, setNearby] = useState<PublicRecord[]>([]);
  const [menu, setMenu] = useState(false);

  // --- Card-open transition -------------------------------------------------------------
  // The tile hands over its image and size, so the photo grows out of it immediately while the
  // record loads; the details rise in once they arrive.
  const [origin] = useState<Origin | null>(() => getOrigin(id));
  const progress = useRef(new Animated.Value(0)).current;
  const contentIn = useRef(new Animated.Value(0)).current;
  const scroll = useRef<React.ComponentRef<typeof Animated.ScrollView>>(null);
  const closing = useRef(false);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduce ? 0 : motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, reduce]);

  const loaded = record !== null;
  useEffect(() => {
    if (!loaded) return;
    Animated.timing(contentIn, {
      toValue: 1,
      duration: reduce ? 0 : motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [loaded, contentIn, reduce]);

  // Every way of leaving (button, Android back, pull-down) first plays the close animation.
  const [closed, setClosed] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  usePreventRemove(!closed && !reduce, ({ repeat }) => {
    if (closing.current) return;
    closing.current = true;
    // Return to the top first so the photo shrinks back into its tile from where it opened.
    scroll.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(progress, {
      toValue: 0,
      duration: motion.base,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      pending.current = repeat;
      setClosed(true);
    });
  });
  useEffect(() => {
    if (closed) pending.current?.();
  }, [closed]);

  const load = useCallback(async () => {
    const [pub, own] = await Promise.allSettled([
      api<PublicRecord>(`/v1/records/${id}`),
      api<RecordStatusResponse>(`/v1/records/${id}/status`),
    ]);
    if (pub.status === 'fulfilled') setRecord(pub.value);
    if (own.status === 'fulfilled') setStatus(own.value);
    if (pub.status === 'rejected' && own.status === 'rejected') setMissing(true);
    return { pub: pub.status === 'fulfilled', own: own.status === 'fulfilled' ? own.value : null };
  }, [id]);

  // Follow processing to the end for the owner's own new record.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async (n: number) => {
      const r = await load();
      if (!alive) return;
      const s = r.own?.status;
      if (s === 'published' || s === 'rejected') {
        const local = (await listDrafts()).find((d) => d.recordId === id);
        if (local) await settleDraft(local.draft.draftId);
      }
      if ((s === 'processing' || s === 'pending_media') && n < 90)
        timer = setTimeout(() => void tick(n + 1), 2000);
    };
    void tick(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, load]);

  // More locations around this one (Savee's "more like this").
  useEffect(() => {
    if (!record) return;
    void api<Page<PublicRecord>>(
      `/v1/feed?lat=${record.lat}&lon=${record.lon}&radiusKm=25&limit=13`,
    )
      .then((p) => setNearby(p.items.filter((r) => r.id !== record.id).slice(0, 12)))
      .catch(() => {});
  }, [record]);

  const close = () => router.back();
  const fade = { opacity: progress };
  // Details: in when loaded, out with the page on close.
  const shown = Animated.multiply(progress, contentIn);
  const rise = {
    opacity: shown,
    transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
  };

  const backButton = (
    <View style={{ position: 'absolute', top: insets.top + 8, left: space.md }}>
      <Animated.View style={fade}>
        <IconButton icon="chevron-back" label="Back" overlay onPress={close} />
      </Animated.View>
    </View>
  );

  // No photo to show yet (opened from a list or the capture flow, not a tile), or gone.
  if (missing || (!record && !origin)) {
    const rejected = status?.status === 'rejected';
    return (
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.canvas }, fade]} />
        <Animated.View
          style={[
            {
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.md,
              padding: space.xl,
            },
            rise,
          ]}
        >
          {missing ? (
            <>
              <Ionicons name="eye-off-outline" size={40} color={t.muted} />
              <Text style={[type.headline, { color: t.ink }]}>No longer available</Text>
              <Body muted>This location was removed or hidden.</Body>
            </>
          ) : !status ? (
            <ActivityIndicator color={t.ink} />
          ) : (
            <>
              {rejected ? (
                <Ionicons name="close-circle-outline" size={44} color={t.signalRed} />
              ) : (
                <ActivityIndicator color={t.ink} />
              )}
              <Text style={[type.headline, { color: t.ink }]}>{STATUS_LABEL[status.status]}</Text>
              <View style={{ alignItems: 'center' }}>
                <Body muted>
                  {rejected
                    ? (REJECT_LABEL[status.media.rejectReason ?? ''] ??
                      'The photo could not be accepted.')
                    : 'Checking the photo and preparing it for the feed. This usually takes a few seconds.'}
                </Body>
              </View>
            </>
          )}
        </Animated.View>
        {backButton}
      </View>
    );
  }

  const heroH = width / (record ? aspectOf(record.images) : origin!.aspect);
  const heroTop = insets.top + space.sm;
  // Grow out of the tile: same centre and scale at progress 0, in place at 1.
  const heroAnim =
    origin && !reduce
      ? {
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [origin.x + origin.width / 2 - width / 2, 0],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [origin.y + origin.height / 2 - (heroTop + heroH / 2), 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [origin.width / width, 1],
              }),
            },
          ],
        }
      : fade;

  const heroImage = (
    <Animated.View style={heroAnim}>
      <Image
        source={mediaSource(record ? record.images.detail : origin!.image)}
        placeholder={mediaSource(origin?.image ?? record!.images.feed)}
        style={{ width, height: heroH, borderRadius: HERO_RADIUS, backgroundColor: t.surface }}
        contentFit="cover"
        accessibilityLabel={record?.label}
      />
    </Animated.View>
  );

  if (!record) {
    // The photo is already in place; the details are on their way.
    return (
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.canvas }, fade]} />
        <View style={{ paddingTop: heroTop }}>
          {heroImage}
          <ActivityIndicator style={{ marginTop: space.xl }} color={t.muted} />
        </View>
        {backButton}
      </View>
    );
  }

  const own = Boolean(status);
  const adv = record.advanced;
  const facts: [string, string | undefined][] = [
    ['Access', adv.access?.type?.replace('_', ' ')],
    [
      'Walk from parking',
      adv.access?.walkInMinutes != null ? `${adv.access.walkInMinutes} min` : undefined,
    ],
    ['Terrain', adv.access?.terrain],
    ['Permit required', adv.rules?.permitRequired],
    ['Drones', adv.rules?.drone?.replace('_', '-')],
    ['Tripod allowed', adv.rules?.tripodAllowed],
    ['Parking', adv.practical?.parking],
    ['Mobile signal', adv.practical?.mobileSignal],
    ['Tide-dependent', adv.conditions?.tideDependent],
    ['Hazards', adv.conditions?.hazardsNote],
    ['Lens', adv.shot?.lensUsed],
    ['Notes', adv.shot?.note],
  ];
  const shownFacts = facts.filter((f): f is [string, string] => Boolean(f[1]));

  function openInMaps() {
    const { lat, lon, label: name } = record!;
    const q = encodeURIComponent(name);
    void Linking.openURL(
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${lat},${lon}&q=${q}`
        : `geo:${lat},${lon}?q=${lat},${lon}(${q})`,
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.canvas }, fade]} />
      <Animated.ScrollView
        ref={scroll}
        // Pull down at the top to close, like dismissing a card.
        onScrollEndDrag={(e) => {
          if (e.nativeEvent.contentOffset.y < -90) close();
        }}
        contentContainerStyle={{
          paddingTop: heroTop,
          paddingBottom: insets.bottom + space.xxl * 2,
        }}
      >
        {heroImage}

        <Animated.View
          style={[{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xl }, rise]}
        >
          {/* Actions: Savee's row of quiet icons with one strong Save pill. */}
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: space.xs }}>
              <IconButton icon="navigate-outline" label="Open in Maps" onPress={openInMaps} />
              <IconButton
                icon="share-outline"
                label="Share"
                onPress={() =>
                  void Share.share({
                    message: `${record.label}: ${formatCoordinates(record.lat, record.lon, 5)}`,
                  })
                }
              />
              <IconButton icon="ellipsis-horizontal" label="More" onPress={() => setMenu(true)} />
            </Row>
            <Button
              label="Save"
              icon="bookmark-outline"
              size="small"
              onPress={() => router.push(`/save/${record.id}`)}
            />
          </Row>

          <View style={{ gap: space.xs }}>
            <Text accessibilityRole="header" style={[type.title, { color: t.ink }]}>
              {record.label}
            </Text>
            <Text style={[type.caption, { color: t.muted }]}>
              {record.attribution ? `by ${record.attribution.name}` : 'Anonymous'}
              {record.attribution?.socialHandle ? ` · ${record.attribution.socialHandle}` : ''}
              {record.distanceM != null ? ` · ${formatDistance(record.distanceM)} away` : ''}
            </Text>
          </View>

          <Row wrap style={{ gap: space.sm }}>
            {record.goodFor.map((g) => (
              <View
                key={g}
                style={{
                  backgroundColor: t.surface,
                  borderRadius: radius.pill,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Text style={[type.caption, { color: t.ink, fontWeight: '600' }]}>
                  {label('good_for', g)}
                </Text>
              </View>
            ))}
          </Row>
          {record.goodForNote ? <Body muted>{record.goodForNote}</Body> : null}

          {/* Light & direction: the scouting essentials as a compact fact grid. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Fact
              title="Best light"
              value={record.bestLight.map((b) => label('best_light', b)).join(', ')}
            />
            <Fact
              title="Camera points"
              value={`${formatBearing(record.bearingDeg)}${record.sun ? ` · ${LIGHT[lightAngle(record.bearingDeg, record.sun)]}` : ''}`}
            />
            {record.sun ? <Fact title="Sun at capture" value={formatSun(record.sun)} /> : null}
            <Fact
              title="Captured"
              value={new Date(record.capturedAt).toLocaleDateString(undefined, {
                dateStyle: 'medium',
              })}
            />
          </View>
          {record.bestLightNote ? <Body muted>{record.bestLightNote}</Body> : null}

          {shownFacts.length ? (
            <Card style={{ gap: space.sm }}>
              {shownFacts.map(([k, v]) => (
                <Row key={k} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={[type.body, { color: t.muted }]}>{k}</Text>
                  <Text style={[type.body, { color: t.ink, flexShrink: 1, textAlign: 'right' }]}>
                    {v}
                  </Text>
                </Row>
              ))}
            </Card>
          ) : null}

          <Mono>
            {formatCoordinates(record.lat, record.lon, 5)}
            {record.accuracyM != null ? ` ±${Math.round(record.accuracyM)} m` : ''}
          </Mono>

          {own && status ? (
            <OwnerControls
              id={record.id}
              status={status}
              attributed={Boolean(record.attribution)}
              onChanged={() => void load()}
            />
          ) : null}

          <Body muted>
            Access, light and conditions are shared by the community and may change. Always check
            before you go.
          </Body>
        </Animated.View>

        {nearby.length ? (
          <Animated.View style={[{ paddingTop: space.xl, gap: space.md }, rise]}>
            <View style={{ paddingHorizontal: space.lg }}>
              <Label>More nearby</Label>
            </View>
            <Masonry
              edge={grid.edge}
              tiles={nearby.map((r) => ({
                id: r.id,
                label: r.label,
                image: r.images.feed,
                placeholder: r.images.thumb,
                width: r.images.width,
                height: r.images.height,
              }))}
            />
          </Animated.View>
        ) : null}
      </Animated.ScrollView>
      {backButton}

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <SheetAction icon="navigate-outline" label="Open in Maps" onPress={openInMaps} />
        <SheetAction
          icon="bookmark-outline"
          label="Save to a project"
          onPress={() => router.push(`/save/${record.id}`)}
        />
        {!own ? (
          <SheetAction
            icon="flag-outline"
            label="Report this location"
            onPress={() => router.push(`/report/${record.id}`)}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

function Fact({ title, value }: { title: string; value: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '45%',
        backgroundColor: t.surface,
        borderRadius: radius.control,
        padding: space.md,
        gap: 4,
      }}
    >
      <Label>{title}</Label>
      <Text style={[type.bodyStrong, { color: t.ink }]}>{value}</Text>
    </View>
  );
}

function OwnerControls(props: {
  id: string;
  status: RecordStatusResponse;
  attributed: boolean;
  onChanged(): void;
}) {
  const t = useTheme();
  const [attributed, setAttributed] = useState(props.attributed);

  async function setName(on: boolean) {
    try {
      if (on) {
        const legal = await api<{ attribution_notice: string }>('/v1/legal');
        await api(`/v1/me/records/${props.id}`, {
          method: 'PATCH',
          body: { attributed: true, noticeVersion: legal.attribution_notice },
        });
      } else {
        await api(`/v1/me/records/${props.id}`, { method: 'PATCH', body: { attributed: false } });
      }
      setAttributed(on);
      props.onChanged();
    } catch {}
  }

  return (
    <Card>
      <Text style={[type.headline, { color: t.ink }]}>
        Your location · {STATUS_LABEL[props.status.status]}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body muted>{attributed ? 'Your name is shown.' : 'Anonymous to others.'}</Body>
        <Switch
          value={attributed}
          accessibilityLabel="Show my name on this location"
          onValueChange={(on) =>
            on
              ? Alert.alert(
                  'Show your name on this location?',
                  'Showing your name links you to this place and the time you were here. You are responsible for this choice. We recommend keeping your locations anonymous.',
                  [
                    { text: 'Keep anonymous', style: 'cancel' },
                    { text: 'Show my name', onPress: () => void setName(true) },
                  ],
                )
              : void setName(false)
          }
        />
      </Row>
      <Button
        label="Delete location"
        kind="danger"
        size="small"
        onPress={() =>
          Alert.alert(
            'Delete this location?',
            'It is removed for everyone, including saved projects. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api(`/v1/me/records/${props.id}`, { method: 'DELETE' });
                    router.back();
                  } catch (err) {
                    if (err instanceof ApiError)
                      Alert.alert('Could not delete', 'Try again later.');
                  }
                },
              },
            ],
          )
        }
      />
    </Card>
  );
}
