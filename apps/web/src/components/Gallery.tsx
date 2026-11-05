'use client';

import type { Vocabulary, WebRecord } from '@shootspot/shared';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, auth, web } from '@/lib/api';
import { distribute, labeler, shortLabel } from '@/lib/format';
import { morph, useHideOnScroll } from '@/lib/motion';
import { AccountMenu, FilterMenu, Logo, type Filter } from './Chrome';
import { Detail } from './Detail';

const PAGE = 30;
/** Target column width; the grid uses as many columns as fit (1 on a phone, up to 6). */
const COLUMN = 320;
const HERO = 'hero';

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
const tileImage = (id: string) =>
  document.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"] img`);

/** One photo tile: fades in when it arrives, the photo fades in when it has loaded. */
const Tile = memo(function Tile({
  record,
  columns,
  delay,
  onOpen,
}: {
  record: WebRecord;
  columns: number;
  delay: number;
  onOpen: (r: WebRecord) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const { images } = record;
  return (
    <button
      className="tile"
      data-tile={record.id}
      style={
        {
          '--d': `${delay}ms`,
          aspectRatio: `${images.width} / ${images.height}`,
        } as React.CSSProperties
      }
      onClick={() => onOpen(record)}
      aria-label={`Open ${record.label}`}
    >
      <img
        ref={(el) => {
          if (el?.complete && el.naturalWidth) setLoaded(true);
        }}
        className={loaded ? 'loaded' : undefined}
        src={images.feed}
        srcSet={`${images.thumb} 480w, ${images.feed} 1080w`}
        sizes={`${Math.ceil(100 / columns)}vw`}
        width={images.width}
        height={images.height}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
      <span className="shade" aria-hidden />
      <span className="pill">{shortLabel(record.label)}</span>
    </button>
  );
});

/** Shimmering placeholders in the masonry shape while the first page loads. */
function Skeleton({ columns }: { columns: number }) {
  const ratios = [0.5625, 1, 0.5625, 0.75, 0.5625, 1, 0.5625, 0.5625];
  return (
    <div className="grid" aria-hidden>
      {Array.from({ length: columns }, (_, c) => (
        <div className="col" key={c}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{ aspectRatio: `1 / ${ratios[(c * 3 + i) % ratios.length]}` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Gallery() {
  const router = useRouter();
  const [items, setItems] = useState<WebRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'offline'>('loading');
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>({ goodFor: [], bestLight: [] });
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState<WebRecord | null>(null);
  // The photo file the tile was showing (480 or 1080 px): the detail opens on that same, already
  // loaded file, so the morph never lands on an image that is still loading.
  const [shownSrc, setShownSrc] = useState<string | undefined>();
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const columns = useColumns(gridRef);
  const hidden = useHideOnScroll();
  const label = useMemo(() => labeler(vocabulary), [vocabulary]);

  const signIn = useCallback(() => {
    const here = window.location.pathname + window.location.search;
    router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
  }, [router]);

  const query = useCallback(
    (after?: string | null) => {
      const q = new URLSearchParams({ limit: String(PAGE) });
      if (filter.goodFor.length) q.set('goodFor', filter.goodFor.join(','));
      if (filter.bestLight.length) q.set('bestLight', filter.bestLight.join(','));
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

  // First page, again whenever the filter changes (or on Try again).
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
  }, [query, fail, retry]);

  useEffect(() => {
    web.vocabulary().then(setVocabulary, () => {});
    web.me().then(
      (m) => setEmail(m.email),
      () => {},
    );
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

  // Opening a location: the tile's photo morphs into the large one; the address bar follows.
  const show = useCallback((r: WebRecord) => {
    const img = tileImage(r.id);
    const src = (img as HTMLImageElement | null)?.currentSrc || undefined;
    morph(
      () => {
        setShownSrc(src);
        setOpen(r);
      },
      {
        before: () => img && (img.style.viewTransitionName = HERO),
        after: () => img && (img.style.viewTransitionName = ''),
      },
    );
    window.history.pushState({ l: r.id }, '', `?l=${r.id}`);
  }, []);
  const step = useCallback((r: WebRecord) => {
    setShownSrc(undefined);
    setOpen(r);
    window.history.replaceState({ l: r.id }, '', `?l=${r.id}`);
  }, []);
  const close = useCallback(() => {
    const id = open?.id;
    let img: HTMLElement | null = null;
    morph(() => setOpen(null), {
      after: () => {
        img = id ? tileImage(id) : null;
        if (img) img.style.viewTransitionName = HERO;
      },
      done: () => img && (img.style.viewTransitionName = ''),
    });
    if (openId()) window.history.pushState({}, '', window.location.pathname);
  }, [open]);

  // Deep links and the browser's back/forward buttons.
  useEffect(() => {
    const sync = () => {
      const id = openId();
      if (!id) return setOpen(null);
      web.record(id).then(setOpen, (err) => {
        if (err instanceof ApiError && err.status === 401) signIn();
        else window.history.replaceState({}, '', window.location.pathname);
      });
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [signIn]);

  const index = open ? items.findIndex((r) => r.id === open.id) : -1;
  const prev = index > 0 ? () => step(items[index - 1]!) : undefined;
  const next =
    index >= 0 && index < items.length - 1
      ? () => {
          step(items[index + 1]!);
          if (index + 1 >= items.length - 4) void more();
        }
      : undefined;

  const cols = useMemo(() => distribute(items, columns), [items, columns]);
  // Stagger only within the page that just arrived, so appended tiles don't wait for old ones.
  const delayOf = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((r, i) => m.set(r.id, Math.min((i % PAGE) * 35, 500)));
    return m;
  }, [items]);
  const active = [
    ...filter.goodFor.map((k) => ['goodFor', k, label('good_for', k)] as const),
    ...filter.bestLight.map((k) => ['bestLight', k, label('best_light', k)] as const),
  ];

  return (
    <>
      <header className={`top${hidden && !open ? ' hidden' : ''}`}>
        <Logo />
        <div className="top-actions">
          <FilterMenu vocabulary={vocabulary} filter={filter} onChange={setFilter} />
          <AccountMenu
            email={email}
            onSignOut={async () => {
              try {
                await auth.signOut();
              } catch {}
              router.replace('/sign-in');
            }}
          />
        </div>
      </header>

      <main className="page">
        <div className="intro">
          <h1>Locations</h1>
          <p>Scouted by the ShootSpot community. Open one to see its light and access.</p>
        </div>
        {active.length ? (
          <div className="active-filters" aria-label="Active filters">
            {active.map(([kind, key, text]) => (
              <button
                key={`${kind}:${key}`}
                className="chip removable"
                onClick={() =>
                  setFilter((f) => ({ ...f, [kind]: f[kind].filter((k) => k !== key) }))
                }
                aria-label={`Remove filter ${text}`}
              >
                {text}
                <span aria-hidden>×</span>
              </button>
            ))}
            <button className="ghost" onClick={() => setFilter({ goodFor: [], bestLight: [] })}>
              Clear all
            </button>
          </div>
        ) : null}

        <div ref={gridRef}>
          {state === 'loading' ? (
            <Skeleton columns={columns} />
          ) : (
            <div className="grid">
              {cols.map((col, i) => (
                <div className="col" key={i}>
                  {col.map((r) => (
                    <Tile
                      key={r.id}
                      record={r}
                      columns={columns}
                      delay={delayOf.get(r.id) ?? 0}
                      onOpen={show}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {state === 'ready' && !items.length ? (
          <div className="status">
            <strong>{active.length ? 'Nothing matches these filters' : 'No locations yet'}</strong>
            {active.length ? 'Try fewer tags.' : 'New locations from the app appear here.'}
          </div>
        ) : null}
        {state === 'error' || state === 'offline' ? (
          <div className="status" role="alert">
            <strong>
              {state === 'offline' ? 'Can’t reach ShootSpot' : 'Something went wrong'}
            </strong>
            {state === 'offline' ? 'Check your connection.' : 'Locations didn’t load.'}
            <button className="pill-btn" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : null}
        {cursor && state === 'ready' ? <div className="more" aria-hidden /> : null}
        <div ref={sentinel} aria-hidden style={{ height: 1 }} />
      </main>

      {open ? (
        <Detail
          record={open}
          placeholder={shownSrc}
          label={label}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      ) : null}
    </>
  );
}
