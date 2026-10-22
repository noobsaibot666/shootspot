import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
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
 * Entry (ADR 0005, D-37): email → 6-digit code, which creates the account for a new email and
 * signs in an existing one; members who set a password in Settings can use it instead. Brand and
 * question in the middle, the agreement (D-41, required on both paths) and actions at the bottom.
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
  // App Review 1.2: the terms (zero tolerance for objectionable content and abusive members) are
  // agreed to before anyone signs up or signs in (D-41).
  const [agreed, setAgreed] = useState(false);

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

  const back = (to: 'email') => {
    setError(null);
    setPassword('');
    setCode('');
    setStep(to);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.canvas }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, padding: space.xl }}
        >
          <View style={{ flex: 1, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            {/* Brand and the question in the middle; the agreement and actions at the bottom. */}
            <View style={{ flex: 1, justifyContent: 'center', gap: space.xxl * 1.5 }}>
              <Brand compact={step !== 'email'} />

              {step === 'email' ? (
                <View style={{ gap: space.xl }}>
                  <Heading
                    title="Sign in or create an account"
                    sub="We'll email you a 6-digit code."
                  />
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
                    onSubmitEditing={() => valid && agreed && void sendCode()}
                  />
                </View>
              ) : step === 'password' ? (
                <View style={{ gap: space.xl }}>
                  <Heading title="Sign in with your password" />
                  <Field
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="username"
                  />
                  <Field
                    label="Password"
                    hint="No password yet? Use an email code, then set one in Settings."
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={() => valid && password && agreed && void passwordSignIn()}
                  />
                </View>
              ) : (
                <View style={{ gap: space.xl }}>
                  <Heading title="Check your email" sub={`Enter the code we sent to ${address}.`} />
                  <CodeInput
                    value={code}
                    onChange={(v) => {
                      setCode(v);
                      setError(null);
                      if (v.length === CODE_LENGTH) void verify(v);
                    }}
                    disabled={busy}
                  />
                  <Text style={[type.caption, { color: t.muted, textAlign: 'center' }]}>
                    No email after a minute? Check your spam folder.
                  </Text>
                </View>
              )}
            </View>

            <View style={{ gap: space.lg, paddingTop: space.xxl }}>
              {step !== 'code' ? <Agreement value={agreed} onChange={setAgreed} /> : null}
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              {step === 'email' ? (
                <>
                  <Button
                    label="Continue"
                    busy={busy}
                    disabled={!valid || !agreed}
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
                </>
              ) : step === 'password' ? (
                <>
                  <Button
                    label="Sign in"
                    busy={busy}
                    disabled={!valid || !password || !agreed}
                    onPress={() => void passwordSignIn()}
                  />
                  <Button
                    label="Use an email code instead"
                    kind="ghost"
                    size="small"
                    onPress={() => back('email')}
                  />
                </>
              ) : (
                <>
                  <Button
                    label="Continue"
                    busy={busy}
                    disabled={code.length !== CODE_LENGTH}
                    onPress={() => void verify(code)}
                  />
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
                    onPress={() => back('email')}
                  />
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={[type.title, { color: t.ink, textAlign: 'center' }]}>
        {title}
      </Text>
      {sub ? <Text style={[type.body, { color: t.muted, textAlign: 'center' }]}>{sub}</Text> : null}
    </View>
  );
}

/**
 * The terms agreement, required before signing up or in. The rules that matter most to App
 * Review are spelled out, not only linked.
 */
function Agreement(props: { value: boolean; onChange(v: boolean): void }) {
  const t = useTheme();
  const link = (label: string, url: string) => (
    <Text
      accessibilityRole="link"
      onPress={() => openLink(url)}
      style={{ color: t.ink, textDecorationLine: 'underline' }}
    >
      {label}
    </Text>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Switch
        value={props.value}
        onValueChange={props.onChange}
        accessibilityLabel="I'm 18 or older and agree to the Terms of use and the Privacy notice"
      />
      <Text style={[type.caption, { color: t.muted, flex: 1 }]}>
        I'm 18+ and agree to the {link('Terms', links.terms)} and{' '}
        {link('Privacy notice', links.privacy)}. Zero tolerance for objectionable content or abusive
        members.
      </Text>
    </View>
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
