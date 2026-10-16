import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { ApiError, auth } from '../lib/api';
import { useSession } from '../lib/session';
import { Body, Button, ErrorNote, Field, Screen, Title } from '../ui';

/** Passwordless: email → 6-digit code (ADR 0005). New emails get an account on first sign-in. */
export default function SignIn() {
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (step === 'email') {
        await auth.sendCode(email.trim().toLowerCase());
        setStep('code');
      } else {
        await auth.verifyCode(email.trim().toLowerCase(), code.trim());
        await refresh();
        router.replace('/');
      }
    } catch (err) {
      const c = err instanceof ApiError ? err.code : '';
      setError(
        c === 'offline'
          ? 'No connection. Try again when you are online.'
          : c === 'rate_limited'
            ? 'Too many attempts. Wait a minute and try again.'
            : step === 'code'
              ? 'That code did not work. Check it, or request a new one.'
              : 'Could not send the code. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll>
        <Title sub="Location scouting for photographers and filmmakers.">ShootSpot</Title>
        {step === 'email' ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => valid && void submit()}
            />
            <Body muted>We'll email you a 6-digit code. No password needed.</Body>
          </>
        ) : (
          <>
            <Body>Enter the code we sent to {email.trim()}.</Body>
            <Field
              label="6-digit code"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
            />
          </>
        )}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button
          label={step === 'email' ? 'Send code' : 'Sign in'}
          busy={busy}
          disabled={step === 'email' ? !valid : code.length !== 6}
          onPress={() => void submit()}
        />
        {step === 'code' ? (
          <Button
            label="Use a different email"
            kind="secondary"
            onPress={() => {
              setStep('email');
              setCode('');
            }}
          />
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
