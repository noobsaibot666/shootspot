import { Ionicons } from '@expo/vector-icons';
import type { ImageSet, MediaState, RecordStatus } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaSource } from '../../lib/images';
import { api } from '../../lib/api';
import {
  listDrafts,
  photoFile,
  subscribeDrafts,
  submitDraft,
  type LocalDraft,
} from '../../lib/drafts';
import { clearFinishedImports, listImports, subscribeImports } from '../../lib/imports';
import { STATUS_LABEL } from '../../lib/labels';
import { useSession } from '../../lib/session';
import { radius, space, useTheme } from '../../theme/tokens';
import { Body, Button, Field, Mono, Row } from '../../ui';

interface MyRecord {
  id: string;
  label: string;
  status: RecordStatus;
  attributed: boolean;
  capturedAt: string;
  media: { state: MediaState; rejectReason: string | null };
  images: ImageSet | null;
}
interface Project {
  id: string;
  name: string;
  count: number;
  cover: string | null;
}

type Row =
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
      attributed: boolean;
    };

/** Profile (plan journey 6): the member's own locations and private projects (D-09). */
export default function Profile() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useSession();
  const [tab, setTab] = useState<'locations' | 'projects'>('locations');
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingImports, setPendingImports] = useState(0);
  const me = state.status === 'signed-in' ? state.me : null;
  const name = me
    ? me.profile.displayName || `${me.profile.firstName} ${me.profile.lastName}`.trim()
    : '';

  const load = useCallback(async () => {
    setDrafts(await listDrafts());
    const pending = (await listImports()).filter((i) => i.state === 'todo').length;
    setPendingImports(pending);
    // A fully reviewed batch is tidied up here even if "Done" was never tapped.
    if (pending === 0) await clearFinishedImports();
    const [r, p] = await Promise.allSettled([
      api<{ items: MyRecord[] }>('/v1/me/records'),
      api<{ items: Project[] }>('/v1/projects'),
    ]);
    if (r.status === 'fulfilled') setRecords(r.value.items);
    if (p.status === 'fulfilled') setProjects(p.value.items);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => subscribeDrafts(() => void listDrafts().then(setDrafts)), []);
  useEffect(
    () =>
      subscribeImports(
        () =>
          void listImports().then((l) =>
            setPendingImports(l.filter((i) => i.state === 'todo').length),
          ),
      ),
    [],
  );

  async function createProject() {
    if (!newName.trim()) return;
    await api('/v1/projects', { method: 'POST', body: { name: newName.trim() } }).catch(() => {});
    setNewName('');
    void load();
  }

  const rows: Row[] = [
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
      attributed: r.attributed,
    })),
  ];

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={{ color: t.ink, fontSize: 24, fontWeight: '700' }}
            numberOfLines={1}
          >
            {name || 'Profile'}
          </Text>
          {me ? <Text style={{ color: t.muted, fontSize: 13 }}>{me.user.email}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={12}
          onPress={() => router.push('/settings')}
        >
          <Ionicons name="settings-outline" size={24} color={t.ink} />
        </Pressable>
      </Row>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          backgroundColor: t.surface,
          borderRadius: radius.control,
          padding: 3,
        }}
      >
        {(['locations', 'projects'] as const).map((k) => (
          <Pressable
            key={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
            onPress={() => setTab(k)}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.control - 2,
              backgroundColor: tab === k ? t.raised : 'transparent',
            }}
          >
            <Text style={{ color: t.ink, fontWeight: tab === k ? '700' : '500' }}>
              {k === 'locations' ? 'My locations' : 'Projects'}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === 'locations' && pendingImports > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/capture/import')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            padding: space.md,
            borderRadius: radius.card,
            backgroundColor: t.surface,
          }}
        >
          <Ionicons name="images-outline" size={22} color={t.ink} />
          <Text style={{ flex: 1, color: t.ink, fontSize: 15, fontWeight: '600' }}>
            {pendingImports} imported photo{pendingImports === 1 ? '' : 's'} to review
          </Text>
          <Ionicons name="chevron-forward" size={18} color={t.muted} />
        </Pressable>
      ) : null}
      {tab === 'locations' ? (
        <Body muted>
          Only you can see this list. Your locations are anonymous to others unless you chose to
          show your name.
        </Body>
      ) : (
        <Row>
          <View style={{ flex: 1 }}>
            <Field
              label="New project"
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Lisbon editorial, May"
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={() => void createProject()}
            />
          </View>
          <Button
            label="Add"
            kind="secondary"
            disabled={!newName.trim()}
            onPress={() => void createProject()}
            style={{ marginTop: 22 }}
          />
        </Row>
      )}
    </View>
  );

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    />
  );
  const contentStyle = {
    padding: space.lg,
    paddingTop: insets.top + space.lg,
    paddingBottom: insets.bottom + 120,
    gap: space.md,
  };

  if (tab === 'projects') {
    return (
      <FlatList
        style={{ flex: 1, backgroundColor: t.canvas }}
        data={projects}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        contentContainerStyle={contentStyle}
        refreshControl={refresh}
        ListEmptyComponent={
          <Body muted>No projects yet. Create one, then save locations into it from the feed.</Body>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/projects/${item.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
          >
            {item.cover ? (
              <Image
                source={item.cover}
                style={{ width: 96, height: 54, borderRadius: 8, backgroundColor: '#000' }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  width: 96,
                  height: 54,
                  borderRadius: 8,
                  backgroundColor: t.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="folder-outline" size={20} color={t.muted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>
                {item.count} location{item.count === 1 ? '' : 's'} · Private
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.muted} />
          </Pressable>
        )}
      />
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.canvas }}
      data={rows}
      keyExtractor={(r) => `${r.kind}:${r.id}`}
      ListHeaderComponent={header}
      contentContainerStyle={contentStyle}
      refreshControl={refresh}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', gap: space.sm, paddingTop: space.xl }}>
          <Ionicons name="camera-outline" size={36} color={t.muted} />
          <Body muted>Locations you capture appear here.</Body>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            item.kind === 'record' ? router.push(`/records/${item.id}`) : void submitDraft(item.id)
          }
          style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}
        >
          {item.thumb ? (
            <Image
              source={mediaSource(item.thumb)}
              style={{ width: 96, height: 54, borderRadius: 8, backgroundColor: '#000' }}
              contentFit="cover"
            />
          ) : (
            <View style={{ width: 96, height: 54, borderRadius: 8, backgroundColor: t.surface }} />
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
              {item.kind === 'record' && item.attributed ? ' · name shown' : ''}
              {item.kind === 'draft' && item.status === 'failed' ? ' · tap to retry' : ''}
            </Text>
            <Mono>{new Date(item.when).toLocaleString()}</Mono>
          </View>
        </Pressable>
      )}
    />
  );
}
