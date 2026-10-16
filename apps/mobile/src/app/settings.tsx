import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { space, useTheme } from '../theme/tokens';
import { Body, Button, Card, ErrorNote, Field, Label, Screen } from '../ui';

interface ExportItem {
  id: string;
  status: 'queued' | 'ready' | 'failed' | 'expired';
  createdAt: string;
  downloadUrl: string | null;
}

/**
 * Profile fields (D: name, surname, short bio, portfolio, one social handle) and account
 * lifecycle (plan journey 7): data export and account deletion with a grace period (D-12).
 */
export default function Settings() {
  const t = useTheme();
  const { state, refresh, signOut } = useSession();
  const me = state.status === 'signed-in' ? state.me : null;
  const [p, setP] = useState({
    firstName: me?.profile.firstName ?? '',
    lastName: me?.profile.lastName ?? '',
    displayName: me?.profile.displayName ?? '',
    bio: me?.profile.bio ?? '',
    portfolioUrl: me?.profile.portfolioUrl ?? '',
    socialHandle: me?.profile.socialHandle ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exports, setExports] = useState<ExportItem[]>([]);

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
    setSaved(false);
    try {
      await api('/v1/me/profile', {
        method: 'PATCH',
        body: {
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
          displayName: p.displayName.trim() || null,
          bio: p.bio.trim() || null,
          portfolioUrl: p.portfolioUrl.trim() || null,
          socialHandle: p.socialHandle.trim() || null,
        },
      });
      await refresh();
      setSaved(true);
    } catch {
      setError('Could not save. Check the portfolio link starts with https://');
    } finally {
      setSaving(false);
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

  const deletion = me?.deletionScheduledFor;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll>
        <Label>Profile</Label>
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
          placeholder="https://"
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
        <Button
          label={saved ? 'Saved' : 'Save profile'}
          busy={saving}
          onPress={() => void save()}
        />

        <Card>
          <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>Your data</Text>
          <Body muted>Download a copy of your account, profile, locations and projects.</Body>
          {exports.map((e) => (
            <View key={e.id} style={{ gap: 4 }}>
              <Body muted>
                {new Date(e.createdAt).toLocaleString()}:{' '}
                {e.status === 'ready'
                  ? 'ready'
                  : e.status === 'queued'
                    ? 'being prepared…'
                    : e.status}
              </Body>
              {e.downloadUrl ? (
                <Button
                  label="Download"
                  kind="secondary"
                  onPress={() => void Linking.openURL(e.downloadUrl!)}
                />
              ) : null}
            </View>
          ))}
          <Button label="Request my data" kind="secondary" onPress={() => void requestExport()} />
        </Card>

        <Card>
          <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>Delete account</Text>
          {deletion ? (
            <>
              <Body>
                Your account will be deleted on {new Date(deletion).toLocaleDateString()}.
              </Body>
              <Button
                label="Keep my account"
                kind="secondary"
                onPress={async () => {
                  await api('/v1/me/deletion', { method: 'DELETE' }).catch(() => {});
                  await refresh();
                }}
              />
            </>
          ) : (
            <>
              <Body muted>
                Your personal data is deleted after 7 days. Locations you published stay in
                ShootSpot without your name.
              </Body>
              <Button
                label="Delete my account"
                kind="danger"
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
            </>
          )}
        </Card>

        <Button
          label="Sign out"
          kind="secondary"
          onPress={async () => {
            await signOut();
            router.replace('/sign-in');
          }}
        />
        <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center', marginBottom: space.lg }}>
          {me?.user.email}
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}
