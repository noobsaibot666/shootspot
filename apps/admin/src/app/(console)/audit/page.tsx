'use client';

import { PageHead } from '@/components/PageHead';
import { useEffect, useState } from 'react';
import { api, fmtDate } from '@/lib/api';

interface Event {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  actor: string | null;
  created_at: string;
}

export default function AuditPage() {
  const [items, setItems] = useState<Event[]>([]);
  const [done, setDone] = useState(false);

  async function more(before?: string) {
    const page = await api<{ items: Event[] }>(
      `/admin/v1/audit?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`,
    );
    setItems((prev) => [...prev, ...page.items]);
    if (page.items.length < 50) setDone(true);
  }
  useEffect(() => {
    more();
  }, []);

  return (
    <>
      <PageHead title="Audit log" sub="Every admin action, who did it, and why. Read-only." />
      <p className="muted">Every admin action and every view of who created a record.</p>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Target</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <td data-label="When" className="mono">
                {fmtDate(e.created_at)}
              </td>
              <td data-label="Who">{e.actor ?? 'deleted account'}</td>
              <td data-label="Action" className="mono">
                {e.action}
              </td>
              <td data-label="Target" className="mono">
                {e.target_type} {e.target_id?.slice(0, 8)}
              </td>
              <td data-label="Reason">{e.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!done && items.length > 0 && (
        <button
          type="button"
          className="secondary"
          style={{ marginTop: 12 }}
          onClick={() => more(items.at(-1)?.created_at)}
        >
          Load older
        </button>
      )}
    </>
  );
}
