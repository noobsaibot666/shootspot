'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, auth } from '@/lib/api';

type Step = 'password' | 'email' | 'code' | 'set-password';

/**
 * Admin sign-in is email + password, then the authenticator (/mfa). An email code only lets an
 * administrator set or reset the password; it never opens the console by itself.
 */
export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const address = email.trim().toLowerCase();

  function fail(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 429)
      setError('Too many attempts. Wait a minute.');
    else if (err instanceof ApiError && err.status === 403)
      setError('This account is not an administrator.');
    else setError(fallback);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'password') {
        try {
          await auth.passwordSignIn(address, password);
        } catch (err) {
          return fail(err, 'Email or password is wrong.');
        }
        router.replace('/mfa');
      } else if (step === 'email') {
        await auth.sendCode(address);
        setStep('code');
      } else if (step === 'code') {
        try {
          await auth.signIn(address, code.trim());
        } catch (err) {
          return fail(err, 'That code did not work. Check it and try again.');
        }
        setPassword('');
        setStep('set-password');
      } else {
        if (password.length < 10) return setError('Use at least 10 characters.');
        if (password !== repeat) return setError('The two passwords are different.');
        try {
          await auth.setPassword(password);
        } catch (err) {
          return fail(err, 'Could not set the password. Try again.');
        }
        // The code session can't open the console: sign in again with the new password.
        await auth.signOut().catch(() => {});
        await auth.passwordSignIn(address, password);
        router.replace('/mfa');
      }
    } catch (err) {
      fail(err, 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const title = {
    password: 'Sign in',
    email: 'Set or reset your password',
    code: 'Check your email',
    'set-password': 'Choose a password',
  }[step];

  return (
    <main className="center">
      <form className="auth-card narrow" onSubmit={submit}>
        <p className="label">ShootSpot Admin</p>
        <h1 style={{ marginBottom: 20 }}>{title}</h1>
        {(step === 'password' || step === 'email') && (
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {step === 'password' && (
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {step === 'email' && (
          <p className="muted">
            We email you a code. After it, you choose a new password; your authenticator stays the
            same.
          </p>
        )}
        {step === 'code' && (
          <label>
            6-digit code sent to {address}
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
        {step === 'set-password' && (
          <>
            <label>
              New password (at least 10 characters)
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Repeat it
              <input
                type="password"
                autoComplete="new-password"
                required
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button type="submit" disabled={busy}>
            {
              { password: 'Sign in', email: 'Send code', code: 'Continue', 'set-password': 'Save' }[
                step
              ]
            }
          </button>
          {step === 'password' ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setError(null);
                setStep('email');
              }}
            >
              No password yet, or forgot it?
            </button>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setError(null);
                setStep('password');
              }}
            >
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
