'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Segmented, StatusBadge } from '@/components/ConfirmAction';
import { PageHead } from '@/components/PageHead';
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
interface Metrics {
  days: number;
  new_members: number;
  active_creators: number;
  records_created: number;
  published: number;
  imported: number;
  media_failed: number;
  media_rejected: number;
  upload_success_rate: number | null;
  median_publish_seconds: number | null;
  reports_opened: number;
  median_report_hours: number | null;
  exports: number;
  deletions_requested: number;
}

const stale = (iso: string | null) => !iso || Date.now() - Date.parse(iso) > 26 * 3600_000;
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const dur = (s: number | null) =>
  s == null ? '—' : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;

/**
 * Summary: what needs attention first, then the pilot's numbers (plan Phase 6), the library
 * totals, and backup health.
 */
export default function SummaryPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [days, setDays] = useState<'7' | '30'>('7');
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    api<Summary>('/admin/v1/summary').then(setData);
  }, []);
  useEffect(() => {
    setMetrics(null);
    api<Metrics>(`/admin/v1/metrics?days=${days}`).then(setMetrics, () => {});
  }, [days]);

  if (!data) return <p className="muted">Loading…</p>;

  const attention = [
    data.open_reports > 0 && { href: '/reports', n: data.open_reports, text: 'open reports' },
    data.failed_media > 0 && { href: '/uploads', n: data.failed_media, text: 'failed uploads' },
    stale(data.last_backup) && {
      href: '',
      n: null,
      text: 'Database backup is older than 26 hours',
    },
  ].filter(Boolean) as { href: string; n: number | null; text: string }[];

  return (
    <>
      <PageHead
        title="Summary"
        sub="What needs attention, how the pilot is going, and whether backups ran."
      />

      {attention.length ? (
        <div className="grid" style={{ marginBottom: 8 }}>
          {attention.map((a) => (
            <div key={a.text} className="card attention">
              <div className="label">Needs attention</div>
              <div className="metric">
                {a.n != null && <div className="value">{a.n}</div>}
                <div style={{ fontWeight: 600, marginTop: 4 }}>
                  {a.href ? <Link href={a.href}>{a.text} →</Link> : a.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card ok" style={{ marginBottom: 8 }}>
          <strong>All clear.</strong>{' '}
          <span className="muted">No open reports, failed uploads or stale backups.</span>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 32 }}>
        <h2 style={{ margin: 0 }}>Pilot</h2>
        <Segmented<'7' | '30'>
          value={days}
          options={[
            { key: '7', label: '7 days' },
            { key: '30', label: '30 days' },
          ]}
          onChange={setDays}
        />
      </div>
      <div className="grid" style={{ marginTop: 12 }}>
        <Metric label="New members" value={metrics?.new_members} />
        <Metric label="Active creators" value={metrics?.active_creators} />
        <Metric
          label="Locations published"
          value={metrics?.published}
          hint={
            metrics
              ? `${metrics.imported} of ${metrics.records_created} created were imports`
              : undefined
          }
        />
        <Metric
          label="Upload success"
          value={metrics ? pct(metrics.upload_success_rate) : undefined}
          hint={
            metrics
              ? `${metrics.media_failed} failed · ${metrics.media_rejected} rejected`
              : undefined
          }
        />
        <Metric
          label="Median time to publish"
          value={metrics ? dur(metrics.median_publish_seconds) : undefined}
        />
        <Metric
          label="Reports"
          value={metrics?.reports_opened}
          hint={
            metrics?.median_report_hours != null
              ? `median ${metrics.median_report_hours} h to resolve`
              : undefined
          }
        />
        <Metric
          label="Privacy requests"
          value={metrics ? metrics.exports + metrics.deletions_requested : undefined}
          hint={
            metrics
              ? `${metrics.exports} exports · ${metrics.deletions_requested} deletions`
              : undefined
          }
        />
      </div>

      <h2>Library</h2>
      <div className="grid">
        <Metric label="Published locations" value={data.published} href="/locations" />
        <Metric label="Processing" value={data.in_progress} />
        <Metric label="Hidden" value={data.hidden} />
        <Metric label="Rejected images" value={data.rejected_media} />
        <Metric label="Members" value={data.users} href="/users" />
        <Metric label="Scheduled deletions" value={data.scheduled_deletions} />
      </div>

      <h2>Backups</h2>
      <div className="grid">
        <div className="card">
          <div className="label">Database (nightly, on the NAS)</div>
          <div className="row" style={{ marginTop: 10 }}>
            <StatusBadge value={stale(data.last_backup) ? 'failed' : 'ready'} />
            <span className="mono">{data.last_backup ? fmtDate(data.last_backup) : 'never'}</span>
          </div>
        </div>
        <div className="card">
          <div className="label">Off-site (Backblaze B2 EU)</div>
          <div className="row" style={{ marginTop: 10 }}>
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
  );
}

function Metric(props: {
  label: string;
  value: number | string | undefined;
  hint?: string;
  href?: string;
}) {
  const body = (
    <div className="card metric" style={{ height: '100%' }}>
      <div className="label">{props.label}</div>
      <div className="value">{props.value ?? '·'}</div>
      {props.hint && <div className="hint">{props.hint}</div>}
    </div>
  );
  return props.href ? (
    <Link href={props.href} style={{ textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    body
  );
}
