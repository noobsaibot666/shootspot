import { Platform, useColorScheme } from 'react-native';

/** Design tokens from docs/phase-0/04-design-brief.md. Dark values are a proposal pending review. */
export const palette = {
  light: {
    canvas: '#E0E0E0',
    surface: '#EAEAEA',
    raised: '#F4F4F4',
    ink: '#111111',
    inkSecondary: '#3A3A3A',
    muted: '#5C5C5C',
    divider: '#B5B5B5',
    signalRed: '#C4271E',
    signalGreen: '#00703C',
    onInk: '#FFFFFF',
  },
  dark: {
    canvas: '#0E0E0E',
    surface: '#1A1A1A',
    raised: '#242424',
    ink: '#EDEDED',
    inkSecondary: '#C8C8C8',
    muted: '#9A9A9A',
    divider: '#2E2E2E',
    signalRed: '#FF453A',
    signalGreen: '#30D158',
    onInk: '#0E0E0E',
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

export const radius = { control: 10, card: 12, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
