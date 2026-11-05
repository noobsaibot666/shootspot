'use client';

import type { Vocabulary, WebRecord } from '@shootspot/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, auth, web } from '@/lib/api';
import { distribute, labeler, shortLabel } from '@/lib/format';
import { Detail } from './Detail';

const PAGE = 30;
/** Target column width; the grid uses as many columns as fit (1 on a phone, up to 6). */
const COLUMN = 300;

function useColumns(ref: React.RefObject<HTMLElement | null>) {
  const [n, setN] = useState(4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry!.contentRect.width;
      setN(Math.max(1, Math.min(6, Math.round(w / COLUMN))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return n;
}

/** `?l=<id>` in the address bar is the open location, so a link opens it directly. */
const openId = () => new URLSearchParams(window.location.search).get('l');

export function Gallery() {
  const router = useRouter();
  const [items, setItems] = useState<WebRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'offline'>('loading');
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null);
  const [filter, setFilter] = useState<string[]>([]);
  const [open, setOpen] = useState<WebRecord | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const columns = useColumns(gridRef);
  const label = useMemo(() => labeler(vocabulary), [vocabulary]);

  const signIn = useCallback(() => {
    const here = window.location.pathname + window.location.search;
    router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
  }, [router]);

  const query = useCallback(
    (after?: string | null) => {
      const q = new URLSearchParams({ limit: String(PAGE) });
      if (filter.length) q.set('goodFor', filter.join(','));
      if (after) q.set('cursor', after);
      return q.toString();
    },
    [filter],
  );

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) return signIn();
      if ((err as Error).name === 'AbortError') return;
      setState(err instanceof ApiError && err.status === 0 ? 'offline' : 'error');
    },
    [signIn],
  );

  // First page, again whenever the filter changes.
  useEffect(() => {
    const ctrl = new AbortController();
    setState('loading');
    web
      .feed(query(), ctrl.signal)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setState('ready');
      })
      .catch(fail);
    return () => ctrl.abort();
  }, [query, fail]);

  useEffect(() => {
    web.vocabulary().then(setVocabulary, () => {});
  }, []);

  const more = useCallback(async () => {
    if (!cursor || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await web.feed(query(cursor));
      setItems((prev) => [...prev, ...page.items.filter((p) => !prev.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    } catch (err) {
      fail(err);
    }
    loadingMore.current = false;
  }, [cursor, query, fail]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && void more(), {
      rootMargin: '1200px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [more]);

  // Opening a location: address bar follows (back closes it), deep links load it.
  const show = useCallback((r: WebRecord, push = true) => {
    setOpen(r);
    if (push) window.history.pushState({ l: r.id }, '', `?l=${r.id}`);
    else window.history.replaceState({ l: r.id }, '', `?l=${r.id}`);
  }, []);
  const close = useCallback(() => {
    setOpen(null);
    if (openId()) window.history.pushState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    const sync = () => {
      const id = openId();
      if (!id) return setOpen(null);
      web.record(id).then(
        (r) => setOpen(r),
        (err) => {
          if (err instanceof ApiError && err.status === 401) signIn();
          else window.history.replaceState({}, '', window.location.pathname);
        },
      );
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [signIn]);

  const index = open ? items.findIndex((r) => r.id === open.id) : -1;
  const prev = index > 0 ? () => show(items[index - 1]!, false) : undefined;
  const next =
    index >= 0 && index < items.length - 1
      ? () => {
          show(items[index + 1]!, false);
          if (index + 1 >= items.length - 4) void more();
        }
      : undefined;

  const cols = useMemo(() => distribute(items, columns), [items, columns]);
  const tags = vocabulary?.goodFor ?? [];

  return (
    <>
      <header className="top">
        <div className="brand">
          <i aria-hidden /> ShootSpot
        </div>
        <nav className="chips" aria-label="Filter by what it’s good for">
          <button className="chip" aria-pressed={filter.length === 0} onClick={() => setFilter([])}>
            All
          </button>
          {tags.map((t) => (
            <button
              key={t.key}
              className="chip"
              aria-pressed={filter.includes(t.key)}
              onClick={() =>
                setFilter((f) => (f.includes(t.key) ? f.filter((k) => k !== t.key) : [...f, t.key]))
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          className="ghost"
          onClick={async () => {
            try {
              await auth.signOut();
            } catch {}
            router.replace('/sign-in');
          }}
        >
          Sign out
        </button>
      </header>

      <main>
        <h1 className="sr-only">Locations</h1>
        <div className="grid" ref={gridRef}>
          {cols.map((col, i) => (
            <div className="col" key={i}>
              {col.map((r) => (
                <button
                  key={r.id}
                  className="tile"
                  onClick={() => show(r)}
                  aria-label={`Open ${r.label}`}
                >
                  <img
                    src={r.images.feed}
                    srcSet={`${r.images.thumb} 480w, ${r.images.feed} 1080w`}
                    sizes={`${Math.ceil(100 / columns)}vw`}
                    width={r.images.width}
                    height={r.images.height}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="pill">{shortLabel(r.label)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {state === 'loading' ? <p className="status">Loading locations…</p> : null}
        {state === 'ready' && !items.length ? (
          <p className="status">
            {filter.length ? 'No locations with these tags yet.' : 'No locations yet.'}
          </p>
        ) : null}
        {state === 'error' || state === 'offline' ? (
          <div className="status" role="alert">
            {state === 'offline'
              ? 'Can’t reach ShootSpot. Check your connection.'
              : 'Something went wrong loading locations.'}
            <br />
            <button className="chip" onClick={() => setFilter((f) => [...f])}>
              Try again
            </button>
          </div>
        ) : null}
        <div ref={sentinel} aria-hidden style={{ height: 1 }} />
      </main>

      {open ? (
        <Detail record={open} label={label} onClose={close} onPrev={prev} onNext={next} />
      ) : null}
    </>
  );
}
