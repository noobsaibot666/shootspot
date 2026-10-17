import { formatDistance, type PublicRecord } from '@shootspot/shared';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import {
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { mediaSource } from '../lib/images';
import { useLiked } from '../lib/likes';
import { setPreview, useReduceMotion } from '../lib/motion';
import { grid, radius, useTheme } from '../theme/tokens';
import { Icon } from './icon';
import { Tap } from './index';

export interface Tile {
  id: string;
  label: string;
  /** Image URL (presigned or local file). */
  image: string | null;
  placeholder?: string | null;
  width: number;
  height: number;
  /** Short caption in the location pill (defaults to the label). */
  caption?: string | null;
  distanceM?: number | null;
  /** Viewer's like; undefined = no heart on this tile (own drafts, statuses). */
  liked?: boolean;
  /** Small status overlay (e.g. "Processing", "Draft"); replaces the location pill. */
  badge?: string | null;
  onPress?(): void;
  onLongPress?(): void;
}

/** The first part of a label ("Dudenstraße 24, Friedrichshain" → "Dudenstraße 24") for the pill. */
const short = (label: string) => label.split(',')[0]!.trim();

/** A published record as a tile: location pill, distance and the viewer's heart. */
export function recordTile(r: PublicRecord): Tile {
  return {
    id: r.id,
    label: r.label,
    caption: short(r.label),
    distanceM: r.distanceM,
    liked: r.liked,
    image: r.images.feed,
    placeholder: r.images.thumb,
    width: r.images.width,
    height: r.images.height,
  };
}

/** width / height, falling back to 16:9 when the server or file gave no usable size. */
export function aspectOf(it: { width: number; height: number }): number {
  const a = it.width / it.height;
  return Number.isFinite(a) && a > 0 ? a : 16 / 9;
}

/** Column width for a two-column grid with Savee-like tight gutters. */
export function useColumnWidth(edge: number = grid.edge) {
  const { width } = useWindowDimensions();
  return (width - edge * 2 - grid.gap) / 2;
}

/**
 * One image-first tile: the photo, a short location pill (where it is, how far) and a private
 * heart. Memoised: recycled list cells re-render only when their tile changes.
 */
export const TileCard = memo(function TileCard({ tile, width }: { tile: Tile; width: number }) {
  const t = useTheme();
  const aspect = aspectOf(tile);
  const height = width / aspect;
  const caption = tile.caption ?? tile.label;
  // A column is ~500 px wide on most phones: the 480 px derivative is sharp enough there and
  // decodes ~5x less than the 1080 px one (the main cost of a fast scroll on Android).
  const small = !!tile.placeholder && width * PixelRatio.get() <= THUMB_MAX_PX;
  const image = small ? tile.placeholder! : tile.image;
  const open =
    tile.onPress ??
    (() => {
      // The page shows what this tile already has in cache while the large image loads.
      if (image) setPreview(tile.id, { image, aspect });
      router.push(`/records/${tile.id}`);
    });
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      onPress={open}
      onLongPress={tile.onLongPress}
      delayLongPress={350}
      scaleTo={0.97}
    >
      <View
        style={{
          width,
          height,
          borderRadius: radius.tile,
          overflow: 'hidden',
          backgroundColor: t.surface,
        }}
      >
        {image ? (
          <Image
            source={image.startsWith('file:') ? image : mediaSource(image)}
            placeholder={!small && tile.placeholder ? mediaSource(tile.placeholder) : undefined}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={{ duration: 220, effect: 'cross-dissolve', timing: 'ease-out' }}
            recyclingKey={tile.id}
            cachePolicy="memory-disk"
          />
        ) : null}
        {tile.badge ? (
          <View style={[styles.pill, { maxWidth: width - 16 }]}>
            <Text style={styles.pillText} numberOfLines={1}>
              {tile.badge}
            </Text>
          </View>
        ) : caption ? (
          <View style={[styles.pill, { maxWidth: width - (tile.liked === undefined ? 16 : 52) }]}>
            <Icon name="pin.fill" size={11} color="#FFFFFF" />
            <Text style={styles.pillText} numberOfLines={1}>
              {caption}
              {tile.distanceM != null ? ` · ${formatDistance(tile.distanceM)}` : ''}
            </Text>
          </View>
        ) : null}
        {tile.liked !== undefined ? <Heart id={tile.id} initial={tile.liked} /> : null}
      </View>
    </Tap>
  );
});

const THUMB_MAX_PX = 560;

/** The private like (D-29): a small pop when liked. */
export function Heart({
  id,
  initial,
  size = 18,
  color = '#FFFFFF',
  style,
}: {
  id: string;
  initial: boolean;
  size?: number;
  /** Colour when not liked. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const [liked, toggle] = useLiked(id, initial);
  const scale = useSharedValue(1);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
      accessibilityState={{ selected: liked }}
      onPress={() => {
        if (!liked && !reduce) {
          scale.value = withSequence(
            withTiming(1.28, { duration: 110, easing: Easing.out(Easing.quad) }),
            withSpring(1, { damping: 9, stiffness: 260, mass: 0.6 }),
          );
        }
        toggle();
      }}
      hitSlop={10}
      style={style ?? styles.heart}
    >
      <Animated.View style={pop}>
        <Icon name={liked ? 'heart.fill' : 'heart'} size={size} color={liked ? t.accent : color} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * Recycling two-column masonry (FlashList): only visible tiles exist, so long feeds stay light.
 * Tiles fade in once when first created; recycled cells swap images with a short cross-fade.
 */
export function MasonryList(
  props: Omit<
    FlashListProps<Tile>,
    'data' | 'renderItem' | 'numColumns' | 'masonry' | 'onScroll'
  > & {
    tiles: Tile[];
    edge?: number;
    /** A Reanimated scroll handler (`useAnimatedScrollHandler`): runs on the UI thread. */
    onScroll?: ReturnType<typeof useAnimatedScrollHandler>;
  },
) {
  const { tiles, edge = grid.edge, contentContainerStyle, ...rest } = props;
  const colW = useColumnWidth(edge);
  const renderItem = useCallback(
    ({ item }: { item: Tile }) => (
      <Animated.View entering={FadeIn.duration(240)} style={{ padding: grid.gap / 2 }}>
        <TileCard tile={item} width={colW} />
      </Animated.View>
    ),
    [colW],
  );
  return (
    <AnimatedFlashList
      {...rest}
      data={tiles}
      masonry
      numColumns={2}
      keyExtractor={tileKey}
      scrollEventThrottle={16}
      contentContainerStyle={{
        ...(contentContainerStyle as object),
        paddingHorizontal: edge - grid.gap / 2,
      }}
      renderItem={renderItem}
    />
  );
}

const tileKey = (t: Tile) => t.id;
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<Tile>);

/** Small static grid (a dozen tiles, e.g. "More nearby" inside a page that already scrolls). */
export function MasonryGrid({ tiles, edge = grid.edge }: { tiles: Tile[]; edge?: number }) {
  const colW = useColumnWidth(edge);
  const cols: Tile[][] = [[], []];
  const heights = [0, 0];
  for (const it of tiles) {
    const i = heights[0]! <= heights[1]! ? 0 : 1;
    cols[i]!.push(it);
    heights[i]! += 1 / aspectOf(it);
  }
  return (
    <View style={{ flexDirection: 'row', gap: grid.gap, paddingHorizontal: edge }}>
      {cols.map((col, i) => (
        <View key={i} style={{ flex: 1, gap: grid.gap }}>
          {col.map((tile) => (
            <TileCard key={tile.id} tile={tile} width={colW} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,10,10,0.55)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  heart: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.35)',
  },
});
