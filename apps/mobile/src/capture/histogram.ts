import { useMemo, useState } from 'react';
import { useFrameOutput } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

/** Bins per channel; enough for a smooth curve at the histogram's on-screen width. */
export const BINS = 48;
/** Analyse every Nth camera frame (~5 per second at 30 fps). */
const EVERY = 6;
/** Pixels sampled per axis; ~2,800 samples keep the frame thread well under a millisecond. */
const SAMPLES_X = 64;
const SAMPLES_Y = 44;

export interface Histogram {
  /** Per-channel bins, 0–1 (square-root scaled, so shadows and highlights stay visible). */
  r: number[];
  g: number[];
  b: number[];
  /** Average scene colour, tints the control panel the way Camera M does. */
  mean: { r: number; g: number; b: number };
}

/**
 * Live RGB histogram from a small RGB frame stream next to the photo output. The frame thread
 * samples a grid of pixels a few times a second and hands the bins back to React.
 */
export function useHistogram() {
  const [histogram, setHistogram] = useState<Histogram | null>(null);
  const counter = useMemo(() => createSynchronizable(0), []);

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    targetResolution: { width: 640, height: 480 },
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';
      try {
        const n = counter.getDirty() + 1;
        counter.setBlocking(n);
        if (n % EVERY !== 0 || !frame.isValid || !frame.hasPixelBuffer) return;

        const format = frame.pixelFormat;
        const step = format === 'rgb-rgb-8-bit' ? 3 : 4;
        // BGRA (iOS): red is the third byte; RGBA / RGB (Android): the first.
        const ro = format === 'rgb-bgra-8-bit' ? 2 : 0;
        const bo = format === 'rgb-bgra-8-bit' ? 0 : 2;
        const px = new Uint8Array(frame.getPixelBuffer());
        const w = frame.width;
        const h = frame.height;
        const row = frame.bytesPerRow;

        const r = new Array<number>(BINS).fill(0);
        const g = new Array<number>(BINS).fill(0);
        const b = new Array<number>(BINS).fill(0);
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let count = 0;
        for (let sy = 0; sy < SAMPLES_Y; sy++) {
          const y = Math.floor(((sy + 0.5) * h) / SAMPLES_Y);
          for (let sx = 0; sx < SAMPLES_X; sx++) {
            const x = Math.floor(((sx + 0.5) * w) / SAMPLES_X);
            const i = y * row + x * step;
            const vr = px[i + ro]!;
            const vg = px[i + 1]!;
            const vb = px[i + bo]!;
            r[(vr * BINS) >> 8]! += 1;
            g[(vg * BINS) >> 8]! += 1;
            b[(vb * BINS) >> 8]! += 1;
            sr += vr;
            sg += vg;
            sb += vb;
            count++;
          }
        }
        let max = 1;
        for (let i = 0; i < BINS; i++) max = Math.max(max, r[i]!, g[i]!, b[i]!);
        const scale = (v: number) => Math.sqrt(v / max);
        scheduleOnRN(setHistogram, {
          r: r.map(scale),
          g: g.map(scale),
          b: b.map(scale),
          mean: { r: sr / count, g: sg / count, b: sb / count },
        });
      } finally {
        frame.dispose();
      }
    },
  });

  return { frameOutput, histogram };
}
