import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

/**
 * Feed chrome (plan §6): secondary chrome recedes while the feed scrolls and returns shortly after
 * scrolling stops. Navigation is never removed for long, and Reduce Motion makes it instant.
 */
interface Chrome {
  /** 0 = visible, 1 = hidden. */
  hidden: Animated.Value;
  onScroll(e: NativeSyntheticEvent<NativeScrollEvent>): void;
  show(): void;
}

const Ctx = createContext<Chrome | null>(null);
const RETURN_AFTER_MS = 600;

export function ChromeProvider({ children }: { children: React.ReactNode }) {
  const hidden = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const last = useRef(0);
  const state = useRef<0 | 1>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const to = useCallback(
    (v: 0 | 1) => {
      if (state.current === v) return;
      state.current = v;
      Animated.timing(hidden, {
        toValue: v,
        duration: reduceMotion ? 0 : 220,
        useNativeDriver: true,
      }).start();
    },
    [hidden, reduceMotion],
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

  const value = useMemo(() => ({ hidden, onScroll, show }), [hidden, onScroll, show]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChrome(): Chrome {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChrome outside ChromeProvider');
  return c;
}
