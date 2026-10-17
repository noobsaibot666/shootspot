import type { PublicRecord } from '@shootspot/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { space, useTheme } from '../../theme/tokens';
import { Body, Button, Field, Row } from '../../ui';
import { MasonryGrid, recordTile } from '../../ui/masonry';

type Item =
  | { recordId: string; available: true; record: PublicRecord }
  | { recordId: string; available: false; record: null };
interface Project {
  id: string;
  name: string;
  count: number;
}

/** A private project: saved locations, removed ones shown as unavailable (plan §6). */
export default function ProjectScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [list, projects] = await Promise.all([
      api<{ items: Item[] }>(`/v1/projects/${id}/items`),
      api<{ items: Project[] }>('/v1/projects'),
    ]);
    setItems(list.items);
    setName(projects.items.find((p) => p.id === id)?.name ?? '');
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
            <Body muted>
              Private · only you can see this project.
              {items.length ? '' : ' Nothing saved yet: use Save on any location to add it here.'}
            </Body>
          )}
        </View>
        {/* A board, like the feed. In edit mode (or for removed locations) a tap removes. */}
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
      </ScrollView>
    </>
  );
}
