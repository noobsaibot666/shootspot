'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api, auth } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Summary' },
  { href: '/reports', label: 'Reports' },
  { href: '/uploads', label: 'Uploads' },
  { href: '/users', label: 'Users' },
  { href: '/audit', label: 'Audit log' },
];

/**
 * Role-gated shell. The real gate is server-side (every /admin/v1 route checks owner role + MFA
 * session); this only routes the browser to sign-in or MFA when the API says so.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

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

  if (!email) return <main className="center muted">Checking access…</main>;
  return (
    <div className="shell">
      <nav className="rail" aria-label="Admin">
        <div className="brand">ShootSpot · Admin</div>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={pathname === n.href ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
        <div className="who">
          <div className="label">Owner</div>
          <div>{email}</div>
          <button
            type="button"
            className="secondary"
            style={{ marginTop: 8 }}
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
