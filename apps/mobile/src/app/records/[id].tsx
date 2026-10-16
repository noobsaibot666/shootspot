import { Ionicons } from '@expo/vector-icons';
import {
  formatBearing,
  formatCoordinates,
  formatDistance,
  formatSun,
  lightAngle,
  type PublicRecord,
  type RecordStatusResponse,
} from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ApiError, api } from '../../lib/api';
import { listDrafts, settleDraft } from '../../lib/drafts';
import { BEST_LIGHT_LABEL, GOOD_FOR_LABEL, REJECT_LABEL, STATUS_LABEL } from '../../lib/labels';
import { space, useTheme } from '../../theme/tokens';
import { Body, Button, Card, Label, Mono, Row, Screen } from '../../ui';

const LIGHT = {
  backlit: 'backlit',
  side_lit: 'side-lit',
  front_lit: 'front-lit',
  sun_down: 'sun below horizon',
} as const;

/**
 * Location detail (plan journey 5): larger image, pin, scouting notes, technical data,
 * attribution, Open in Maps, save to project, report. The owner also sees status and controls.
 */
export default function RecordScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<PublicRecord | null>(null);
  const [status, setStatus] = useState<RecordStatusResponse | null>(null);
  const [missing, setMissing] = useState(false);

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

  if (missing) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl }}>
          <Ionicons name="eye-off-outline" size={40} color={t.muted} />
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: '600' }}>No longer available</Text>
          <Body muted>This location was removed or hidden.</Body>
        </View>
      </Screen>
    );
  }

  if (!record) {
    if (!status)
      return <ActivityIndicator style={{ flex: 1, backgroundColor: t.canvas }} color={t.ink} />;
    const rejected = status.status === 'rejected';
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl }}>
          {rejected ? (
            <Ionicons name="close-circle-outline" size={44} color={t.signalRed} />
          ) : (
            <ActivityIndicator color={t.ink} />
          )}
          <Text style={{ color: t.ink, fontSize: 18, fontWeight: '600' }}>
            {STATUS_LABEL[status.status]}
          </Text>
          <Body muted>
            {rejected
              ? (REJECT_LABEL[status.media.rejectReason ?? ''] ??
                'The photo could not be accepted.')
              : 'Checking the photo and preparing it for the feed. This usually takes a few seconds.'}
          </Body>
        </View>
      </Screen>
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
    const { lat, lon, label } = record!;
    const q = encodeURIComponent(label);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${lat},${lon}&q=${q}`
        : `geo:${lat},${lon}?q=${lat},${lon}(${q})`;
    void Linking.openURL(url);
  }

  return (
    <Screen scroll padded={false}>
      <Image
        source={record.images.detail}
        placeholder={record.images.thumb}
        style={{
          width,
          height: width / (record.images.width / record.images.height),
          backgroundColor: '#000',
        }}
        contentFit="cover"
        accessibilityLabel={record.label}
      />
      <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
        <View style={{ gap: 4 }}>
          <Text
            accessibilityRole="header"
            style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}
          >
            {record.label}
          </Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {record.attribution ? `by ${record.attribution.name}` : 'Anonymous'}
            {record.attribution?.socialHandle ? ` · ${record.attribution.socialHandle}` : ''}
          </Text>
        </View>

        <Row>
          <Button label="Open in Maps" kind="secondary" style={{ flex: 1 }} onPress={openInMaps} />
          <Button
            label="Save"
            kind="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push(`/save/${record.id}`)}
          />
        </Row>

        <Body>{record.goodFor.map((g) => GOOD_FOR_LABEL[g]).join(' · ')}</Body>
        {record.goodForNote ? <Body muted>{record.goodForNote}</Body> : null}

        <View style={{ gap: 4 }}>
          <Label>Best light</Label>
          <Body>{record.bestLight.map((b) => BEST_LIGHT_LABEL[b]).join(', ')}</Body>
          {record.bestLightNote ? <Body muted>{record.bestLightNote}</Body> : null}
        </View>

        <View style={{ gap: 4 }}>
          <Label>Camera points toward</Label>
          <Mono style={{ fontSize: 14 }}>
            {formatBearing(record.bearingDeg)}
            {record.sun ? ` · ${LIGHT[lightAngle(record.bearingDeg, record.sun)]} at capture` : ''}
          </Mono>
          {record.sun ? <Mono>{formatSun(record.sun)}</Mono> : null}
          <Mono>
            {formatCoordinates(record.lat, record.lon, 5)}
            {record.accuracyM != null ? ` ±${Math.round(record.accuracyM)} m` : ''}
            {record.distanceM != null ? ` · ${formatDistance(record.distanceM)} away` : ''}
          </Mono>
          <Mono>Captured {new Date(record.capturedAt).toLocaleString()}</Mono>
        </View>

        {shownFacts.length ? (
          <Card>
            {shownFacts.map(([k, v]) => (
              <Row key={k} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ color: t.muted, fontSize: 14 }}>{k}</Text>
                <Text style={{ color: t.ink, fontSize: 14, flexShrink: 1, textAlign: 'right' }}>
                  {v}
                </Text>
              </Row>
            ))}
          </Card>
        ) : null}

        {own && status ? (
          <OwnerControls
            id={record.id}
            status={status}
            attributed={Boolean(record.attribution)}
            onChanged={() => void load()}
          />
        ) : null}

        {!own ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/report/${record.id}`)}
            style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: t.muted, fontSize: 14, textDecorationLine: 'underline' }}>
              Report this location
            </Text>
          </Pressable>
        ) : null}
        <Body muted>
          Access, light and conditions are shared by the community and may change. Always check
          before you go.
        </Body>
      </View>
    </Screen>
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
      <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>
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
