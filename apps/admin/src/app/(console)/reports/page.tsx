'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConfirmAction, StatusBadge } from '@/components/ConfirmAction';
import { api, fmtDate } from '@/lib/api';

interface Report {
  id: string;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string;
  record: { id: string; label: string; status: string; openReports: number; thumb: string | null };
}

export default function ReportsPage() {
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed'>('open');
  const [items, setItems] = useState<Report[] | null>(null);
  const load = useCallback(() => {
    api<{ items: Report[] }>(`/admin/v1/reports?status=${status}`).then((r) => setItems(r.items));
  }, [status]);
  useEffect(load, [load]);

  async function moderate(recordId: string, action: 'hide' | 'restore' | 'remove', reason: string) {
    await api(`/admin/v1/records/${recordId}/moderate`, {
      method: 'POST',
      body: { action, reason },
    });
  }
  async function resolve(id: string, outcome: 'actioned' | 'dismissed', note: string) {
    await api(`/admin/v1/reports/${id}/resolve`, { method: 'POST', body: { outcome, note } });
    load();
  }

  return (
    <>
      <h1>Reports</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ margin: 0, maxWidth: 200 }}>
          <span className="label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="open">Open</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
      </div>
      {!items ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <div className="card muted">No {status} reports.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Reason</th>
              <th>Reported</th>
              <th>Record</th>
              {status === 'open' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td data-label="Location">
                  <div className="row">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.record.thumb && <img className="thumb" src={r.record.thumb} alt="" />}
                    <div>
                      <div>{r.record.label}</div>
                      <div className="mono muted">{r.record.id.slice(0, 8)}</div>
                    </div>
                  </div>
                </td>
                <td data-label="Reason">
                  <div>{r.reason.replaceAll('_', ' ')}</div>
                  {r.note && <div className="muted">“{r.note}”</div>}
                  {r.record.openReports > 1 && (
                    <div className="label">{r.record.openReports} open reports</div>
                  )}
                </td>
                <td data-label="Reported" className="mono">
                  {fmtDate(r.createdAt)}
                </td>
                <td data-label="Record">
                  <StatusBadge value={r.record.status} />
                </td>
                {status === 'open' && (
                  <td data-label="Actions">
                    <div className="row">
                      {r.record.status === 'published' && (
                        <ConfirmAction
                          label="Hide"
                          title="Hide this location?"
                          impact="It disappears from the feed and search. Its creator can still see it. You can restore it later."
                          onConfirm={async (reason) => {
                            await moderate(r.record.id, 'hide', reason);
                            await resolve(r.id, 'actioned', reason);
                          }}
                        />
                      )}
                      <ConfirmAction
                        label="Remove"
                        danger
                        title="Remove this location permanently?"
                        impact="It is removed for everyone, including saved projects (shown as no longer available)."
                        onConfirm={async (reason) => {
                          await moderate(r.record.id, 'remove', reason);
                          await resolve(r.id, 'actioned', reason);
                        }}
                      />
                      <ConfirmAction
                        label="Dismiss"
                        title="Dismiss this report?"
                        impact="The location stays published."
                        onConfirm={(reason) => resolve(r.id, 'dismissed', reason)}
                      />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
