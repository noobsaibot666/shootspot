'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ApiError, api, auth } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Summary', icon: 'summary' },
  { href: '/locations', label: 'Locations', icon: 'locations' },
  { href: '/reports', label: 'Reports', icon: 'reports', count: 'open_reports' },
  { href: '/uploads', label: 'Uploads', icon: 'uploads', count: 'failed_media' },
  { href: '/users', label: 'Users', icon: 'users' },
  { href: '/tags', label: 'Tags', icon: 'tags' },
  { href: '/audit', label: 'Audit log', icon: 'audit' },
] as const;

type Counts = { open_reports: number; failed_media: number };

/**
 * Role-gated shell. The real gate is server-side (every /admin/v1 route checks owner role + MFA
 * session); this only routes the browser to sign-in or MFA when the API says so. The rail shows
 * what needs attention (open reports, failed uploads) as counts.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    api<{ enrolled: boolean; sessionVerified: boolean }>('/admin/v1/mfa')
      .then(async (s) => {
        if (!s.sessionVerified) return router.replace('/mfa');
        const session = await auth.session();
        setEmail(session?.user.email ?? null);
      })
      .catch((err) => {
        router.replace(err instanceof ApiError && err.status === 401 ? '/sign-in' : '/mfa');
      });
  }, [router]);

  // Refresh attention counts on every page change.
  useEffect(() => {
    if (!email) return;
    api<Counts>('/admin/v1/summary').then(setCounts, () => {});
  }, [email, pathname]);

  if (!email) return <main className="center muted">Checking access…</main>;
  return (
    <div className="shell">
      <nav className="rail" aria-label="Admin">
        <div className="brand">
          <span className="dot" aria-hidden="true" />
          ShootSpot Admin
        </div>
        {NAV.map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
          const count = 'count' in n && counts ? counts[n.count] : 0;
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}>
              <Icon name={n.icon} />
              {n.label}
              {count > 0 && (
                <span className="count" aria-label={`${count} need attention`}>
                  {count}
                </span>
              )}
            </Link>
          );
        })}
        <div className="who">
          <div className="label">Owner</div>
          <div style={{ wordBreak: 'break-all' }}>{email}</div>
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              await auth.signOut();
              router.replace('/sign-in');
            }}
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
