'use client';

import { useRef, useState } from 'react';

/**
 * Destructive or moderation action: always asks for confirmation and a reason, which the API
 * stores in the audit log (plan §6, admin console).
 */
export function ConfirmAction(props: {
  label: string;
  title: string;
  impact: string;
  danger?: boolean;
  requireReason?: boolean;
  onConfirm(reason: string): Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReason = props.requireReason !== false;

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await props.onConfirm(reason.trim());
      ref.current?.close();
      setReason('');
    } catch {
      setError('The action failed. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={props.danger ? 'danger' : 'secondary'}
        onClick={() => ref.current?.showModal()}
      >
        {props.label}
      </button>
      <dialog ref={ref}>
        <form onSubmit={confirm}>
          <h2>{props.title}</h2>
          <p className="muted">{props.impact}</p>
          {needsReason && (
            <label>
              Reason (saved to the audit log)
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" className={props.danger ? 'danger' : undefined} disabled={busy}>
              Confirm
            </button>
            <button type="button" className="secondary" onClick={() => ref.current?.close()}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone = ['failed', 'rejected', 'hidden', 'removed', 'open'].includes(value)
    ? 'bad'
    : ['ready', 'published', 'actioned'].includes(value)
      ? 'good'
      : ['processing', 'pending_media', 'queued', 'awaiting_upload'].includes(value)
        ? 'warn'
        : '';
  return <span className={`badge ${tone}`}>{value.replaceAll('_', ' ')}</span>;
}

/** Segmented filter (Savee-like pill switch) for status tabs. */
export function Segmented<K extends string>(props: {
  value: K;
  options: { key: K; label: string }[];
  onChange(k: K): void;
}) {
  return (
    <div className="segmented" role="group">
      {props.options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === props.value}
          onClick={() => props.onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
