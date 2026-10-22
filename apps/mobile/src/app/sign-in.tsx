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
import { ApiError, api, auth } from '../lib/api';
import { links, openLink } from '../lib/links';
import { useSession } from '../lib/session';
import { radius, space, type, useTheme } from '../theme/tokens';
import { Button, ErrorNote, Field } from '../ui';

const RESEND_SECONDS = 30;
const CODE_LENGTH = 6;
const MIN_PASSWORD = 10;

type Mode = 'create' | 'sign-in';
type Step = 'account' | 'code' | 'new-password';

/**
 * Entry (D-43): email and password, so nobody waits for an email. Create an account or sign in on
 * one screen. "Forgot password?" sends a 6-digit code (it proves the address), then asks for a
 * new password; older code-only accounts use the same path. Brand and fields in the middle, the
 * agreement (D-41) and actions at the bottom.
 */
export default function SignIn() {
  const t = useTheme();
  const { refresh } = useSession();
  const [mode, setMode] = useState<Mode>('create');
  const [step, setStep] = useState<Step>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  // App Review 1.2: the terms (zero tolerance for objectionable content and abusive members) are
  // agreed to before anyone signs up or signs in (D-41).
  const [agreed, setAgreed] = useState(false);

  const address = email.trim().toLowerCase();
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address);
  const longEnough = password.length >= MIN_PASSWORD;
  const ready = valid && agreed && (mode === 'create' ? longEnough : password.length > 0);

  // Countdown before "Send a new code" is available again (the server also rate-limits).
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  function common(err: unknown) {
    const c = err instanceof ApiError ? err.code : '';
    if (c === 'offline') return 'No connection. Try again when you are online.';
    if (c === 'rate_limited') return 'Too many attempts. Wait a minute and try again.';
    return null;
  }

  async function run(action: () => Promise<void>, fail: (err: unknown) => string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(common(err) ?? fail(err));
    } finally {
      setBusy(false);
    }
  }

  async function enter() {
    await refresh();
    router.replace('/');
  }

  const submit = () =>
    run(
      async () => {
        if (mode === 'create') await auth.signUp(address, password);
        else await auth.signInWithPassword(address, password);
        await enter();
      },
      (err) =>
        mode === 'create'
          ? err instanceof ApiError && err.code === 'account_exists'
            ? 'This email already has an account. Sign in instead.'
            : 'Could not create the account. Try again.'
          : 'Email or password is wrong. No password yet? Tap “Forgot password?”.',
    );

  const sendCode = () =>
    run(
      async () => {
        await auth.sendCode(address);
        setCode('');
        setStep('code');
        setWait(RESEND_SECONDS);
      },
      () => 'Could not send the code. Try again.',
    );

  async function verify(value: string) {
    if (busy) return;
    await run(
      async () => {
        await auth.verifyCode(address, value);
        setPassword('');
        setStep('new-password');
      },
      () => {
        setCode('');
        return 'That code did not work. Check it, or send a new one.';
      },
    );
  }

  // Right after a code sign-in, so the server accepts it without the old password.
  const savePassword = () =>
    run(
      async () => {
        await api('/v1/me/password', { method: 'PUT', body: { newPassword: password } });
        await enter();
      },
      () => 'Could not save the password. Try again.',
    );

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  const back = () => {
    setError(null);
    setCode('');
    setPassword('');
    setStep('account');
  };

  const emailField = (
    <Field
      label="Email"
      value={email}
      onChangeText={setEmail}
      placeholder="you@example.com"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      keyboardType="email-address"
      textContentType={mode === 'create' ? 'emailAddress' : 'username'}
      returnKeyType="next"
    />
  );

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
            {/* Brand and fields in the middle; the agreement and actions at the bottom. */}
            <View style={{ flex: 1, justifyContent: 'center', gap: space.xxl * 1.5 }}>
              <Brand compact={step !== 'account'} />

              {step === 'account' ? (
                <View style={{ gap: space.xl }}>
                  <Tabs value={mode} onChange={switchMode} />
                  {emailField}
                  <Field
                    label="Password"
                    hint={mode === 'create' ? `At least ${MIN_PASSWORD} characters.` : undefined}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                    textContentType={mode === 'create' ? 'newPassword' : 'password'}
                    returnKeyType="go"
                    onSubmitEditing={() => ready && void submit()}
                  />
                </View>
              ) : step === 'code' ? (
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
              ) : (
                <View style={{ gap: space.xl }}>
                  <Heading title="Choose a new password" sub={address} />
                  <Field
                    label="New password"
                    hint={`At least ${MIN_PASSWORD} characters.`}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    onSubmitEditing={() => longEnough && void savePassword()}
                  />
                </View>
              )}
            </View>

            <View style={{ gap: space.lg, paddingTop: space.xxl }}>
              {step === 'account' ? <Agreement value={agreed} onChange={setAgreed} /> : null}
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              {step === 'account' ? (
                <>
                  <Button
                    label={mode === 'create' ? 'Create account' : 'Sign in'}
                    busy={busy}
                    disabled={!ready}
                    onPress={() => void submit()}
                  />
                  {mode === 'sign-in' ? (
                    <Button
                      label="Forgot password?"
                      kind="ghost"
                      size="small"
                      disabled={!valid || busy}
                      onPress={() => void sendCode()}
                    />
                  ) : null}
                </>
              ) : step === 'code' ? (
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
                  <Button label="Back" kind="ghost" size="small" onPress={back} />
                </>
              ) : (
                <Button
                  label="Save and continue"
                  busy={busy}
                  disabled={!longEnough}
                  onPress={() => void savePassword()}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Create account | Sign in, as a two-part switch at the top of the form. */
function Tabs({ value, onChange }: { value: Mode; onChange(m: Mode): void }) {
  const t = useTheme();
  const tab = (m: Mode, label: string) => {
    const on = value === m;
    return (
      <Pressable
        key={m}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(m)}
        style={{
          flex: 1,
          paddingVertical: space.md,
          borderRadius: radius.control,
          alignItems: 'center',
          backgroundColor: on ? t.ink : 'transparent',
        }}
      >
        <Text style={[type.bodyStrong, { color: on ? t.onInk : t.muted }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: space.xs,
        borderRadius: radius.control + space.xs,
        backgroundColor: t.surface,
      }}
    >
      {tab('create', 'Create account')}
      {tab('sign-in', 'Sign in')}
    </View>
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
