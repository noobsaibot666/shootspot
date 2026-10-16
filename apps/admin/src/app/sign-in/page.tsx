'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, auth } from '@/lib/api';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'email') {
        await auth.sendCode(email.trim());
        setStep('code');
      } else {
        await auth.signIn(email.trim(), code.trim());
        router.replace('/mfa');
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Too many attempts. Wait a minute.'
          : 'That did not work. Check the code and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center">
      <form className="card narrow" onSubmit={submit}>
        <p className="label">ShootSpot Admin</p>
        <h1>Sign in</h1>
        {step === 'email' ? (
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
        ) : (
          <label>
            6-digit code sent to {email}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" disabled={busy}>
            {step === 'email' ? 'Send code' : 'Continue'}
          </button>
          {step === 'code' && (
            <button type="button" className="secondary" onClick={() => setStep('email')}>
              Change email
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
