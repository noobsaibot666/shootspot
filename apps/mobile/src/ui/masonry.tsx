import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { mediaSource } from '../lib/images';
import { setOrigin } from '../lib/motion';
import { grid, radius, type, useTheme } from '../theme/tokens';
import { Tap } from './index';

export interface Tile {
  id: string;
  label: string;
  /** Image URL (presigned or local file). */
  image: string | null;
  placeholder?: string | null;
  width: number;
  height: number;
  /** Small overlay text (e.g. "Processing", "Draft"). */
  badge?: string | null;
  onPress?(): void;
}

/** width / height, falling back to 16:9 when the server or file gave no usable size. */
export function aspectOf(it: { width: number; height: number }): number {
  const a = it.width / it.height;
  return Number.isFinite(a) && a > 0 ? a : 16 / 9;
}

/** Two shortest-column-first stacks: keeps the columns' bottoms level (Savee-style masonry). */
export function columns<T extends { width: number; height: number }>(items: T[], n = 2): T[][] {
  const cols: T[][] = Array.from({ length: n }, () => []);
  const heights = new Array<number>(n).fill(0);
  for (const it of items) {
    const i = heights.indexOf(Math.min(...heights));
    cols[i]!.push(it);
    heights[i]! += 1 / aspectOf(it);
  }
  return cols;
}

/**
 * Image-only tiles in two columns, rounded, tight gutters. Tapping a record tile remembers
 * its on-screen frame so the detail page can open out of it.
 */
export function Masonry({ tiles, edge = grid.edge }: { tiles: Tile[]; edge?: number }) {
  const { width } = useWindowDimensions();
  const colW = (width - edge * 2 - grid.gap) / 2;
  return (
    <View style={{ flexDirection: 'row', gap: grid.gap, paddingHorizontal: edge }}>
      {columns(tiles).map((col, i) => (
        <View key={i} style={{ flex: 1, gap: grid.gap }}>
          {col.map((tile) => (
            <TileView key={tile.id} tile={tile} width={colW} />
          ))}
        </View>
      ))}
    </View>
  );
}

function TileView({ tile, width }: { tile: Tile; width: number }) {
  const t = useTheme();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const aspect = aspectOf(tile);
  const height = width / aspect;
  const open =
    tile.onPress ??
    (() => {
      const go = () => router.push(`/records/${tile.id}`);
      if (!ref.current || !tile.image) return go();
      ref.current.measureInWindow((x, y, w, h) => {
        setOrigin(tile.id, { x, y, width: w, height: h, image: tile.image!, aspect });
        go();
      });
    });
  return (
    <Tap accessibilityRole="button" accessibilityLabel={tile.label} onPress={open} scaleTo={0.97}>
      <View
        ref={ref}
        collapsable={false}
        style={{
          width,
          height,
          borderRadius: radius.tile,
          overflow: 'hidden',
          backgroundColor: t.surface,
        }}
      >
        {tile.image ? (
          <Image
            source={tile.image.startsWith('file:') ? tile.image : mediaSource(tile.image)}
            placeholder={tile.placeholder ? mediaSource(tile.placeholder) : undefined}
            style={{ width, height }}
            contentFit="cover"
            transition={180}
            recyclingKey={tile.id}
          />
        ) : null}
        {tile.badge ? (
          <View
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              backgroundColor: 'rgba(10,10,10,0.7)',
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={[type.label, { color: '#FFFFFF' }]}>{tile.badge}</Text>
          </View>
        ) : null}
      </View>
    </Tap>
  );
}
