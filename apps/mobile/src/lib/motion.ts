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
 * The image a tapped tile was showing, so the detail page can paint the photo instantly from the
 * image cache while the full record loads (no blank page during the transition).
 */
export interface Preview {
  image: string;
  /** width / height */
  aspect: number;
}
const previews = new Map<string, Preview>();

export function setPreview(id: string, p: Preview) {
  previews.set(id, p);
  if (previews.size > 200) previews.delete(previews.keys().next().value!);
}

export function getPreview(id: string): Preview | null {
  return previews.get(id) ?? null;
}
