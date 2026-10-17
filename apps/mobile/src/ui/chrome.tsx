import { createContext, useCallback, useContext, useMemo } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedScrollHandler,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Feed chrome (plan §6): the bottom menu recedes while scrolling down and returns on scroll up or
 * shortly after scrolling stops. Everything (scroll tracking, the idle timer, the motion) runs on
 * the UI thread, so the menu reacts on the same frame even while JS is busy rendering new tiles.
 * Hide: ease-in-out, the pill first, the camera a beat later. Return: an elastic spring with a
 * small overshoot, camera first. Reduce Motion is respected by Reanimated.
 */
interface Chrome {
  /** 0 = visible, 1 = hidden: the pill (and top chips). */
  hidden: SharedValue<number>;
  /** Same, a beat later: the camera button. */
  hiddenLate: SharedValue<number>;
  show(): void;
}

const Ctx = createContext<(Chrome & { onScrollY(y: number): void }) | null>(null);
const RETURN_AFTER_MS = 900;
const STAGGER_MS = 80;

const HIDE = {
  duration: 300,
  easing: Easing.inOut(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
// Under-damped spring: settles with a small, soft overshoot (the "elastic" return).
const SHOW = { damping: 14, stiffness: 180, mass: 0.9, reduceMotion: ReduceMotion.System };

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSharedValue(0);
  const hiddenLate = useSharedValue(0);
  const state = useSharedValue(0);
  const last = useSharedValue(0);
  const idle = useSharedValue(0);

  const to = useCallback(
    (v: 0 | 1) => {
      'worklet';
      if (state.value === v) return;
      state.value = v;
      if (v === 1) {
        hidden.value = withTiming(1, HIDE);
        hiddenLate.value = withDelay(STAGGER_MS, withTiming(1, HIDE));
      } else {
        hiddenLate.value = withSpring(0, SHOW);
        hidden.value = withDelay(STAGGER_MS, withSpring(0, SHOW));
      }
    },
    [hidden, hiddenLate, state],
  );

  const show = useCallback(() => to(0), [to]);

  const onScrollY = useCallback(
    (y: number) => {
      'worklet';
      const dy = y - last.value;
      last.value = y;
      if (y < 40) to(0);
      else if (dy > 8) to(1);
      else if (dy < -8) to(0);
      // Idle timer on the UI thread: each scroll event restarts it (the old one is cancelled).
      idle.value = withDelay(
        RETURN_AFTER_MS,
        withTiming(idle.value + 1, { duration: 0 }, (finished) => {
          if (finished) to(0);
        }),
      );
    },
    [idle, last, to],
  );

  const value = useMemo(
    () => ({ hidden, hiddenLate, onScrollY, show }),
    [hidden, hiddenLate, onScrollY, show],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChrome(): Chrome {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChrome outside ChromeProvider');
  return c;
}

/** Scroll handler for an Animated list (`onScroll`): drives the chrome from the UI thread. */
export function useChromeScroll() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChromeScroll outside ChromeProvider');
  const { onScrollY } = c;
  // No dependency array: Reanimated 4 ignores it on native (web only) and warns.
  return useAnimatedScrollHandler({ onScroll: (e) => onScrollY(e.contentOffset.y) });
}
