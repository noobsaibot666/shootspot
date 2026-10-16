import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { Animated, Easing, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReduceMotion } from '../lib/motion';

/**
 * Feed chrome (plan §6): the bottom menu recedes while scrolling down and returns on scroll up
 * or shortly after scrolling stops. Hiding is staggered and springy: the menu pill drops first,
 * the camera button follows; showing reverses the order. Reduce Motion makes it instant.
 */
interface Chrome {
  /** 0 = visible, 1 = hidden: the pill (and top chips). */
  hidden: Animated.Value;
  /** Same, a beat later: the camera button. */
  hiddenLate: Animated.Value;
  onScroll(e: NativeSyntheticEvent<NativeScrollEvent>): void;
  show(): void;
}

const Ctx = createContext<Chrome | null>(null);
const RETURN_AFTER_MS = 900;
const STAGGER_MS = 70;

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const hidden = useRef(new Animated.Value(0)).current;
  const hiddenLate = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  const last = useRef(0);
  const state = useRef<0 | 1>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const to = useCallback(
    (v: 0 | 1) => {
      if (state.current === v) return;
      state.current = v;
      if (reduce) {
        hidden.setValue(v);
        hiddenLate.setValue(v);
        return;
      }
      // Hide: ease in, then a soft spring settle; show: a slightly bouncy spring back.
      const move = (value: Animated.Value) =>
        v === 1
          ? Animated.timing(value, {
              toValue: 1,
              duration: 260,
              easing: Easing.bezier(0.5, 0, 0.75, 0),
              useNativeDriver: true,
            })
          : Animated.spring(value, {
              toValue: 0,
              tension: 140,
              friction: 12,
              useNativeDriver: true,
            });
      const order = v === 1 ? [hidden, hiddenLate] : [hiddenLate, hidden];
      Animated.stagger(STAGGER_MS, order.map(move)).start();
    },
    [hidden, hiddenLate, reduce],
  );

  const show = useCallback(() => to(0), [to]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - last.current;
      last.current = y;
      if (y < 40) to(0);
      else if (dy > 6) to(1);
      else if (dy < -6) to(0);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => to(0), RETURN_AFTER_MS);
    },
    [to],
  );

  const value = useMemo(
    () => ({ hidden, hiddenLate, onScroll, show }),
    [hidden, hiddenLate, onScroll, show],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChrome(): Chrome {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChrome outside ChromeProvider');
  return c;
}
