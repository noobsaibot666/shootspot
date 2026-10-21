import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { api } from '../lib/api';
import { space, type, useTheme } from '../theme/tokens';
import { Body, Button, Card, ErrorNote, Screen } from '../ui';

interface Block {
  id: string;
  label: string | null;
  createdAt: string;
}

/**
 * Members this member blocked (D-41). Authors stay anonymous, so each block is named by the
 * location it was made from.
 */
export default function Blocked() {
  const t = useTheme();
  const [items, setItems] = useState<Block[] | null>(null);
  const [error, setError] = useState(false);

  const load = () =>
    api<{ items: Block[] }>('/v1/me/blocks').then(
      (r) => {
        setItems(r.items);
        setError(false);
      },
      () => setError(true),
    );
  useEffect(() => {
    void load();
  }, []);

  function unblock(b: Block) {
    Alert.alert('Unblock this member?', 'Their locations will show up for you again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          await api(`/v1/me/blocks/${b.id}`, { method: 'DELETE' }).catch(() => {});
          void load();
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      <Body muted>
        Blocked members' locations are hidden from you everywhere. They aren't told, and they stay
        anonymous.
      </Body>
      {error ? <ErrorNote>Could not load your blocked members. Try again.</ErrorNote> : null}
      {!items && !error ? <ActivityIndicator color={t.ink} /> : null}
      {items?.length === 0 ? <Body muted>You haven't blocked anyone.</Body> : null}
      {items?.map((b) => (
        <Card key={b.id}>
          <View style={{ gap: 2 }}>
            <Text style={[type.bodyStrong, { color: t.ink }]}>
              Author of “{b.label ?? 'a removed location'}”
            </Text>
            <Text style={[type.caption, { color: t.muted }]}>
              Blocked {new Date(b.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <View style={{ alignSelf: 'flex-start', paddingTop: space.xs }}>
            <Button label="Unblock" kind="secondary" size="small" onPress={() => unblock(b)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
