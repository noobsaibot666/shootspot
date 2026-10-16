import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the system asks for reduced motion: animations then complete instantly. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/**
 * Where a tapped tile sat on screen, and the image it showed, so the detail page can grow the
 * photo out of it at once (card-open transition) while the full record loads.
 */
export interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The tile's image URL and aspect ratio (width / height). */
  image: string;
  aspect: number;
}

/** A tap is used within this window; an old position (deep link, later visit) is ignored. */
const FRESH_MS = 1500;
const origins = new Map<string, Origin & { at: number }>();

export function setOrigin(id: string, o: Origin) {
  origins.set(id, { ...o, at: Date.now() });
}

/** Non-destructive (render may run twice in development); freshness limits reuse. */
export function getOrigin(id: string): Origin | null {
  const o = origins.get(id);
  return o && Date.now() - o.at < FRESH_MS ? o : null;
}
