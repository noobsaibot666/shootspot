import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { api } from '../../lib/api';
import { space, useTheme } from '../../theme/tokens';
import { Body, Button, ErrorNote, Field, Row, Screen, Title } from '../../ui';

interface Project {
  id: string;
  name: string;
  count: number;
}

/** Save to one or more private projects (plan journey 5). Changes apply immediately. */
export default function SaveSheet() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [inside, setInside] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api<{ items: Project[] }>('/v1/projects'),
        api<{ projectIds: string[] }>(`/v1/records/${id}/projects`),
      ]);
      setProjects(p.items);
      setInside(new Set(c.projectIds));
    } catch {
      setError('Could not load your projects.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(projectId: string) {
    const on = !inside.has(projectId);
    setInside((s) => {
      const next = new Set(s);
      if (on) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
    void Haptics.selectionAsync();
    try {
      if (on)
        await api(`/v1/projects/${projectId}/items`, { method: 'POST', body: { recordId: id } });
      else await api(`/v1/projects/${projectId}/items/${id}`, { method: 'DELETE' });
    } catch {
      setError('That change did not save. Try again.');
      void load();
    }
  }

  async function create() {
    if (!name.trim()) return;
    try {
      const p = await api<Project>('/v1/projects', { method: 'POST', body: { name: name.trim() } });
      setName('');
      await api(`/v1/projects/${p.id}/items`, { method: 'POST', body: { recordId: id } });
      void load();
    } catch {
      setError('Could not create the project.');
    }
  }

  return (
    <Screen scroll>
      <Title sub="Projects are private: only you can see them.">Save to project</Title>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {!projects ? (
        <ActivityIndicator color={t.ink} />
      ) : projects.length === 0 ? (
        <Body muted>No projects yet. Create your first one below.</Body>
      ) : (
        <View style={{ gap: 2 }}>
          {projects.map((p) => {
            const on = inside.has(p.id);
            return (
              <Pressable
                key={p.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => void toggle(p.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52 }}
              >
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={on ? t.ink : t.muted}
                />
                <Text style={{ color: t.ink, fontSize: 16, flex: 1 }} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Row>
        <View style={{ flex: 1 }}>
          <Field
            label="New project"
            value={name}
            onChangeText={setName}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => void create()}
          />
        </View>
        <Button
          label="Create"
          kind="secondary"
          disabled={!name.trim()}
          onPress={() => void create()}
          style={{ marginTop: 22 }}
        />
      </Row>
    </Screen>
  );
}
