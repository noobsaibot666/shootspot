import type { AdvancedInput, PublicRecord, RecordNotesUpdate } from '@shootspot/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../../lib/api';
import { haptics } from '../../lib/device';
import { space, type, useTheme } from '../../theme/tokens';
import { Body, Button, ErrorNote } from '../../ui';
import { MoreDetails, PillInput, TagPicker } from '../../ui/notes';

interface Notes {
  label: string;
  goodFor: string[];
  goodForNote: string;
  bestLight: string[];
  bestLightNote: string;
  advanced: AdvancedInput;
}

/**
 * The creator edits a published location's notes (D-38): name, Good for, Best light, their notes
 * and more details. Location, direction and photo stay as captured.
 */
export default function EditNotes() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [notes, setNotes] = useState<Notes | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PublicRecord>(`/v1/records/${id}`)
      .then((r) =>
        setNotes({
          label: r.label,
          goodFor: r.goodFor,
          goodForNote: r.goodForNote ?? '',
          bestLight: r.bestLight,
          bestLightNote: r.bestLightNote ?? '',
          advanced: r.advanced ?? {},
        }),
      )
      .catch(() => setFailed(true));
  }, [id]);

  if (!notes) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        {failed ? (
          <Body muted>This location can be edited once it is published.</Body>
        ) : (
          <ActivityIndicator color={t.muted} />
        )}
      </View>
    );
  }

  const set = (patch: Partial<Notes>) => setNotes({ ...notes, ...patch });
  const valid = notes.label.trim() && notes.goodFor.length && notes.bestLight.length;

  async function save() {
    setBusy(true);
    setError(null);
    const body: RecordNotesUpdate = {
      label: notes!.label.trim(),
      goodFor: notes!.goodFor,
      goodForNote: notes!.goodForNote.trim() || undefined,
      bestLight: notes!.bestLight,
      bestLightNote: notes!.bestLightNote.trim() || undefined,
      advanced: notes!.advanced,
    };
    try {
      await api(`/v1/me/records/${id}/notes`, { method: 'PUT', body });
      haptics.light();
      router.back();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'offline'
          ? "You're offline. Try again when you're connected."
          : 'Could not save the changes. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: space.xxl,
          gap: space.xxl + space.md,
        }}
      >
        <Section title="Name of the place">
          <PillInput
            value={notes.label}
            onChangeText={(label) => set({ label })}
            maxLength={120}
            accessibilityLabel="Name of the place"
          />
        </Section>
        <Section title="Good for" sub="Up to 8.">
          <TagPicker
            kind="good_for"
            selected={notes.goodFor}
            onChange={(goodFor) => set({ goodFor })}
            max={8}
          />
        </Section>
        <Section title="Best light">
          <TagPicker
            kind="best_light"
            selected={notes.bestLight}
            onChange={(bestLight) => set({ bestLight })}
          />
          <PillInput
            value={notes.bestLightNote}
            onChangeText={(bestLightNote) => set({ bestLightNote })}
            maxLength={200}
            placeholder="Light note (optional)"
            accessibilityLabel="Light note (optional)"
          />
        </Section>
        <Section title="More details" sub="All optional.">
          <MoreDetails
            value={notes.advanced}
            onChange={(advanced) => set({ advanced })}
            goodForNote={notes.goodForNote}
            onGoodForNote={(goodForNote) => set({ goodForNote })}
          />
        </Section>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.md,
          gap: space.sm,
          borderTopWidth: 1,
          borderColor: t.divider,
        }}
      >
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button
          label="Save changes"
          size="small"
          busy={busy}
          disabled={!valid}
          onPress={() => void save()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Section(props: { title: string; sub?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={[type.title, { color: t.ink }]}>
          {props.title}
        </Text>
        {props.sub ? <Text style={[type.caption, { color: t.muted }]}>{props.sub}</Text> : null}
      </View>
      {props.children}
    </View>
  );
}
