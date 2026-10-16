import { Ionicons } from '@expo/vector-icons';
import type { ImageSet, MediaState, RecordStatus } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import {
  listDrafts,
  photoFile,
  subscribeDrafts,
  submitDraft,
  type LocalDraft,
} from '../../lib/drafts';
import { mediaSource } from '../../lib/images';
import { clearFinishedImports, listImports, subscribeImports } from '../../lib/imports';
import { STATUS_LABEL } from '../../lib/labels';
import { useSession } from '../../lib/session';
import { grid, radius, space, type, useTheme } from '../../theme/tokens';
import { Avatar, Body, Button, Field, IconButton, Row, Tap, TextTabs } from '../../ui';
import { Masonry, type Tile } from '../../ui/masonry';

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

/**
 * Profile (plan journey 6), Savee-style: avatar header with a menu, then the member's own
 * locations as a photo grid (drafts and non-published states carry a small badge) and private
 * projects as boards (D-09).
 */
export default function Profile() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state } = useSession();
  const [tab, setTab] = useState<'locations' | 'projects'>('locations');
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
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
    setAdding(false);
    void load();
  }

  // Drafts not yet on the server, then the member's records; every non-published state is badged.
  const tiles: Tile[] = [
    ...drafts
      .filter((d) => d.state !== 'done' && d.state !== 'processing')
      .map((d) => ({
        id: `draft:${d.draft.draftId}`,
        label: d.draft.short.label,
        image: photoFile(d.draft.draftId).uri,
        width: d.photo.width,
        height: d.photo.height,
        badge:
          STATUS_LABEL[d.state === 'failed' ? 'failed' : d.state === 'ready' ? 'draft' : 'sending'],
        onPress: () => void submitDraft(d.draft.draftId),
      })),
    ...records.map((r) => ({
      id: r.id,
      label: r.label,
      image: r.images?.feed ?? null,
      placeholder: r.images?.thumb ?? null,
      width: r.images?.width ?? 16,
      height: r.images?.height ?? 9,
      badge:
        r.status === 'published' ? (r.attributed ? 'Name shown' : null) : STATUS_LABEL[r.status],
    })),
  ];

  const boardW = (width - grid.edge * 2 - grid.gap) / 2;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + space.sm,
        paddingBottom: insets.bottom + 120,
      }}
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
    >
      {/* Header: who you are, and the menu (Settings). */}
      <View style={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row style={{ gap: space.md, flex: 1 }}>
            <Avatar name={name} size={52} />
            <View style={{ flex: 1 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={[type.title, { color: t.ink }]}
              >
                {name || 'Profile'}
              </Text>
              {me ? (
                <Text numberOfLines={1} style={[type.caption, { color: t.muted }]}>
                  {me.user.email}
                </Text>
              ) : null}
            </View>
          </Row>
          <IconButton
            icon="menu"
            label="Menu and settings"
            onPress={() => router.push('/settings')}
          />
        </Row>

        <TextTabs<'locations' | 'projects'>
          tabs={[
            { key: 'locations', label: 'Locations' },
            { key: 'projects', label: 'Projects' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'locations' && pendingImports > 0 ? (
          <Tap
            accessibilityRole="button"
            onPress={() => router.push('/capture/import')}
            scaleTo={0.98}
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
            <Text style={[type.bodyStrong, { flex: 1, color: t.ink }]}>
              {pendingImports} imported photo{pendingImports === 1 ? '' : 's'} to review
            </Text>
            <Ionicons name="chevron-forward" size={18} color={t.muted} />
          </Tap>
        ) : null}
      </View>

      {tab === 'locations' ? (
        tiles.length ? (
          <>
            <Masonry tiles={tiles} />
            <View style={{ padding: space.lg }}>
              <Body muted>
                Only you see this list. Your locations are anonymous to others unless you chose to
                show your name.
              </Body>
            </View>
          </>
        ) : (
          <EmptyState icon="camera-outline" text="Locations you capture or import appear here." />
        )
      ) : (
        <View style={{ gap: space.lg }}>
          <View style={{ paddingHorizontal: space.lg }}>
            {adding ? (
              <Row style={{ alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="New project"
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="e.g. Lisbon editorial, May"
                    maxLength={80}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => void createProject()}
                  />
                </View>
                <Button
                  label="Add"
                  size="small"
                  disabled={!newName.trim()}
                  onPress={() => void createProject()}
                />
              </Row>
            ) : (
              <Button
                label="New project"
                icon="add"
                kind="secondary"
                size="small"
                onPress={() => setAdding(true)}
              />
            )}
          </View>
          {projects.length ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: grid.gap,
                paddingHorizontal: grid.edge,
              }}
            >
              {projects.map((p) => (
                <Tap
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${p.count} locations`}
                  onPress={() => router.push(`/projects/${p.id}`)}
                  style={{ width: boardW, gap: space.sm }}
                >
                  <View
                    style={{
                      width: boardW,
                      height: boardW,
                      borderRadius: radius.tile,
                      overflow: 'hidden',
                      backgroundColor: t.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {p.cover ? (
                      <Image
                        source={mediaSource(p.cover)}
                        style={{ width: boardW, height: boardW }}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="albums-outline" size={28} color={t.muted} />
                    )}
                  </View>
                  <View style={{ paddingHorizontal: 4, paddingBottom: space.sm }}>
                    <Text numberOfLines={1} style={[type.bodyStrong, { color: t.ink }]}>
                      {p.name}
                    </Text>
                    <Text style={[type.caption, { color: t.muted }]}>
                      {p.count} location{p.count === 1 ? '' : 's'} · Private
                    </Text>
                  </View>
                </Tap>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="albums-outline"
              text="No projects yet. Create one, then save locations into it from the feed."
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}

function EmptyState({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.md, padding: space.xl, paddingTop: space.xxl }}>
      <Ionicons name={icon} size={36} color={t.muted} />
      <View style={{ alignItems: 'center' }}>
        <Body muted>{text}</Body>
      </View>
    </View>
  );
}
