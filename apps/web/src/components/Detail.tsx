'use client';

import type { WebRecord } from '@shootspot/shared';
import { useEffect, useRef } from 'react';
import { goodForTags, lightFacts, practicalFacts, shortLabel, type Labeler } from '@/lib/format';

/**
 * The expanded location: the photo large on the left, the scouting data on the right (stacked on
 * narrow screens). No exact position on the web (D-44): only the location's name, and a way to
 * open it in the app.
 */
export function Detail({
  record,
  label,
  onClose,
  onPrev,
  onNext,
}: {
  record: WebRecord;
  label: Labeler;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    document.body.classList.add('locked');
    return () => {
      document.body.classList.remove('locked');
      opener?.focus?.();
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
          ×
        </button>
        {onPrev ? (
          <button className="icon-btn prev" onClick={onPrev} aria-label="Previous location">
            ‹
          </button>
        ) : null}
        {onNext ? (
          <button className="icon-btn next" onClick={onNext} aria-label="Next location">
            ›
          </button>
        ) : null}

        <div className="photo">
          {/* key: show the new photo at once when stepping, not the previous one scaled. */}
          <img
            key={record.id}
            src={record.images.detail}
            srcSet={`${record.images.feed} 1080w, ${record.images.detail} 2160w`}
            sizes="(max-width: 900px) 100vw, calc(100vw - 440px)"
            width={record.images.width}
            height={record.images.height}
            alt={record.label}
          />
        </div>

        <aside className="info">
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
              <br />
              <a className="cta" href={`shootspot://records/${record.id}`}>
                Open in ShootSpot
              </a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
