'use client';

import { useRef, useState } from 'react';

/** An area as fractions (0–1) of the photo's width and height, from the top left. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Marks areas of a published photo to blur (D-45): a face the automatic blur missed. Drag on the
 * photo to draw a box; draw as many as needed, then confirm with a reason (audit log). The blur
 * applies to every published size and cannot be undone.
 */
export function BlurAreas(props: {
  image: string;
  onSubmit(areas: Area[], reason: string): Promise<void>;
  onCancel(): void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [draft, setDraft] = useState<Area | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const point = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const box = (a: { x: number; y: number }, b: { x: number; y: number }): Area => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(areas, reason.trim());
    } catch {
      setError('The blur could not be queued. Nothing was changed.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <p className="muted" style={{ margin: 0 }}>
        Drag over each face that is still visible. Every published size is blurred, and it cannot be
        undone.
      </p>
      <div
        ref={frame}
        style={{
          position: 'relative',
          touchAction: 'none',
          cursor: 'crosshair',
          userSelect: 'none',
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = point(e);
          setDraft(box(start.current, start.current));
        }}
        onPointerMove={(e) => start.current && setDraft(box(start.current, point(e)))}
        onPointerUp={(e) => {
          if (!start.current) return;
          const a = box(start.current, point(e));
          start.current = null;
          setDraft(null);
          if (a.w > 0.01 && a.h > 0.01 && areas.length < 20) setAreas((list) => [...list, a]);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={props.image}
          alt=""
          draggable={false}
          style={{ width: '100%', borderRadius: 14, display: 'block' }}
        />
        {[...areas, ...(draft ? [draft] : [])].map((a, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${a.x * 100}%`,
              top: `${a.y * 100}%`,
              width: `${a.w * 100}%`,
              height: `${a.h * 100}%`,
              border: '2px solid #ff453a',
              background: 'rgba(255, 69, 58, 0.18)',
              borderRadius: 6,
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>
      <div className="row muted">
        <span>
          {areas.length} area{areas.length === 1 ? '' : 's'} marked
        </span>
        {areas.length > 0 && (
          <button
            type="button"
            className="secondary"
            onClick={() => setAreas((l) => l.slice(0, -1))}
          >
            Undo last
          </button>
        )}
      </div>
      <label>
        Reason (saved to the audit log)
        <textarea
          required
          minLength={3}
          maxLength={500}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="danger" disabled={busy || !areas.length}>
          Blur {areas.length || ''} area{areas.length === 1 ? '' : 's'}
        </button>
        <button type="button" className="secondary" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
