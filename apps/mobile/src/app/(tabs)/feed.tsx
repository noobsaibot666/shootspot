import type { Page, PublicRecord } from '@shootspot/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../../lib/api';
import { seedLiked } from '../../lib/likes';
import { filterQuery, scopeLabel, useScope } from '../../lib/scope';
import { radius, space, type, useTheme } from '../../theme/tokens';
import { Body, Button, Tap } from '../../ui';
import { useChrome, useChromeScroll } from '../../ui/chrome';
import { Icon, type IconName } from '../../ui/icon';
import { MasonryList, recordTile } from '../../ui/masonry';

/**
 * Image-first discovery (plan journey 2), Savee-style: a recycling two-column masonry. Each tile
 * shows a short location pill and a private heart; details open on tap. The active scope stays
 * visible in a small floating chip that recedes with the menu while scrolling.
 */
export default function Feed() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { scope, center, locationDenied } = useScope();
  const { hidden, show } = useChrome();
  const scroll = useChromeScroll();
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
      seedLiked(page.items);
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

  const more = useCallback(async () => {
    if (!cursor || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await api<Page<PublicRecord>>(`${base()}&cursor=${encodeURIComponent(cursor)}`);
      seedLiked(page.items);
      setItems((prev) => [...prev, ...page.items.filter((p) => !prev.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    } catch {}
    loadingMore.current = false;
  }, [base, cursor]);

  const tiles = useMemo(() => items.map(recordTile), [items]);
  const top = insets.top + 60;
  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -hidden.value * (insets.top + 70) }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas }}>
      <MasonryList
        tiles={tiles}
        onScroll={scroll}
        onEndReached={() => void more()}
        onEndReachedThreshold={0.8}
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
        ListEmptyComponent={
          <Empty
            state={state}
            denied={scope.mode === 'nearby' && locationDenied}
            waiting={waitingForLocation}
            onRetry={() => void load()}
          />
        }
        ListFooterComponent={
          cursor && items.length ? (
            <ActivityIndicator style={{ margin: space.xl }} color={t.muted} />
          ) : null
        }
      />

      {/* Scope chip: the active area is always visible (plan §6); tap for area and filters. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: insets.top + 8,
            left: space.md,
            right: space.md,
            flexDirection: 'row',
            // Right side: within thumb reach when holding the phone in one hand.
            justifyContent: 'flex-end',
          },
          chipStyle,
        ]}
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
          <Icon
            name={
              scope.mode === 'nearby'
                ? 'navigate.fill'
                : scope.mode === 'place'
                  ? 'pin.fill'
                  : 'globe'
            }
            size={16}
            color={t.ink}
          />
          <Text style={[type.bodyStrong, { color: t.ink, maxWidth: 240 }]} numberOfLines={1}>
            {scopeLabel(scope, Boolean(center))}
          </Text>
          <Icon name="filters" size={16} color={t.muted} />
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
    IconName,
    string,
    string,
    { label: string; onPress(): void } | null,
  ] = props.denied
    ? [
        'navigate',
        'Location is off',
        'Choose a place to browse instead, or allow location in Settings.',
        { label: 'Choose a place', onPress: () => router.push('/filters') },
      ]
    : props.state === 'offline'
      ? [
          'offline',
          "You're offline",
          'Check your connection and try again.',
          { label: 'Try again', onPress: props.onRetry },
        ]
      : props.state === 'error'
        ? [
            'alert',
            'Something went wrong',
            'The feed could not be loaded.',
            { label: 'Try again', onPress: props.onRetry },
          ]
        : [
            'gallery',
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
      <Icon name={icon} size={40} color={t.muted} />
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
