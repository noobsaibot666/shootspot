import { Ionicons } from '@expo/vector-icons';
import type { PublicRecord } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { mediaSource } from '../../lib/images';
import { api } from '../../lib/api';
import { space, useTheme } from '../../theme/tokens';
import { Body, Button, Field, Row } from '../../ui';

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
      <FlatList
        style={{ flex: 1, backgroundColor: t.canvas }}
        data={items}
        keyExtractor={(i) => i.recordId}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 60 }}
        ListHeaderComponent={
          editing ? (
            <View style={{ gap: space.md, marginBottom: space.md }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Field label="Project name" value={name} onChangeText={setName} maxLength={80} />
                </View>
                <Button
                  label="Rename"
                  kind="secondary"
                  style={{ marginTop: 22 }}
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
            <Body muted>Private · only you can see this project.</Body>
          )
        }
        ListEmptyComponent={
          <Body muted>Nothing saved yet. Use the bookmark on any location to add it here.</Body>
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Pressable
              accessibilityRole="button"
              disabled={!item.available}
              onPress={() => router.push(`/records/${item.recordId}`)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}
            >
              {item.available ? (
                <Image
                  source={mediaSource(item.record.images.thumb)}
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
                  <Ionicons name="eye-off-outline" size={18} color={t.muted} />
                </View>
              )}
              <Text
                style={{
                  color: item.available ? t.ink : t.muted,
                  fontSize: 15,
                  fontWeight: '600',
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {item.available ? item.record.label : 'No longer available'}
              </Text>
            </Pressable>
            {editing || !item.available ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove from project"
                hitSlop={10}
                onPress={() => void remove(item.recordId)}
              >
                <Ionicons name="remove-circle-outline" size={24} color={t.signalRed} />
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </>
  );
}
