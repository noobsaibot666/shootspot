import type { AdvancedInput, BestLightPeriod, Framing, GoodForTag, Pin } from '@shootspot/shared';
import { createContext, useContext, useMemo, useState } from 'react';

/** Everything gathered while capturing one location, before it becomes a draft. */
export interface CaptureState {
  photo: { uri: string; width: number; height: number; framing: Framing } | null;
  capturedAt: string | null;
  altitudeM: number | null;
  headingDeg: number | null;
  /** GPS fix at the moment of capture, if location permission was granted. */
  gps: { lat: number; lon: number; accuracyM: number | null } | null;
  pin: Pin | null;
  label: string;
  goodFor: GoodForTag[];
  goodForNote: string;
  bestLight: BestLightPeriod[];
  bestLightNote: string;
  bearingDeg: number | null;
  advanced: AdvancedInput;
  attributed: boolean;
  /** camera, or a gallery import (D-28) whose GPS/time/heading came from the photo. */
  origin: 'camera' | 'import';
  /** The import queue item being reviewed. */
  importId: string | null;
  focalLength35mm: number | null;
  /** Imported photo without a usable capture time: "now" stands in, and the preview says so. */
  timeEstimated: boolean;
}

export const initialCapture: CaptureState = {
  photo: null,
  capturedAt: null,
  altitudeM: null,
  headingDeg: null,
  gps: null,
  pin: null,
  label: '',
  goodFor: [],
  goodForNote: '',
  bestLight: [],
  bestLightNote: '',
  bearingDeg: null,
  advanced: {},
  attributed: false,
  origin: 'camera',
  importId: null,
  focalLength35mm: null,
  timeEstimated: false,
};
const initial = initialCapture;

interface Capture {
  state: CaptureState;
  update(patch: Partial<CaptureState>): void;
  reset(): void;
}

const Ctx = createContext<Capture | null>(null);

export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CaptureState>(initial);
  const value = useMemo<Capture>(
    () => ({
      state,
      update: (patch) => setState((s) => ({ ...s, ...patch })),
      reset: () => setState(initial),
    }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapture(): Capture {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCapture outside CaptureProvider');
  return c;
}
