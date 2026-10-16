'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmAction, Segmented, StatusBadge } from '@/components/ConfirmAction';
import { PageHead } from '@/components/PageHead';
import { api, fmtDate } from '@/lib/api';

interface Item {
  id: string;
  label: string;
  status: string;
  origin: 'camera' | 'import';
  createdAt: string;
  openReports: number;
  width: number | null;
  height: number | null;
  image: string | null;
}
type Status = 'published' | 'hidden' | 'processing' | 'rejected' | 'removed' | 'all';

/**
 * Locations library: every record as a photo grid (Savee-style), newest first, for browsing and
 * moderation. Opening one shows details and actions; creator identity is not shown here (D-06).
 */
export default function LocationsPage() {
  const [status, setStatus] = useState<Status>('published');
  const [items, setItems] = useState<Item[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState<Item | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(
    async (before?: string) => {
      const r = await api<{ items: Item[]; nextBefore: string | null }>(
        `/admin/v1/records?status=${status}${before ? `&before=${encodeURIComponent(before)}` : ''}`,
      );
      setItems((prev) => (before && prev ? [...prev, ...r.items] : r.items));
      setNext(r.nextBefore);
    },
    [status],
  );
  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function moderate(id: string, action: 'hide' | 'restore' | 'remove', reason: string) {
    await api(`/admin/v1/records/${id}/moderate`, { method: 'POST', body: { action, reason } });
    dialog.current?.close();
    void load();
  }

  return (
    <>
      <PageHead
        title="Locations"
        sub="Everything members published, newest first. Click a photo for details and moderation."
      >
        <Segmented<Status>
          value={status}
          options={[
            { key: 'published', label: 'Published' },
            { key: 'processing', label: 'Processing' },
            { key: 'hidden', label: 'Hidden' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'removed', label: 'Removed' },
          ]}
          onChange={setStatus}
        />
      </PageHead>

      {!items ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty">No {status} locations.</div>
      ) : (
        <div className="masonry">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className="tile"
              aria-label={it.label}
              onClick={() => {
                setOpen(it);
                dialog.current?.showModal();
              }}
            >
              {it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.image}
                  alt=""
                  loading="lazy"
                  style={{
                    aspectRatio: it.width && it.height ? `${it.width} / ${it.height}` : '16 / 9',
                  }}
                />
              ) : (
                <div
                  style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center' }}
                  className="muted"
                >
                  No image
                </div>
              )}
              {(it.status !== 'published' || it.openReports > 0) && (
                <span className="badge-wrap" style={{ position: 'absolute', top: 10, left: 10 }}>
                  {it.openReports > 0 ? (
                    <span className="badge bad">
                      {it.openReports} report{it.openReports > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <StatusBadge value={it.status} />
                  )}
                </span>
              )}
              <span className="cap">{it.label}</span>
            </button>
          ))}
        </div>
      )}
      {next && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button type="button" className="secondary" onClick={() => void load(next)}>
            Load more
          </button>
        </div>
      )}

      <dialog ref={dialog} style={{ maxWidth: 640 }} onClose={() => setOpen(null)}>
        {open && (
          <div style={{ display: 'grid', gap: 14 }}>
            {open.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={open.image}
                alt=""
                style={{ width: '100%', borderRadius: 14, display: 'block' }}
              />
            )}
            <div>
              <h2 style={{ margin: 0 }}>{open.label}</h2>
              <div className="row muted" style={{ marginTop: 6 }}>
                <StatusBadge value={open.status} />
                <span>
                  {open.origin === 'import' ? 'Imported from gallery' : 'Taken in the app'}
                </span>
                <span className="mono">{fmtDate(open.createdAt)}</span>
                <span className="mono">{open.id.slice(0, 8)}</span>
              </div>
            </div>
            <div className="row">
              {open.status === 'published' && (
                <ConfirmAction
                  label="Hide"
                  title="Hide this location?"
                  impact="It disappears from the feed and search. Its creator can still see it. You can restore it later."
                  onConfirm={(reason) => moderate(open.id, 'hide', reason)}
                />
              )}
              {open.status === 'hidden' && (
                <ConfirmAction
                  label="Restore"
                  title="Restore this location?"
                  impact="It returns to the feed."
                  onConfirm={(reason) => moderate(open.id, 'restore', reason)}
                />
              )}
              {(open.status === 'published' || open.status === 'hidden') && (
                <ConfirmAction
                  label="Remove"
                  danger
                  title="Remove this location permanently?"
                  impact="It is removed for everyone, including saved projects (shown as no longer available)."
                  onConfirm={(reason) => moderate(open.id, 'remove', reason)}
                />
              )}
              <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
