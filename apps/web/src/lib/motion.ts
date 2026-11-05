'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs a state change inside a View Transition when the browser has them (Safari 18+, Chrome),
 * so marked elements (`view-transition-name`) morph from the old layout to the new one. `before`
 * runs on the old page, `after` on the new one (e.g. to move the name from the tile to the photo).
 * Without support, or with Reduce Motion, the change simply happens (CSS entry animations remain).
 */
export function morph(
  update: () => void,
  hooks: { before?: () => void; after?: () => void; done?: () => void } = {},
) {
  const doc = document as ViewTransitionDoc;
  if (!doc.startViewTransition || reducedMotion()) {
    update();
    hooks.after?.();
    hooks.done?.();
    return;
  }
  hooks.before?.();
  document.documentElement.classList.add('vt');
  const t = doc.startViewTransition(() => {
    flushSync(update);
    hooks.after?.();
  });
  void t.finished.finally(() => {
    document.documentElement.classList.remove('vt');
    hooks.done?.();
  });
}

/**
 * Keeps an element mounted while it animates out. `state` is 'open' while shown and 'closing'
 * for `ms` after `open` turns false, so CSS can play an exit animation.
 */
export function usePresence(open: boolean, ms = 180) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), reducedMotion() ? 0 : ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted: mounted || open, state: open ? ('open' as const) : ('closing' as const) };
}

/** Hides the top bar while scrolling down and shows it again on the way up (like the app). */
export function useHideOnScroll(threshold = 80) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) < 6) return;
        setHidden(y > last && y > threshold);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [threshold]);
  return hidden;
}
