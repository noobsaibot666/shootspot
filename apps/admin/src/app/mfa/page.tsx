'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

/** Second factor for this session (ADR 0005). First visit enrols an authenticator app. */
export default function Mfa() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'enrol' | 'verify' | 'forbidden'>('loading');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ enrolled: boolean; sessionVerified: boolean }>('/admin/v1/mfa')
      .then(async (s) => {
        if (s.sessionVerified) return router.replace('/');
        if (s.enrolled) return setState('verify');
        const { otpauthUri } = await api<{ otpauthUri: string }>('/admin/v1/mfa/enroll', {
          method: 'POST',
        });
        setSecret(new URL(otpauthUri).searchParams.get('secret'));
        setQr(await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 }));
        setState('enrol');
      })
      .catch((err) => {
        // Not signed in, or signed in with an email code instead of the password.
        if (err instanceof ApiError && (err.status === 401 || err.code === 'password_required'))
          router.replace('/sign-in');
        else setState('forbidden');
      });
  }, [router]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/v1/mfa/verify', { method: 'POST', body: { code: code.trim() } });
      router.replace('/');
    } catch {
      setError('Code not accepted. Use the current code from your authenticator app.');
    }
  }

  if (state === 'loading') return <main className="center muted">Loading…</main>;
  if (state === 'forbidden') {
    return (
      <main className="center">
        <div className="auth-card narrow">
          <h1>No admin access</h1>
          <p className="muted">This account is not an administrator.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="center">
      <form className="auth-card narrow" onSubmit={verify}>
        <p className="label">Two-factor authentication</p>
        <h1 style={{ marginBottom: 20 }}>
          {state === 'enrol' ? 'Set up your authenticator' : 'Enter your code'}
        </h1>
        {state === 'enrol' && qr && (
          <>
            <p className="muted">
              Scan with an authenticator app (1Password, Authy, Google Authenticator), then enter
              the 6-digit code.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Authenticator setup QR code" width={220} height={220} />
            <p className="mono muted">Manual key: {secret}</p>
          </>
        )}
        <label>
          Code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit">Verify</button>
      </form>
    </main>
  );
}
