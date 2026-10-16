import { Ionicons } from '@expo/vector-icons';
import { formatBearing, formatDistance, type Page, type PublicRecord } from '@shootspot/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../../lib/api';
import { useVocabulary } from '../../lib/vocabulary';
import { filterQuery, scopeLabel, useScope } from '../../lib/scope';
import { font, radius, space, useTheme } from '../../theme/tokens';
import { Body, Button } from '../../ui';
import { useChrome } from '../../ui/chrome';

/** Image-first discovery (plan journey 2). The active scope is always visible at the top. */
export default function Feed() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { scope, center, locationDenied } = useScope();
  const { onScroll, hidden, show } = useChrome();
  const [items, setItems] = useState<PublicRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  const waitingForLocation = scope.mode === 'nearby' && !center && !locationDenied;
  const base = useCallback(() => {
    const parts = ['limit=12'];
    if (center) parts.push(`lat=${center.lat}`, `lon=${center.lon}`, `radiusKm=${scope.radiusKm}`);
    const f = filterQuery(scope);
    if (f) parts.push(f);
    return `/v1/feed?${parts.join('&')}`;
  }, [center, scope]);

  const load = useCallback(async () => {
    if (waitingForLocation) return;
    try {
      const page = await api<Page<PublicRecord>>(base());
      setItems(page.items);
      setCursor(page.nextCursor);
      setState('ready');
    } catch (err) {
      setState(err instanceof ApiError && err.code === 'offline' ? 'offline' : 'error');
    }
  }, [base, waitingForLocation]);

  useEffect(() => {
    setState('loading');
    void load();
    show();
  }, [load, show]);

  async function more() {
    if (!cursor || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await api<Page<PublicRecord>>(`${base()}&cursor=${encodeURIComponent(cursor)}`);
      setItems((prev) => [...prev, ...page.items.filter((p) => !prev.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    } catch {}
    loadingMore.current = false;
  }

  const headerY = hidden.interpolate({ inputRange: [0, 1], outputRange: [0, -(insets.top + 70)] });

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <FlatList
        data={items}
        keyExtractor={(r) => r.id}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onEndReached={() => void more()}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + 120,
          gap: space.xl,
        }}
        refreshControl={
          <RefreshControl
            progressViewOffset={insets.top + 64}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <Empty
            state={state}
            denied={scope.mode === 'nearby' && locationDenied}
            waiting={waitingForLocation}
            onRetry={() => void load()}
          />
        }
        ListFooterComponent={
          cursor ? <ActivityIndicator style={{ margin: space.lg }} color={t.muted} /> : undefined
        }
        renderItem={({ item }) => <Card record={item} width={width} />}
      />
      {/* Scope chip: the active location scope is always visible (plan §6). */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + 8,
          paddingHorizontal: space.lg,
          transform: [{ translateY: headerY }],
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Showing ${scopeLabel(scope, Boolean(center))}. Change area and filters`}
          onPress={() => router.push('/filters')}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: t.raised,
            borderColor: t.divider,
            borderWidth: 1,
            borderRadius: radius.pill,
            paddingHorizontal: space.md,
            minHeight: 40,
          }}
        >
          <Ionicons
            name={
              scope.mode === 'nearby'
                ? 'navigate'
                : scope.mode === 'place'
                  ? 'location'
                  : 'globe-outline'
            }
            size={16}
            color={t.ink}
          />
          <Text style={{ color: t.ink, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
            {scopeLabel(scope, Boolean(center))}
          </Text>
          <Ionicons name="options-outline" size={16} color={t.muted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Card({ record, width }: { record: PublicRecord; width: number }) {
  const { label } = useVocabulary();
  const t = useTheme();
  const h = width / (record.images.width / record.images.height);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={record.label}
      onPress={() => router.push(`/records/${record.id}`)}
    >
      <Image
        source={record.images.feed}
        placeholder={record.images.thumb}
        style={{ width, height: h, backgroundColor: '#000' }}
        contentFit="cover"
        transition={150}
        recyclingKey={record.id}
      />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          gap: space.md,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
            {record.label}
          </Text>
          <Text style={{ color: t.inkSecondary, fontFamily: font.mono, fontSize: 12 }}>
            {[
              record.distanceM != null ? formatDistance(record.distanceM) : null,
              formatBearing(record.bearingDeg),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>
            {record.goodFor.map((g) => label('good_for', g)).join(' · ')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Save ${record.label} to a project`}
          hitSlop={12}
          onPress={() => router.push(`/save/${record.id}`)}
          style={{ padding: 4 }}
        >
          <Ionicons name="bookmark-outline" size={22} color={t.ink} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function Empty(props: { state: string; denied: boolean; waiting: boolean; onRetry(): void }) {
  const t = useTheme();
  if (props.waiting || props.state === 'loading') {
    return <ActivityIndicator style={{ marginTop: space.xxl }} color={t.muted} />;
  }
  const [icon, title, body, action]: [
    keyof typeof Ionicons.glyphMap,
    string,
    string,
    { label: string; onPress(): void } | null,
  ] = props.denied
    ? [
        'navigate-outline',
        'Location is off',
        'Choose a place to browse instead, or allow location in Settings.',
        { label: 'Choose a place', onPress: () => router.push('/filters') },
      ]
    : props.state === 'offline'
      ? [
          'cloud-offline-outline',
          "You're offline",
          'Check your connection and try again.',
          { label: 'Try again', onPress: props.onRetry },
        ]
      : props.state === 'error'
        ? [
            'alert-circle-outline',
            'Something went wrong',
            'The feed could not be loaded.',
            { label: 'Try again', onPress: props.onRetry },
          ]
        : [
            'images-outline',
            'No locations here yet',
            'Widen the area, clear filters, or be the first to scout one.',
            { label: 'Change area', onPress: () => router.push('/filters') },
          ];
  return (
    <View
      style={{
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.xl,
        paddingTop: space.xxl,
      }}
    >
      <Ionicons name={icon} size={40} color={t.muted} />
      <Text style={{ color: t.ink, fontSize: 17, fontWeight: '600' }}>{title}</Text>
      <Body muted>{body}</Body>
      {action ? <Button label={action.label} kind="secondary" onPress={action.onPress} /> : null}
    </View>
  );
}
