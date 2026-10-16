import { Ionicons } from '@expo/vector-icons';
import {
  formatBearing,
  formatCoordinates,
  formatSun,
  type PublicRecord,
  type RecordStatusResponse,
} from '@shootspot/shared';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { api } from '../../lib/api';
import { listDrafts, settleDraft } from '../../lib/drafts';
import { BEST_LIGHT_LABEL, GOOD_FOR_LABEL, REJECT_LABEL, STATUS_LABEL } from '../../lib/labels';
import { space, useTheme } from '../../theme/tokens';
import { Body, Label, Mono, Screen } from '../../ui';

/** Follows a record from processing to published (or not accepted), then shows it. */
export default function RecordScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [status, setStatus] = useState<RecordStatusResponse | null>(null);
  const [record, setRecord] = useState<PublicRecord | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async (attempt: number) => {
      try {
        const s = await api<RecordStatusResponse>(`/v1/records/${id}/status`);
        if (!alive) return;
        setStatus(s);
        if (s.status === 'published' || s.status === 'hidden') {
          setRecord(await api<PublicRecord>(`/v1/records/${id}`));
        }
        if (s.status === 'published' || s.status === 'rejected') {
          const local = (await listDrafts()).find((d) => d.recordId === id);
          if (local) await settleDraft(local.draft.draftId);
          return;
        }
      } catch {}
      if (alive && attempt < 90) timer = setTimeout(() => void poll(attempt + 1), 2000);
    };
    void poll(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (!status) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.canvas,
        }}
      >
        <ActivityIndicator color={t.ink} />
      </View>
    );
  }

  if (!record) {
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
          <Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{record.label}</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>
            {STATUS_LABEL[status.status]} ·{' '}
            {record.attribution ? `by ${record.attribution.name}` : 'anonymous'}
          </Text>
        </View>
        <Body>{record.goodFor.map((g) => GOOD_FOR_LABEL[g]).join(' · ')}</Body>
        <View style={{ gap: 4 }}>
          <Label>Best light</Label>
          <Body>{record.bestLight.map((b) => BEST_LIGHT_LABEL[b]).join(', ')}</Body>
        </View>
        <View style={{ gap: 4 }}>
          <Label>Camera points toward</Label>
          <Mono style={{ fontSize: 14 }}>{formatBearing(record.bearingDeg)}</Mono>
          {record.sun ? <Mono>{formatSun(record.sun)} at capture</Mono> : null}
          <Mono>{formatCoordinates(record.lat, record.lon, 5)}</Mono>
        </View>
      </View>
    </Screen>
  );
}
