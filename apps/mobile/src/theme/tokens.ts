import { Platform } from 'react-native';

/** Design tokens from docs/phase-0/04-design-brief.md. Dark values are a proposal pending review. */
export const palette = {
  light: {
    canvas: '#E0E0E0',
    surface: '#EAEAEA',
    ink: '#111111',
    inkSecondary: '#1A1A1A',
    divider: '#B5B5B5',
    signalRed: '#FF3B30',
    signalGreen: '#00A859',
  },
  dark: {
    canvas: '#0E0E0E',
    surface: '#1A1A1A',
    ink: '#EDEDED',
    inkSecondary: '#B8B8B8',
    divider: '#2E2E2E',
    signalRed: '#FF453A',
    signalGreen: '#30D158',
  },
} as const;

/** The camera and full-screen viewer are always dark, regardless of system theme (D-19). */
export const camera = {
  background: '#000000',
  backplate: 'rgba(0,0,0,0.55)',
  control: '#FFFFFF',
  controlMuted: 'rgba(255,255,255,0.6)',
  mask: 'rgba(0,0,0,0.6)',
  guide: 'rgba(255,255,255,0.85)',
} as const;

export const font = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

export const radius = { control: 10, card: 12 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
