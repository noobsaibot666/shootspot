'use client';

import type { Vocabulary } from '@shootspot/shared';
import { useEffect, useRef, useState } from 'react';
import { usePresence } from '@/lib/motion';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`logo logo-${size}`}>
      <img src="/logo.png" alt="" width={40} height={40} />
      <span>ShootSpot</span>
    </span>
  );
}

/** Closes a popover on Escape or a click outside `ref`. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, close, ref]);
}

export interface Filter {
  goodFor: string[];
  bestLight: string[];
}

const toggle = (list: string[], key: string) =>
  list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

/** One "Filters" button; the tag groups open in a panel (a bottom sheet on phones). */
export function FilterMenu({
  vocabulary,
  filter,
  onChange,
}: {
  vocabulary: Vocabulary | null;
  filter: Filter;
  onChange: (f: Filter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, close, ref);
  const panel = usePresence(open, 200);
  const count = filter.goodFor.length + filter.bestLight.length;

  const group = (title: string, kind: keyof Filter, tags: { key: string; label: string }[]) => (
    <section>
      <h3>{title}</h3>
      <div className="tagset">
        {tags.map((t) => (
          <button
            key={t.key}
            className="chip"
            aria-pressed={filter[kind].includes(t.key)}
            onClick={() => onChange({ ...filter, [kind]: toggle(filter[kind], t.key) })}
          >
            {t.label}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="menu" ref={ref}>
      <button
        className={`pill-btn${count ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M2 4h12M4.5 8h7M7 12h2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        Filters
        {count ? <span className="badge">{count}</span> : null}
      </button>
      {panel.mounted ? (
        <>
          <div className={`scrim-mobile ${panel.state}`} onClick={close} aria-hidden />
          <div className={`popover filters ${panel.state}`} role="dialog" aria-label="Filters">
            <div className="grabber" aria-hidden />
            {group('Good for', 'goodFor', vocabulary?.goodFor ?? [])}
            {group('Best light', 'bestLight', vocabulary?.bestLight ?? [])}
            <footer>
              <button
                className="ghost"
                disabled={!count}
                onClick={() => onChange({ goodFor: [], bestLight: [] })}
              >
                Clear all
              </button>
              <button className="primary" onClick={close}>
                Done
              </button>
            </footer>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The signed-in member: an initial in a circle, with Sign out in its menu. */
export function AccountMenu({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const panel = usePresence(open, 160);
  return (
    <div className="menu" ref={ref}>
      <button
        className="avatar"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {(email?.[0] ?? '·').toUpperCase()}
      </button>
      {panel.mounted ? (
        <div className={`popover account ${panel.state}`} role="menu">
          <div className="who">
            <small>Signed in as</small>
            {email}
          </div>
          <button role="menuitem" className="item" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
