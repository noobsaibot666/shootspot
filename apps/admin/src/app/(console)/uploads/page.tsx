'use client';

import { useCallback, useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ConfirmAction';
import { api, fmtDate } from '@/lib/api';

interface Health {
  byState: Record<string, number>;
  problems: {
    id: string;
    location_id: string;
    state: string;
    reject_reason: string | null;
    last_error: string | null;
    attempts: number;
    updated_at: string;
  }[];
}

export default function UploadsPage() {
  const [data, setData] = useState<Health | null>(null);
  const load = useCallback(() => {
    api<Health>('/admin/v1/uploads').then(setData);
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <h1>Upload health</h1>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid">
            {Object.entries(data.byState).map(([state, n]) => (
              <div key={state} className="card metric">
                <div className="label">{state.replace('_', ' ')}</div>
                <div className="value">{n}</div>
              </div>
            ))}
          </div>
          <h2>Needs attention</h2>
          {data.problems.length === 0 ? (
            <div className="card muted">Nothing failed, stuck, or abandoned.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Media</th>
                  <th>State</th>
                  <th>Detail</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.problems.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Media" className="mono">
                      {p.id.slice(0, 8)} · {p.attempts} attempt(s)
                    </td>
                    <td data-label="State">
                      <StatusBadge value={p.state} />
                    </td>
                    <td data-label="Detail" className="mono">
                      {p.reject_reason ?? p.last_error ?? '—'}
                    </td>
                    <td data-label="Updated" className="mono">
                      {fmtDate(p.updated_at)}
                    </td>
                    <td>
                      {p.state !== 'rejected' && p.state !== 'awaiting_upload' && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={async () => {
                            await api(`/admin/v1/media/${p.id}/retry`, { method: 'POST' });
                            load();
                          }}
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
