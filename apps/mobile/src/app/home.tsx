import { Ionicons } from '@expo/vector-icons';
import type { ImageSet, MediaState, RecordStatus } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { listDrafts, photoFile, subscribeDrafts, type LocalDraft } from '../lib/drafts';
import { STATUS_LABEL } from '../lib/labels';
import { useSession } from '../lib/session';
import { space, useTheme } from '../theme/tokens';
import { Body, Mono, Screen, Title } from '../ui';

interface MyRecord {
  id: string;
  label: string;
  status: RecordStatus;
  attributed: boolean;
  capturedAt: string;
  media: { state: MediaState; rejectReason: string | null };
  images: ImageSet | null;
}

type Item =
  | {
      kind: 'draft';
      id: string;
      label: string;
      status: keyof typeof STATUS_LABEL;
      thumb: string;
      when: string;
    }
  | {
      kind: 'record';
      id: string;
      label: string;
      status: keyof typeof STATUS_LABEL;
      thumb: string | null;
      when: string;
    };

/**
 * Phase 3 home: the member's own records (private list) and anything still on the phone, plus
 * the capture action. Feed · Map · Profile navigation (D-17) arrives in Phase 4.
 */
export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, signOut } = useSession();
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setDrafts(await listDrafts());
    try {
      setRecords((await api<{ items: MyRecord[] }>('/v1/me/records')).items);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => subscribeDrafts(() => void listDrafts().then(setDrafts)), []);

  const items: Item[] = [
    ...drafts
      .filter((d) => d.state !== 'done' && d.state !== 'processing')
      .map((d) => ({
        kind: 'draft' as const,
        id: d.draft.draftId,
        label: d.draft.short.label,
        status:
          d.state === 'failed'
            ? ('failed' as const)
            : d.state === 'ready'
              ? ('draft' as const)
              : ('sending' as const),
        thumb: photoFile(d.draft.draftId).uri,
        when: d.draft.capture.capturedAt,
      })),
    ...records.map((r) => ({
      kind: 'record' as const,
      id: r.id,
      label: r.label,
      status: r.status,
      thumb: r.images?.thumb ?? null,
      when: r.capturedAt,
    })),
  ];

  function menu() {
    const email = state.status === 'signed-in' ? state.me.user.email : '';
    const signOutNow = () => void signOut().then(() => router.replace('/sign-in'));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: email,
          options: ['Sign out', 'Cancel'],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (i) => i === 0 && signOutNow(),
      );
    } else {
      Alert.alert(email, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOutNow },
      ]);
    }
  }

  return (
    <Screen padded={false}>
      <View
        style={{
          paddingHorizontal: space.lg,
          paddingTop: space.lg,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1 }}>
          <Title>My locations</Title>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={menu}
          hitSlop={12}
        >
          <Ionicons name="person-circle-outline" size={30} color={t.ink} />
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => `${i.kind}:${i.id}`}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 140 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={{ paddingTop: space.xxl, gap: space.sm, alignItems: 'center' }}>
            <Ionicons name="camera-outline" size={40} color={t.muted} />
            <Body muted>Locations you capture appear here. Only you can see this list.</Body>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => item.kind === 'record' && router.push(`/records/${item.id}`)}
            style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}
          >
            {item.thumb ? (
              <Image
                source={item.thumb}
                style={{ width: 96, height: 54, borderRadius: 8, backgroundColor: '#000' }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{ width: 96, height: 54, borderRadius: 8, backgroundColor: t.surface }}
              />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>
                {item.label}
              </Text>
              <Text
                style={{
                  color:
                    item.status === 'rejected' || item.status === 'failed' ? t.signalRed : t.muted,
                  fontSize: 13,
                }}
              >
                {STATUS_LABEL[item.status]}
              </Text>
              <Mono>{new Date(item.when).toLocaleString()}</Mono>
            </View>
          </Pressable>
        )}
      />
      {/* Capture: separate round action, as in the reference navigation (D-17). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Capture a location"
        onPress={() => router.push('/capture')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: space.xl,
          bottom: insets.bottom + space.xl,
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: t.ink,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="camera" size={28} color={t.onInk} />
      </Pressable>
    </Screen>
  );
}
