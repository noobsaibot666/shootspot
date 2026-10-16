'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/ConfirmAction';
import { api, fmtDate } from '@/lib/api';

type Counts = Record<
  | 'users'
  | 'published'
  | 'in_progress'
  | 'hidden'
  | 'open_reports'
  | 'failed_media'
  | 'rejected_media'
  | 'scheduled_deletions',
  number
>;
type Summary = Counts & { last_backup: string | null; last_offsite_backup: string | null };

const METRICS: [keyof Counts, string][] = [
  ['open_reports', 'Open reports'],
  ['failed_media', 'Failed uploads'],
  ['published', 'Published locations'],
  ['in_progress', 'Processing'],
  ['hidden', 'Hidden'],
  ['rejected_media', 'Rejected images'],
  ['users', 'Members'],
  ['scheduled_deletions', 'Scheduled deletions'],
];

const stale = (iso: string | null) => !iso || Date.now() - Date.parse(iso) > 26 * 3600_000;

export default function SummaryPage() {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>('/admin/v1/summary').then(setData);
  }, []);
  return (
    <>
      <h1>Summary</h1>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="grid">
            {METRICS.map(([key, label]) => (
              <div key={key} className="card metric">
                <div className="label">{label}</div>
                <div className="value">{data[key]}</div>
              </div>
            ))}
          </div>
          <h2>Backups</h2>
          <div className="grid">
            <div className="card">
              <div className="label">Database (nightly, on the NAS)</div>
              <div className="row" style={{ marginTop: 6 }}>
                <StatusBadge value={stale(data.last_backup) ? 'failed' : 'ready'} />
                <span className="mono">
                  {data.last_backup ? fmtDate(data.last_backup) : 'never'}
                </span>
              </div>
            </div>
            <div className="card">
              <div className="label">Off-site (Backblaze B2 EU)</div>
              <div className="row" style={{ marginTop: 6 }}>
                {data.last_offsite_backup ? (
                  <>
                    <StatusBadge value={stale(data.last_offsite_backup) ? 'failed' : 'ready'} />
                    <span className="mono">{fmtDate(data.last_offsite_backup)}</span>
                  </>
                ) : (
                  <span className="muted">Not configured yet</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
