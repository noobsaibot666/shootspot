import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '../../capture/context';
import {
  IMPORT_LIMIT,
  clearFinishedImports,
  listImports,
  pickPhotos,
  removeImport,
  type ImportItem,
} from '../../lib/imports';
import { radius, space, useTheme } from '../../theme/tokens';
import { Body, Button } from '../../ui';

const COLUMNS = 3;
const GAP = 4;

/**
 * The import batch (D-28): every picked photo, reviewed one at a time through crop → pin →
 * notes → publish. Finished photos get a check; the rest wait here (and in Profile) for later.
 */
export default function ImportBatch() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const capture = useCapture();
  const [items, setItems] = useState<ImportItem[]>([]);
  const [picking, setPicking] = useState(false);
  const tile = (width - space.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const todo = items.filter((i) => i.state === 'todo');

  useFocusEffect(
    useCallback(() => {
      void listImports().then(setItems);
    }, []),
  );

  async function addPhotos() {
    setPicking(true);
    try {
      await pickPhotos();
      setItems(await listImports());
    } catch {
      Alert.alert('Could not open your photos', 'Check that ShootSpot may access your photos.');
    } finally {
      setPicking(false);
    }
  }

  function review(item: ImportItem) {
    const m = item.meta;
    capture.reset();
    capture.update({
      origin: 'import',
      importId: item.id,
      capturedAt: m.capturedAt ?? new Date().toISOString(),
      timeEstimated: m.capturedAt == null,
      altitudeM: m.altitudeM,
      headingDeg: m.headingDeg,
      bearingDeg: m.headingDeg == null ? null : Math.round(m.headingDeg) % 360,
      gps: m.gps ? { ...m.gps, accuracyM: null } : null,
      focalLength35mm: m.focalLength35mm,
    });
    router.push({ pathname: '/capture/crop', params: { id: item.id } });
  }

  function finish() {
    void clearFinishedImports().then(() => router.dismissTo('/profile'));
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: space.lg, gap: GAP, paddingBottom: 160 }}
        ListHeaderComponent={
          <View style={{ gap: space.sm, paddingBottom: space.md }}>
            <Body muted>
              {items.length === 0
                ? `Pick up to ${IMPORT_LIMIT} photos from your gallery. You review each one: frame it, confirm the place, add notes, publish.`
                : todo.length === 0
                  ? 'All photos are done.'
                  : `${todo.length} to review · ${items.length - todo.length} done. Unfinished photos wait here and in Profile.`}
            </Body>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.state === 'done' ? 'Published photo' : 'Review this photo'}
            disabled={item.state === 'done'}
            onPress={() => review(item)}
            onLongPress={() =>
              Alert.alert('Remove this photo from the batch?', undefined, [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => void removeImport(item.id).then(listImports).then(setItems),
                },
              ])
            }
          >
            {item.state === 'done' ? (
              // The original is already deleted after publishing; show a quiet "done" tile.
              <View
                style={{
                  width: tile,
                  height: tile,
                  borderRadius: radius.control,
                  backgroundColor: t.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="checkmark-circle" size={28} color={t.ink} />
              </View>
            ) : (
              <Image
                source={item.uri}
                style={{ width: tile, height: tile, borderRadius: radius.control }}
                contentFit="cover"
              />
            )}
            {item.state !== 'done' && !item.meta.gps ? (
              <View style={{ position: 'absolute', left: 6, bottom: 6 }}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color="#FFFFFF"
                  accessibilityLabel="No location in photo"
                />
              </View>
            ) : null}
          </Pressable>
        )}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: space.lg,
          paddingBottom: insets.bottom + space.lg,
          gap: space.sm,
          backgroundColor: t.canvas,
        }}
      >
        {todo.length > 0 ? (
          <Button label={`Review next (${todo.length} left)`} onPress={() => review(todo[0]!)} />
        ) : items.length > 0 ? (
          <Button label="Done" onPress={finish} />
        ) : null}
        {todo.length < IMPORT_LIMIT ? (
          <Button
            label={items.length ? 'Add more photos' : 'Choose photos'}
            kind={items.length ? 'secondary' : 'primary'}
            busy={picking}
            onPress={() => void addPhotos()}
          />
        ) : (
          <Text style={{ color: t.muted, textAlign: 'center' }}>
            {IMPORT_LIMIT} photos is the most per batch.
          </Text>
        )}
      </View>
    </View>
  );
}
