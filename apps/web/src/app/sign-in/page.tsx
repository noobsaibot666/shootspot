'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, auth } from '@/lib/api';

/**
 * Members sign in with the email and password they use in the app (D-43, D-44). Accounts,
 * email codes and password resets stay in the app.
 */
export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email.trim().toLowerCase(), password);
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429)
        setError('Too many attempts. Wait a minute.');
      else if (err instanceof ApiError && err.status === 0)
        setError('Can’t reach ShootSpot. Check your connection.');
      else setError('Email or password is wrong.');
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <form onSubmit={submit}>
        <div className="brand">
          <i aria-hidden /> ShootSpot
        </div>
        <h1>Sign in</h1>
        <p>Use the email and password from the ShootSpot app.</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <div className="error" role="alert">
            {error}
          </div>
        ) : null}
        <button className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="small">
          New here, or signed in with an email code until now? Create an account or set a password
          in the app under Settings.
        </p>
      </form>
    </main>
  );
}
