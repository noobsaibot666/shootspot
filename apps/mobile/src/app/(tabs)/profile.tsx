import type { ImageSet, MediaState, PublicRecord, RecordStatus } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { isLiked, seedLiked, setLiked, subscribeLikes } from '../../lib/likes';
import { useSession } from '../../lib/session';
import { grid, radius, space, type, useTheme } from '../../theme/tokens';
import {
  Avatar,
  Body,
  Button,
  Field,
  IconButton,
  Row,
  Sheet,
  SheetAction,
  Tap,
  TextTabs,
} from '../../ui';
import { Icon, type IconName } from '../../ui/icon';
import { MasonryList, recordTile, type Tile } from '../../ui/masonry';

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
type Tab = 'locations' | 'liked' | 'projects';

/**
 * Profile (plan journey 6), Savee-style: avatar header with a menu, then three tabs. Locations:
 * the member's own records (drafts and non-published states badged). Liked: their private likes
 * (D-29); long-press to add one to a project or remove it. Projects: private boards (D-09).
 */
export default function Profile() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state } = useSession();
  const [tab, setTab] = useState<Tab>('locations');
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [liked, setLikedItems] = useState<PublicRecord[]>([]);
  const [likeTick, setLikeTick] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingImports, setPendingImports] = useState(0);
  const [manage, setManage] = useState<PublicRecord | null>(null);
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
    const [r, p, l] = await Promise.allSettled([
      api<{ items: MyRecord[] }>('/v1/me/records'),
      api<{ items: Project[] }>('/v1/projects'),
      api<{ items: PublicRecord[] }>('/v1/me/likes'),
    ]);
    if (r.status === 'fulfilled') setRecords(r.value.items);
    if (p.status === 'fulfilled') setProjects(p.value.items);
    if (l.status === 'fulfilled') {
      seedLiked(l.value.items);
      setLikedItems(l.value.items);
    }
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
  // Unliking anywhere (a tile's heart, the detail page) removes it from Liked at once.
  useEffect(() => subscribeLikes(() => setLikeTick((n) => n + 1)), []);

  async function createProject() {
    if (!newName.trim()) return;
    await api('/v1/projects', { method: 'POST', body: { name: newName.trim() } }).catch(() => {});
    setNewName('');
    setAdding(false);
    void load();
  }

  // Drafts not yet on the server, then the member's records; every non-published state is badged.
  const myTiles: Tile[] = useMemo(
    () => [
      ...drafts
        .filter((d) => d.state !== 'done' && d.state !== 'processing')
        .map((d) => ({
          id: `draft:${d.draft.draftId}`,
          label: d.draft.short.label,
          image: photoFile(d.draft.draftId).uri,
          width: d.photo.width,
          height: d.photo.height,
          badge:
            STATUS_LABEL[
              d.state === 'failed' ? 'failed' : d.state === 'ready' ? 'draft' : 'sending'
            ],
          onPress: () => void submitDraft(d.draft.draftId),
        })),
      ...records.map((r) => ({
        id: r.id,
        label: r.label,
        caption: r.label.split(',')[0],
        image: r.images?.feed ?? null,
        placeholder: r.images?.thumb ?? null,
        width: r.images?.width ?? 16,
        height: r.images?.height ?? 9,
        badge:
          r.status === 'published' ? (r.attributed ? 'Name shown' : null) : STATUS_LABEL[r.status],
      })),
    ],
    [drafts, records],
  );
  const likedTiles: Tile[] = useMemo(
    () =>
      liked
        .filter((r) => isLiked(r.id) !== false)
        .map((r) => ({ ...recordTile(r), onLongPress: () => setManage(r) })),
    [liked, likeTick], // eslint-disable-line react-hooks/exhaustive-deps
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

  const header = (
    <View
      style={{
        paddingTop: insets.top + space.sm,
        paddingHorizontal: space.lg - grid.edge + grid.gap / 2,
        gap: space.lg,
        paddingBottom: space.md,
      }}
    >
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

      <TextTabs<Tab>
        tabs={[
          { key: 'locations', label: 'Locations' },
          { key: 'liked', label: 'Liked' },
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
          <Icon name="gallery" size={22} color={t.ink} />
          <Text style={[type.bodyStrong, { flex: 1, color: t.ink }]}>
            {pendingImports} imported photo{pendingImports === 1 ? '' : 's'} to review
          </Text>
          <Icon name="forward" size={18} color={t.muted} />
        </Tap>
      ) : null}
      {tab === 'liked' && likedTiles.length ? (
        <Body muted>Only you see what you liked. Long-press a photo to add it to a project.</Body>
      ) : null}
    </View>
  );

  const listProps = {
    refreshControl: refresh,
    contentContainerStyle: { paddingBottom: insets.bottom + 120 },
    ListHeaderComponent: header,
    style: { flex: 1, backgroundColor: t.canvas },
  };

  if (tab !== 'projects') {
    return (
      <>
        <MasonryList
          key={tab}
          {...listProps}
          tiles={tab === 'locations' ? myTiles : likedTiles}
          ListEmptyComponent={
            tab === 'locations' ? (
              <EmptyState icon="camera" text="Locations you capture or import appear here." />
            ) : (
              <EmptyState icon="heart" text="Tap the heart on any location to keep it here." />
            )
          }
          ListFooterComponent={
            tab === 'locations' && myTiles.length ? (
              <View style={{ padding: space.lg }}>
                <Body muted>
                  Only you see this list. Your locations are anonymous to others unless you chose to
                  show your name.
                </Body>
              </View>
            ) : null
          }
        />
        <Sheet visible={manage !== null} onClose={() => setManage(null)}>
          {manage ? (
            <>
              <SheetAction
                icon="boards"
                label="Add to a project"
                onPress={() => router.push(`/save/${manage.id}`)}
              />
              <SheetAction
                icon="heart"
                label="Remove from Liked"
                onPress={() => void setLiked(manage.id, false)}
              />
            </>
          ) : null}
        </Sheet>
      </>
    );
  }

  const boardW = (width - grid.edge * 2 - grid.gap) / 2;
  return (
    <ScrollView
      style={listProps.style}
      contentContainerStyle={listProps.contentContainerStyle}
      refreshControl={refresh}
    >
      <View style={{ paddingHorizontal: grid.edge - grid.gap / 2 }}>{header}</View>
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
                    <Icon name="boards" size={28} color={t.muted} />
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
            icon="boards"
            text="No projects yet. Create one, then save locations into it from the feed."
          />
        )}
      </View>
    </ScrollView>
  );
}

function EmptyState({ icon, text }: { icon: IconName; text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.md, padding: space.xl, paddingTop: space.xxl }}>
      <Icon name={icon} size={36} color={t.muted} />
      <View style={{ alignItems: 'center' }}>
        <Body muted>{text}</Body>
      </View>
    </View>
  );
}
