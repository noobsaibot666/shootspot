'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Summary = Record<
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

const METRICS: [keyof Summary, string][] = [
  ['open_reports', 'Open reports'],
  ['failed_media', 'Failed uploads'],
  ['published', 'Published locations'],
  ['in_progress', 'Processing'],
  ['hidden', 'Hidden'],
  ['rejected_media', 'Rejected images'],
  ['users', 'Members'],
  ['scheduled_deletions', 'Scheduled deletions'],
];

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
        <div className="grid">
          {METRICS.map(([key, label]) => (
            <div key={key} className="card metric">
              <div className="label">{label}</div>
              <div className="value">{data[key]}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
