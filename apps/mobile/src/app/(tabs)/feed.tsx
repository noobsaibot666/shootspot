import { Ionicons } from '@expo/vector-icons';
import type { Page, PublicRecord } from '@shootspot/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../../lib/api';
import { filterQuery, scopeLabel, useScope } from '../../lib/scope';
import { radius, space, type, useTheme } from '../../theme/tokens';
import { Body, Button, Tap } from '../../ui';
import { useChrome } from '../../ui/chrome';
import { Masonry } from '../../ui/masonry';

/**
 * Image-first discovery (plan journey 2), Savee-style: a two-column masonry of photos with no
 * text; details open on tap. The active scope stays visible in a small floating chip.
 */
export default function Feed() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { scope, center, locationDenied } = useScope();
  const { onScroll, hidden, show } = useChrome();
  const [items, setItems] = useState<PublicRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  const waitingForLocation = scope.mode === 'nearby' && !center && !locationDenied;
  const base = useCallback(() => {
    const parts = ['limit=24'];
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

  // Reload on every focus too, so a record published from the capture flow shows up when the
  // user comes back to the tab. Only a changed scope/filter shows the spinner.
  const lastBase = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const b = base();
      if (b !== lastBase.current) {
        lastBase.current = b;
        setState('loading');
        show();
      }
      void load();
    }, [base, load, show]),
  );

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
  const top = insets.top + 60;

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <Animated.ScrollView
        onScroll={(e) => {
          onScroll(e);
          const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height > contentSize.height - 800) void more();
        }}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingTop: top, paddingBottom: insets.bottom + 120 }}
        refreshControl={
          <RefreshControl
            progressViewOffset={top}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {items.length ? (
          <Masonry
            tiles={items.map((r) => ({
              id: r.id,
              label: r.label,
              image: r.images.feed,
              placeholder: r.images.thumb,
              width: r.images.width,
              height: r.images.height,
            }))}
          />
        ) : (
          <Empty
            state={state}
            denied={scope.mode === 'nearby' && locationDenied}
            waiting={waitingForLocation}
            onRetry={() => void load()}
          />
        )}
        {cursor && items.length ? (
          <ActivityIndicator style={{ margin: space.xl }} color={t.muted} />
        ) : null}
      </Animated.ScrollView>

      {/* Scope chip: the active area is always visible (plan §6); tap for area and filters. */}
      <Animated.View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: space.md,
          right: space.md,
          flexDirection: 'row',
          transform: [{ translateY: headerY }],
        }}
      >
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Showing ${scopeLabel(scope, Boolean(center))}. Change area and filters`}
          onPress={() => router.push('/filters')}
          scaleTo={0.95}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            backgroundColor: t.scrim,
            borderRadius: radius.pill,
            paddingHorizontal: 14,
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
          <Text style={[type.bodyStrong, { color: t.ink, maxWidth: 240 }]} numberOfLines={1}>
            {scopeLabel(scope, Boolean(center))}
          </Text>
          <Ionicons name="options-outline" size={16} color={t.muted} />
        </Tap>
      </Animated.View>
    </View>
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
        paddingTop: space.xxl * 2,
      }}
    >
      <Ionicons name={icon} size={40} color={t.muted} />
      <Text style={[type.headline, { color: t.ink }]}>{title}</Text>
      <View style={{ alignItems: 'center' }}>
        <Body muted>{body}</Body>
      </View>
      {action ? (
        <Button label={action.label} kind="secondary" size="small" onPress={action.onPress} />
      ) : null}
    </View>
  );
}
