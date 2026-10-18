import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, auth } from '../lib/api';
import { links, openLink } from '../lib/links';
import { useSession } from '../lib/session';
import { radius, space, type, useTheme } from '../theme/tokens';
import { Button, ErrorNote, Field } from '../ui';

const RESEND_SECONDS = 30;
const CODE_LENGTH = 6;

/**
 * Passwordless entry (ADR 0005): email → 6-digit code. The same flow creates the account for a
 * new email and signs in an existing one, so the copy says both. Centered and branded: this is the
 * first screen anyone sees.
 */
export default function SignIn() {
  const t = useTheme();
  const { refresh } = useSession();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  const address = email.trim().toLowerCase();
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address);

  // Countdown before "Send a new code" is available again (the server also rate-limits).
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  function message(err: unknown, sending: boolean) {
    const c = err instanceof ApiError ? err.code : '';
    if (c === 'offline') return 'No connection. Try again when you are online.';
    if (c === 'rate_limited') return 'Too many attempts. Wait a minute and try again.';
    return sending
      ? 'Could not send the code. Try again.'
      : 'That code did not work. Check it, or send a new one.';
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await auth.sendCode(address);
      setCode('');
      setStep('code');
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(message(err, true));
    } finally {
      setBusy(false);
    }
  }

  async function passwordSignIn() {
    setBusy(true);
    setError(null);
    try {
      await auth.signInWithPassword(address, password);
      await refresh();
      router.replace('/');
    } catch (err) {
      const c = err instanceof ApiError ? err.code : '';
      setError(
        c === 'offline' || c === 'rate_limited'
          ? message(err, false)
          : 'Email or password is wrong. No password yet? Use an email code.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.verifyCode(address, value);
      await refresh();
      router.replace('/');
    } catch (err) {
      setError(message(err, false));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.canvas }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: space.xl,
          }}
        >
          <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: space.xxl }}>
            <Brand compact={step !== 'email'} />

            {step === 'email' ? (
              <View style={{ gap: space.lg }}>
                <View style={{ gap: space.xs }}>
                  <Text
                    accessibilityRole="header"
                    style={[type.title, { color: t.ink, textAlign: 'center' }]}
                  >
                    Create your free account
                  </Text>
                  <Text style={[type.body, { color: t.muted, textAlign: 'center' }]}>
                    We'll email you a 6-digit code, no password needed. Already a member? Use the
                    same email to sign in.
                  </Text>
                </View>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={() => valid && void sendCode()}
                />
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <Button
                  label="Continue"
                  busy={busy}
                  disabled={!valid}
                  onPress={() => void sendCode()}
                />
                <Button
                  label="Sign in with a password"
                  kind="ghost"
                  size="small"
                  onPress={() => {
                    setError(null);
                    setStep('password');
                  }}
                />
                <Text style={[type.caption, { color: t.muted, textAlign: 'center' }]}>
                  By continuing you agree to the{' '}
                  <Text
                    accessibilityRole="link"
                    onPress={() => openLink(links.terms)}
                    style={{ color: t.ink, textDecorationLine: 'underline' }}
                  >
                    Terms
                  </Text>{' '}
                  and the{' '}
                  <Text
                    accessibilityRole="link"
                    onPress={() => openLink(links.privacy)}
                    style={{ color: t.ink, textDecorationLine: 'underline' }}
                  >
                    Privacy notice
                  </Text>
                  .
                </Text>
              </View>
            ) : step === 'password' ? (
              <View style={{ gap: space.lg }}>
                <Text
                  accessibilityRole="header"
                  style={[type.title, { color: t.ink, textAlign: 'center' }]}
                >
                  Sign in with your password
                </Text>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="username"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => valid && password && void passwordSignIn()}
                />
                {error ? <ErrorNote>{error}</ErrorNote> : null}
                <Button
                  label="Sign in"
                  busy={busy}
                  disabled={!valid || !password}
                  onPress={() => void passwordSignIn()}
                />
                <Button
                  label="Use an email code instead"
                  kind="ghost"
                  size="small"
                  onPress={() => {
                    setError(null);
                    setPassword('');
                    setStep('email');
                  }}
                />
              </View>
            ) : (
              <View style={{ gap: space.lg }}>
                <View style={{ gap: space.xs }}>
                  <Text
                    accessibilityRole="header"
                    style={[type.title, { color: t.ink, textAlign: 'center' }]}
                  >
                    Check your email
                  </Text>
                  <Text style={[type.body, { color: t.muted, textAlign: 'center' }]}>
                    We sent a 6-digit code to{'\n'}
                    <Text style={{ color: t.ink, fontWeight: '600' }}>{address}</Text>
                    {'\n'}Enter it to finish creating your account or signing in.
                  </Text>
                </View>
                <CodeInput
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    setError(null);
                    if (v.length === CODE_LENGTH) void verify(v);
                  }}
                  disabled={busy}
                />
                {error ? (
                  <View style={{ alignItems: 'center' }}>
                    <ErrorNote>{error}</ErrorNote>
                  </View>
                ) : null}
                <Button
                  label="Continue"
                  busy={busy}
                  disabled={code.length !== CODE_LENGTH}
                  onPress={() => void verify(code)}
                />
                <View style={{ alignItems: 'center', gap: space.sm }}>
                  <Text style={[type.caption, { color: t.muted, textAlign: 'center' }]}>
                    No email after a minute? Check your spam folder.
                  </Text>
                  <Button
                    label={wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
                    kind="secondary"
                    size="small"
                    disabled={busy || wait > 0}
                    onPress={() => void sendCode()}
                  />
                  <Button
                    label="Use a different email"
                    kind="ghost"
                    size="small"
                    onPress={() => {
                      setStep('email');
                      setCode('');
                      setError(null);
                    }}
                  />
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** App icon, wordmark and tagline; smaller on the code step so the keyboard leaves room. */
function Brand({ compact }: { compact: boolean }) {
  const t = useTheme();
  const size = compact ? 56 : 88;
  return (
    <View style={{ alignItems: 'center', gap: space.md }}>
      <Image
        source={require('../../assets/icon.png')}
        style={{ width: size, height: size, borderRadius: size * 0.225 }}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      {compact ? null : (
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={[type.display, { color: t.ink }]}>ShootSpot</Text>
          <Text style={[type.body, { color: t.muted, textAlign: 'center' }]}>
            Location scouting for photographers and filmmakers
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Six boxes over one hidden input, so the system's code autofill (iOS one-time-code, Android SMS
 * Retriever/autofill) and paste fill all digits at once.
 */
function CodeInput(props: { value: string; onChange(v: string): void; disabled?: boolean }) {
  const t = useTheme();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable
      accessible={false}
      onPress={() => input.current?.focus()}
      style={{ flexDirection: 'row', justifyContent: 'center', gap: space.sm }}
    >
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const active = focused && i === Math.min(props.value.length, CODE_LENGTH - 1);
        return (
          <View
            key={i}
            style={{
              width: 46,
              height: 56,
              borderRadius: radius.control,
              backgroundColor: t.surface,
              borderWidth: 2,
              borderColor: active ? t.ink : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[type.title, { color: t.ink }]}>{props.value[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={props.value}
        onChangeText={(v) => props.onChange(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!props.disabled}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus
        maxLength={CODE_LENGTH}
        accessibilityLabel="6-digit code"
        caretHidden
        style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.011 }}
      />
    </Pressable>
  );
}
