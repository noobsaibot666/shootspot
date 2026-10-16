import { Platform, useColorScheme, type TextStyle } from 'react-native';

/**
 * Design tokens. Image-first and quiet, after the owner's Savee references (2026-10-16): deep
 * black or clean white canvas, photos carry the colour, chrome stays monochrome.
 */
export const palette = {
  light: {
    canvas: '#FFFFFF',
    surface: '#F3F3F3',
    raised: '#E9E9E9',
    ink: '#0A0A0A',
    inkSecondary: '#3A3A3A',
    muted: '#6E6E6E',
    divider: '#E2E2E2',
    signalRed: '#D7261B',
    signalGreen: '#00703C',
    onInk: '#FFFFFF',
    scrim: 'rgba(255,255,255,0.86)',
  },
  dark: {
    canvas: '#0A0A0A',
    surface: '#161616',
    raised: '#202020',
    ink: '#F2F2F2',
    inkSecondary: '#C8C8C8',
    muted: '#8C8C8C',
    divider: '#262626',
    signalRed: '#FF453A',
    signalGreen: '#30D158',
    onInk: '#0A0A0A',
    scrim: 'rgba(10,10,10,0.82)',
  },
} as const;

export type Palette = { [K in keyof (typeof palette)['light']]: string };

/** Follows the system theme (D-19). */
export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}

/** The camera and full-screen viewer are always dark, regardless of system theme (D-19). */
export const camera = {
  background: '#000000',
  backplate: 'rgba(0,0,0,0.45)',
  control: '#FFFFFF',
  controlMuted: 'rgba(255,255,255,0.65)',
  accent: '#FFD60A',
  mask: 'rgba(0,0,0,0.55)',
  guide: 'rgba(255,255,255,0.9)',
} as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

/** One type scale for the whole app: sizes, weights and line heights stay consistent. */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4 },
} satisfies Record<string, TextStyle>;

export const radius = { control: 12, card: 16, tile: 14, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Masonry grid (feed, profile, nearby): Savee-like tight gutters. */
export const grid = { gap: 6, edge: 6 } as const;

/** Motion: short, eased, and off when Reduce Motion is on. */
export const motion = { fast: 160, base: 240, slow: 340 } as const;
