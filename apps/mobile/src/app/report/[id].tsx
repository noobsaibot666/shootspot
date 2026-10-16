import { Icon, type IconName } from '../../ui/icon';
import { REPORT_REASONS } from '@shootspot/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError, api } from '../../lib/api';
import { space, useTheme } from '../../theme/tokens';
import { Body, Button, ErrorNote, Field, Screen, Title } from '../../ui';

const REASON_LABEL: Record<(typeof REPORT_REASONS)[number], string> = {
  private_property: 'Private property or someone’s home',
  unsafe_access: 'Unsafe or illegal access',
  wrong_location: 'Wrong location',
  inappropriate_image: 'Inappropriate image',
  copyright: 'Copyright: this is my photo',
  person_identifiable: 'A person can be identified',
  spam_duplicate: 'Spam or duplicate',
  other: 'Something else',
};

/** Report a location (docs/phase-0/03 §7). Reviewed by moderators; the reporter stays private. */
export default function Report() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/records/${id}/reports`, {
        method: 'POST',
        body: { reason, note: note.trim() || undefined },
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'already_reported'
          ? 'You already reported this location. Thanks, it is being reviewed.'
          : err instanceof ApiError && err.code === 'daily_limit'
            ? 'You have sent many reports today. Try again tomorrow.'
            : 'Could not send the report. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl }}>
          <Icon name="done" size={44} color={t.signalGreen} />
          <Text style={{ color: t.ink, fontSize: 18, fontWeight: '600' }}>Thanks, report sent</Text>
          <Body muted>A moderator will review it. Your report is private.</Body>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Title sub="What's wrong with this location?">Report</Title>
      <View style={{ gap: 2 }}>
        {REPORT_REASONS.map((r) => (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === r }}
            onPress={() => setReason(r)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 }}
          >
            <Icon
              name={reason === r ? 'done.fill' : 'circle'}
              size={22}
              color={reason === r ? t.ink : t.muted}
            />
            <Text style={{ color: t.ink, fontSize: 16, flex: 1 }}>{REASON_LABEL[r]}</Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Details (optional)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button label="Send report" busy={busy} disabled={!reason} onPress={() => void send()} />
    </Screen>
  );
}
