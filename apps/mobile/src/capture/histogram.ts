import { useMemo, useSyncExternalStore } from 'react';
import { useFrameOutput, type Frame } from 'react-native-vision-camera';
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets';

/** Brightness bins; enough for a smooth curve at the histogram's on-screen width. */
export const BINS = 40;
/** Analyse every Nth camera frame (~6 per second at 30 fps). */
const EVERY = 5;
/** Pixels sampled per axis: ~1,800 reads, well under a millisecond on the frame thread. */
const SAMPLES_X = 48;
const SAMPLES_Y = 36;
/**
 * Small frames are plenty for a histogram. Module constant on purpose: `useFrameOutput` rebuilds
 * its output when this object changes, and an inline object (new on every render) made the camera
 * session reconfigure several times a second in build 7 (jumping preview, dropped frames).
 */
const TARGET = { width: 640, height: 480 };

/**
 * Frame processing needs the native `react-native-vision-camera-worklets` add-on. Without it
 * `useFrameOutput` throws on render (the build 6 crash). Without the add-on the camera simply
 * has no histogram.
 */
export const framesAvailable = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return !!require('react-native-vision-camera-worklets')?.provider;
  } catch {
    return false;
  }
})();

// Latest bins (0–1), outside React state: only the histogram view re-renders on new data.
let latest: number[] | null = null;
const listeners = new Set<() => void>();
function publish(bins: number[]) {
  latest = bins;
  listeners.forEach((fn) => fn());
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function useHistogramBins(): number[] | null {
  return useSyncExternalStore(subscribe, () => latest);
}

/**
 * A luminance histogram from the camera's own YUV frames (the Y plane is brightness, so nothing
 * is converted). Returns the frame output to attach while the histogram is shown, or null when
 * frame processing isn't available.
 */
export const useHistogramOutput = framesAvailable ? useFrameHistogram : () => null;

function useFrameHistogram() {
  const counter = useMemo(() => createSynchronizable(0, { fixedType: true }), []);
  // Stable worklet: a new function would re-register the frame callback on every render.
  const onFrame = useMemo(
    () => (frame: Frame) => {
      'worklet';
      try {
        const n = counter.getDirty() + 1;
        counter.setDirty(n);
        if (n % EVERY !== 0 || !frame.isValid) return;

        let buffer: ArrayBuffer;
        let row: number;
        let w: number;
        let h: number;
        if (frame.isPlanar) {
          const y = frame.getPlanes()[0]!;
          buffer = y.getPixelBuffer();
          row = y.bytesPerRow;
          w = y.width;
          h = y.height;
        } else {
          buffer = frame.getPixelBuffer();
          row = frame.bytesPerRow;
          w = frame.width;
          h = frame.height;
        }
        const px = new Uint8Array(buffer);
        const bins = new Array<number>(BINS).fill(0);
        for (let sy = 0; sy < SAMPLES_Y; sy++) {
          const offset = Math.floor(((sy + 0.5) * h) / SAMPLES_Y) * row;
          for (let sx = 0; sx < SAMPLES_X; sx++) {
            const v = px[offset + Math.floor(((sx + 0.5) * w) / SAMPLES_X)]!;
            bins[(v * BINS) >> 8]! += 1;
          }
        }
        let max = 1;
        for (let i = 0; i < BINS; i++) max = Math.max(max, bins[i]!);
        // Square root keeps thin shadows and highlights visible next to a big mid-tone peak.
        scheduleOnRN(
          publish,
          bins.map((v) => Math.sqrt(v / max)),
        );
      } finally {
        frame.dispose();
      }
    },
    [counter],
  );

  return useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: TARGET,
    dropFramesWhileBusy: true,
    onFrame,
  });
}
