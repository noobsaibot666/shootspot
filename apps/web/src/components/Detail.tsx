'use client';

import type { WebRecord } from '@shootspot/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { goodForTags, lightFacts, practicalFacts, shortLabel, type Labeler } from '@/lib/format';

/**
 * The expanded location: the photo large on the left, the scouting data on the right (stacked on
 * narrow screens). No exact position on the web (D-44): only the location's name, and a way to
 * open it in the app.
 */
export function Detail({
  record,
  placeholder,
  label,
  onClose,
  onPrev,
  onNext,
}: {
  record: WebRecord;
  /** The photo file already on screen in the grid, shown first. Defaults to the feed size. */
  placeholder?: string;
  label: Labeler;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Which record's sharp photo has loaded (per id, so stepping never shows a stale "loaded").
  const [sharpId, setSharpId] = useState<string | null>(null);
  const sharp = sharpId === record.id;
  const setSharp = () => setSharpId(record.id);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    document.body.classList.add('locked');
    return () => {
      document.body.classList.remove('locked');
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const tags = goodForTags(record, label);
  const facts = lightFacts(record, label);
  const rows = practicalFacts(record);
  const a = record.attribution;

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button ref={closeRef} className="icon-btn close" onClick={onClose} aria-label="Close">
          <Glyph d="M4 4l8 8M12 4l-8 8" />
        </button>
        {onPrev ? (
          <button className="icon-btn prev" onClick={onPrev} aria-label="Previous location">
            <Glyph d="M10 3L5 8l5 5" />
          </button>
        ) : null}
        {onNext ? (
          <button className="icon-btn next" onClick={onNext} aria-label="Next location">
            <Glyph d="M6 3l5 5-5 5" />
          </button>
        ) : null}

        <div className="photo">
          {/* The cached tile photo shows at once (and carries the morph from the grid); the
              sharp 2160 px version fades in over it once loaded. */}
          <div
            className="frame"
            key={record.id}
            style={{ '--ar': `${record.images.width} / ${record.images.height}` } as CSSProperties}
          >
            <img
              className="base"
              style={{ viewTransitionName: 'hero' }}
              src={placeholder ?? record.images.feed}
              width={record.images.width}
              height={record.images.height}
              alt={record.label}
            />
            <img
              ref={(el) => {
                if (el?.complete && el.naturalWidth) setSharp();
              }}
              className={`sharp${sharp ? ' loaded' : ''}`}
              src={record.images.detail}
              width={record.images.width}
              height={record.images.height}
              alt=""
              aria-hidden
              onLoad={() => setSharp()}
            />
          </div>
        </div>

        <aside className="info" key={record.id}>
          <div>
            <h1 id="detail-title">{record.label}</h1>
            <div className="byline">
              {a ? `by ${a.name}` : 'Anonymous'}
              {a?.socialHandle ? ` · ${a.socialHandle}` : ''}
              {a?.portfolioUrl ? (
                <>
                  {' · '}
                  <a href={a.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow">
                    Portfolio
                  </a>
                </>
              ) : null}
            </div>
          </div>

          {tags.length || record.goodForNote ? (
            <section>
              <h2 className="label">Good for</h2>
              <div className="tags">
                {tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              {record.goodForNote ? <p className="note">{record.goodForNote}</p> : null}
            </section>
          ) : null}

          <section>
            <h2 className="label">Light & direction</h2>
            <div className="facts">
              {facts.map((f) => (
                <div className="fact" key={f.title}>
                  <b>{f.title}</b>
                  <span>{f.value}</span>
                  {f.sub ? <small>{f.sub}</small> : null}
                </div>
              ))}
            </div>
          </section>

          {rows.length ? (
            <section>
              <h2 className="label">Access & practical</h2>
              <dl className="rows">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section>
            <h2 className="label">Location</h2>
            <div className="where">
              <strong>{shortLabel(record.label)}</strong>
              The exact spot, directions and the map are in the ShootSpot app.
              <div className="ctas">
                <a className="primary" href={`shootspot://records/${record.id}`}>
                  Open in ShootSpot
                </a>
                <button
                  className="pill-btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    } catch {}
                  }}
                >
                  {copied ? 'Link copied' : 'Copy link'}
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
