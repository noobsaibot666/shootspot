import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { radius, space, type, useTheme } from '../../theme/tokens';
import { Body, Button, Field, Row } from '../../ui';
import { MasonryGrid, recordTile } from '../../ui/masonry';
import { ProjectMap, ProjectSchedule, type ProjectListItem } from '../../ui/project-planner';

interface Project {
  id: string;
  name: string;
  shootDate: string | null;
  count: number;
}

type ViewMode = 'board' | 'schedule' | 'map';

/** A private project: saved locations, shoot-day schedule, route map, and private notes. */
export default function ProjectScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [name, setName] = useState('');
  const [shootDate, setShootDate] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('board');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [list, projects] = await Promise.all([
      api<{ items: ProjectListItem[] }>(`/v1/projects/${id}/items`),
      api<{ items: Project[] }>('/v1/projects'),
    ]);
    setItems(list.items);
    const current = projects.items.find((p) => p.id === id);
    setName(current?.name ?? '');
    setShootDate(current?.shootDate ?? null);
  }, [id]);

  useEffect(() => {
    void load().catch(() => {});
  }, [load]);

  async function remove(recordId: string) {
    setItems((s) => s.filter((i) => i.recordId !== recordId));
    await api(`/v1/projects/${id}/items/${recordId}`, { method: 'DELETE' }).catch(
      () => void load(),
    );
  }

  async function saveOrder(orderedIds: string[]) {
    const byId = new Map(items.map((i) => [i.recordId, i]));
    const reordered = orderedIds.map((rid) => byId.get(rid)).filter(Boolean) as ProjectListItem[];
    setItems(reordered);
    await api(`/v1/projects/${id}/order`, {
      method: 'PUT',
      body: { recordIds: orderedIds },
    }).catch(() => void load());
  }

  function moveItem(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    void saveOrder(next.map((i) => i.recordId));
  }

  async function updateShootDate(next: string | null) {
    setShootDate(next);
    await api(`/v1/projects/${id}`, { method: 'PATCH', body: { shootDate: next } }).catch(
      () => void load(),
    );
  }

  async function saveNote(recordId: string, note: string | null) {
    setItems((prev) => prev.map((i) => (i.recordId === recordId ? { ...i, note } : i)));
    await api(`/v1/projects/${id}/items/${recordId}`, {
      method: 'PATCH',
      body: { note },
    }).catch(() => void load());
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: name || 'Project',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit project"
              hitSlop={12}
              onPress={() => setEditing((e) => !e)}
            >
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600' }}>
                {editing ? 'Done' : 'Edit'}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: t.canvas }}
        contentContainerStyle={{ paddingVertical: space.lg, gap: space.lg, paddingBottom: 60 }}
      >
        <View style={{ paddingHorizontal: space.lg }}>
          {editing ? (
            <View style={{ gap: space.md }}>
              <Row style={{ alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Field label="Project name" value={name} onChangeText={setName} maxLength={80} />
                </View>
                <Button
                  label="Rename"
                  kind="secondary"
                  size="small"
                  disabled={!name.trim()}
                  onPress={() =>
                    void api(`/v1/projects/${id}`, { method: 'PATCH', body: { name: name.trim() } })
                  }
                />
              </Row>
              <Button
                label="Delete project"
                kind="danger"
                onPress={() =>
                  Alert.alert(
                    'Delete this project?',
                    'The saved locations stay in ShootSpot; only this list is deleted.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          await api(`/v1/projects/${id}`, { method: 'DELETE' }).catch(() => {});
                          router.back();
                        },
                      },
                    ],
                  )
                }
              />
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <Body muted>
                Private · only you can see this project.
                {items.length ? '' : ' Nothing saved yet: use Save on any location to add it here.'}
              </Body>
              {items.length ? (
                <Row style={{ gap: space.xs }}>
                  {(
                    [
                      ['board', 'Board'],
                      ['schedule', 'Schedule'],
                      ['map', 'Map'],
                    ] as const
                  ).map(([m, labelText]) => {
                    const active = mode === m;
                    return (
                      <Pressable
                        key={m}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        onPress={() => setMode(m)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: radius.pill,
                          backgroundColor: active ? t.ink : t.surface,
                        }}
                      >
                        <Text
                          style={[
                            type.caption,
                            { color: active ? t.onInk : t.ink, fontWeight: '600' },
                          ]}
                        >
                          {labelText}
                        </Text>
                      </Pressable>
                    );
                  })}
                </Row>
              ) : null}
            </View>
          )}
        </View>

        {mode === 'schedule' && !editing ? (
          <ProjectSchedule
            items={items}
            shootDate={shootDate}
            onShootDateChange={(d) => void updateShootDate(d)}
            onMove={moveItem}
            onSortByLight={(ids) => void saveOrder(ids)}
            onSaveNote={saveNote}
          />
        ) : mode === 'map' && !editing ? (
          <ProjectMap items={items} />
        ) : (
          /* A board, like the feed. In edit mode (or for removed locations) a tap removes. */
          <MasonryGrid
            tiles={items.map((item) =>
              item.available
                ? editing
                  ? {
                      ...recordTile(item.record),
                      liked: undefined,
                      badge: 'Tap to remove',
                      onPress: () => void remove(item.recordId),
                    }
                  : recordTile(item.record)
                : {
                    id: item.recordId,
                    label: 'No longer available',
                    image: null,
                    width: 16,
                    height: 9,
                    badge: 'Unavailable · tap to remove',
                    onPress: () => void remove(item.recordId),
                  },
            )}
          />
        )}
      </ScrollView>
    </>
  );
}
