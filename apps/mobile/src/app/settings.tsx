import { normalizeWebUrl } from '@shootspot/shared';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../lib/api';
import { listImports, pickPhotos } from '../lib/imports';
import { links, openLink } from '../lib/links';
import { useSession } from '../lib/session';
import { space, type, useTheme } from '../theme/tokens';
import { Avatar, Body, Button, Card, ErrorNote, Field, ListRow } from '../ui';

interface ExportItem {
  id: string;
  status: 'queued' | 'ready' | 'failed' | 'expired';
  createdAt: string;
  downloadUrl: string | null;
}

/**
 * The menu (Savee-style list): profile fields (name, surname, short bio, portfolio, one social
 * handle), import, and account lifecycle (plan journey 7): data export and deletion with a
 * grace period (D-12), sign out.
 */
export default function Settings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, refresh, signOut } = useSession();
  const me = state.status === 'signed-in' ? state.me : null;
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState({
    firstName: me?.profile.firstName ?? '',
    lastName: me?.profile.lastName ?? '',
    displayName: me?.profile.displayName ?? '',
    bio: me?.profile.bio ?? '',
    portfolioUrl: me?.profile.portfolioUrl ?? '',
    socialHandle: me?.profile.socialHandle ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exports, setExports] = useState<ExportItem[]>([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const name = me
    ? me.profile.displayName || `${me.profile.firstName} ${me.profile.lastName}`.trim()
    : '';

  const loadExports = () =>
    api<{ items: ExportItem[] }>('/v1/me/exports').then(
      (r) => setExports(r.items),
      () => {},
    );
  useEffect(() => {
    void loadExports();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api('/v1/me/profile', {
        method: 'PATCH',
        body: {
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
          displayName: p.displayName.trim() || null,
          bio: p.bio.trim() || null,
          portfolioUrl: normalizeWebUrl(p.portfolioUrl),
          socialHandle: p.socialHandle.trim() || null,
        },
      });
      await refresh();
      setEditing(false);
    } catch {
      setError('Could not save. Check the portfolio link is a web address, like example.com');
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (pw.next.length < 10) return setPwError('Use at least 10 characters.');
    if (pw.next !== pw.repeat) return setPwError('The two passwords are different.');
    setPwBusy(true);
    setPwError(null);
    try {
      await api('/v1/me/password', {
        method: 'PUT',
        body: { newPassword: pw.next, currentPassword: pw.current || undefined },
      });
      await refresh();
      setPw({ current: '', next: '', repeat: '' });
      setPwOpen(false);
      Alert.alert('Password saved', 'You can now sign in with your email and this password.');
    } catch (err) {
      const c = err instanceof ApiError ? err.code : '';
      setPwError(
        c === 'wrong_password'
          ? 'The current password is wrong.'
          : c === 'recent_sign_in_required'
            ? 'Enter your current password. Forgot it? Sign out, sign in with an email code, and set a new one right after.'
            : 'Could not save the password. Try again.',
      );
    } finally {
      setPwBusy(false);
    }
  }

  async function requestExport() {
    try {
      await api('/v1/me/exports', { method: 'POST' });
      Alert.alert(
        'Export requested',
        'Your data is being prepared. Come back here in a minute to download it.',
      );
      void loadExports();
    } catch {
      Alert.alert('Already requested', 'You can request one export per day.');
    }
  }

  async function importPhotos() {
    const pending = (await listImports()).some((i) => i.state === 'todo');
    if ((await pickPhotos().catch(() => 0)) > 0 || pending) router.push('/capture/import');
  }

  const deletion = me?.deletionScheduledFor;
  const ready = exports.find((e) => e.status === 'ready' && e.downloadUrl);
  const preparing = exports.some((e) => e.status === 'queued');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: t.canvas }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingVertical: space.lg,
          paddingBottom: insets.bottom + space.xxl,
          gap: space.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingHorizontal: space.lg,
            paddingBottom: space.md,
          }}
        >
          <Avatar name={name} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={[type.title, { color: t.ink }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[type.caption, { color: t.muted }]} numberOfLines={1}>
              {me?.user.email}
            </Text>
          </View>
        </View>

        <ListRow icon="person" label="Edit profile" onPress={() => setEditing((e) => !e)} />
        {editing ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.lg }}>
            <Field
              label="First name"
              value={p.firstName}
              onChangeText={(v) => setP({ ...p, firstName: v })}
              maxLength={60}
            />
            <Field
              label="Last name"
              value={p.lastName}
              onChangeText={(v) => setP({ ...p, lastName: v })}
              maxLength={60}
            />
            <Field
              label="Display name (optional)"
              hint="Shown instead of your name on locations where you chose to show it."
              value={p.displayName}
              onChangeText={(v) => setP({ ...p, displayName: v })}
              maxLength={60}
            />
            <Field
              label="Short bio (optional)"
              value={p.bio}
              onChangeText={(v) => setP({ ...p, bio: v })}
              maxLength={300}
              multiline
            />
            <Field
              label="Portfolio link (optional)"
              value={p.portfolioUrl}
              onChangeText={(v) => setP({ ...p, portfolioUrl: v })}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="example.com"
            />
            <Field
              label="Social handle (optional)"
              value={p.socialHandle}
              onChangeText={(v) => setP({ ...p, socialHandle: v })}
              autoCapitalize="none"
              placeholder="@yourname"
              maxLength={60}
            />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button label="Save profile" busy={saving} onPress={() => void save()} />
          </View>
        ) : null}

        <ListRow
          icon="lock"
          label="Password"
          value={me?.hasPassword ? 'Set' : 'Not set'}
          onPress={() => setPwOpen((o) => !o)}
        />
        {pwOpen ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: space.lg }}>
            <Body muted>
              Optional. With a password you can sign in without waiting for an email code. Codes
              keep working.
            </Body>
            {me?.hasPassword ? (
              <Field
                label="Current password"
                hint="Not needed if you signed in with an email code in the last 15 minutes."
                value={pw.current}
                onChangeText={(v) => setPw({ ...pw, current: v })}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
              />
            ) : null}
            <Field
              label="New password (at least 10 characters)"
              value={pw.next}
              onChangeText={(v) => setPw({ ...pw, next: v })}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <Field
              label="Repeat it"
              value={pw.repeat}
              onChangeText={(v) => setPw({ ...pw, repeat: v })}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
            />
            {pwError ? <ErrorNote>{pwError}</ErrorNote> : null}
            <Button label="Save password" busy={pwBusy} onPress={() => void savePassword()} />
          </View>
        ) : null}

        <ListRow icon="gallery" label="Import photos" onPress={() => void importPhotos()} />
        <ListRow
          icon="download"
          label="Request my data"
          value={ready ? 'Ready' : preparing ? 'Preparing…' : undefined}
          onPress={() => (ready ? void Linking.openURL(ready.downloadUrl!) : void requestExport())}
        />

        <View style={{ height: space.lg }} />
        <ListRow icon="globe" label="Help & support" onPress={() => openLink(links.support)} />
        <ListRow icon="hidden" label="Privacy notice" onPress={() => openLink(links.privacy)} />
        <ListRow icon="flag" label="Terms of use" onPress={() => openLink(links.terms)} />
        <ListRow
          icon="gallery"
          label="Image licence"
          onPress={() => openLink(links.imageLicence)}
        />

        <View style={{ height: space.lg }} />
        {deletion ? (
          <Card style={{ marginHorizontal: space.lg }}>
            <Body>Your account will be deleted on {new Date(deletion).toLocaleDateString()}.</Body>
            <Button
              label="Keep my account"
              kind="secondary"
              size="small"
              onPress={async () => {
                await api('/v1/me/deletion', { method: 'DELETE' }).catch(() => {});
                await refresh();
              }}
            />
          </Card>
        ) : (
          <ListRow
            icon="trash"
            label="Delete account"
            danger
            onPress={() =>
              Alert.alert(
                'Delete your account?',
                'After 7 days your profile, projects and sign-in are deleted. Published locations stay, anonymous. You can cancel before then.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      await api('/v1/me/deletion', { method: 'POST' }).catch(() => {});
                      await refresh();
                    },
                  },
                ],
              )
            }
          />
        )}
        <ListRow
          icon="signOut"
          label="Sign out"
          trailing={<View />}
          onPress={async () => {
            await signOut();
            router.replace('/sign-in');
          }}
        />

        <Text
          style={[
            type.caption,
            { color: t.muted, paddingHorizontal: space.lg, paddingTop: space.xl },
          ]}
        >
          ShootSpot {Constants.expoConfig?.version ?? ''}
          {'\n'}Locations are anonymous unless you choose to show your name.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
