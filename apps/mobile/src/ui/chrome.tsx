import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import {
  Easing,
  ReduceMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Feed chrome (plan §6): the bottom menu recedes while scrolling down and returns on scroll up or
 * shortly after scrolling stops. All motion runs on the UI thread (Reanimated), so it stays smooth
 * while the list scrolls. Hide: ease-in-out, the pill first, the camera a beat later. Return:
 * an elastic spring with a small overshoot, camera first. Reduce Motion is respected by Reanimated.
 */
interface Chrome {
  /** 0 = visible, 1 = hidden: the pill (and top chips). */
  hidden: SharedValue<number>;
  /** Same, a beat later: the camera button. */
  hiddenLate: SharedValue<number>;
  /** Call from the list's onScroll with the current offset. */
  onScrollY(y: number): void;
  show(): void;
}

const Ctx = createContext<Chrome | null>(null);
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
  const last = useRef(0);
  const state = useRef<0 | 1>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const to = useCallback(
    (v: 0 | 1) => {
      if (state.current === v) return;
      state.current = v;
      if (v === 1) {
        hidden.value = withTiming(1, HIDE);
        hiddenLate.value = withDelay(STAGGER_MS, withTiming(1, HIDE));
      } else {
        hiddenLate.value = withSpring(0, SHOW);
        hidden.value = withDelay(STAGGER_MS, withSpring(0, SHOW));
      }
    },
    [hidden, hiddenLate],
  );

  const show = useCallback(() => to(0), [to]);

  const onScrollY = useCallback(
    (y: number) => {
      const dy = y - last.current;
      last.current = y;
      if (y < 40) to(0);
      else if (dy > 8) to(1);
      else if (dy < -8) to(0);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => to(0), RETURN_AFTER_MS);
    },
    [to],
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
