'use client';

import type { Vocabulary } from '@shootspot/shared';
import { useEffect, useRef, useState } from 'react';
import { web, type IntegrationTokenSummary } from '@/lib/api';
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

/** The signed-in member: an initial in a circle, with export and sign out in its menu. */
export function AccountMenu({
  email,
  exporting,
  onExportAll,
  onSignOut,
}: {
  email: string | null;
  exporting: boolean;
  onExportAll: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeToken, setActiveToken] = useState<IntegrationTokenSummary | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const panel = usePresence(open, 160);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    web
      .integrationToken()
      .then((res) => {
        if (alive) setActiveToken(res.active);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  async function handleGenerateToken() {
    setTokenBusy(true);
    setCopied(false);
    try {
      const created = await web.createIntegrationToken('Portal');
      setNewToken(created.token);
      setActiveToken({
        id: created.id,
        label: created.label,
        tokenPrefix: created.tokenPrefix,
        createdAt: created.createdAt,
        lastUsedAt: null,
      });
    } finally {
      setTokenBusy(false);
    }
  }

  async function handleRevokeToken() {
    setTokenBusy(true);
    try {
      await web.revokeIntegrationToken();
      setActiveToken(null);
      setNewToken(null);
    } finally {
      setTokenBusy(false);
    }
  }

  async function handleCopy() {
    if (!newToken) return;
    await navigator.clipboard?.writeText(newToken);
    setCopied(true);
  }

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
          <button role="menuitem" className="item" onClick={onExportAll} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export all locations'}
          </button>
          <div
            className="who"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4, paddingTop: 8 }}
          >
            <small>Portal integration token</small>
            {newToken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <code
                  style={{
                    fontSize: 11,
                    wordBreak: 'break-all',
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.06)',
                  }}
                >
                  {newToken}
                </code>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="item" onClick={handleCopy}>
                    {copied ? 'Copied!' : 'Copy token'}
                  </button>
                  <button
                    type="button"
                    className="item"
                    onClick={handleRevokeToken}
                    disabled={tokenBusy}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ) : activeToken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{activeToken.tokenPrefix}…</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="item"
                    onClick={handleGenerateToken}
                    disabled={tokenBusy}
                  >
                    {tokenBusy ? 'Rotating…' : 'Rotate token'}
                  </button>
                  <button
                    type="button"
                    className="item"
                    onClick={handleRevokeToken}
                    disabled={tokenBusy}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="item"
                onClick={handleGenerateToken}
                disabled={tokenBusy}
                style={{ marginTop: 4 }}
              >
                {tokenBusy ? 'Creating…' : 'Generate Portal token'}
              </button>
            )}
          </div>
          <button role="menuitem" className="item" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
