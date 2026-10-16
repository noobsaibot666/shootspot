import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { ApiError, api } from '../lib/api';
import { useSession } from '../lib/session';
import { useTheme, space } from '../theme/tokens';
import { Body, Button, Card, ErrorNote, Field, Screen, Title } from '../ui';

type Legal = { terms: string; privacy: string; image_license: string };

/**
 * Onboarding (plan journey 1): anonymity explainer, age gate (D-02, 16+), name, and versioned
 * acceptance of terms, privacy and the image licence (D-10). Permissions are NOT asked here;
 * camera and location are requested in context when first needed.
 */
export default function Onboarding() {
  const t = useTheme();
  const { refresh } = useSession();
  const [legal, setLegal] = useState<Legal | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState(false);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Legal>('/v1/legal').then(setLegal, () =>
      setError('Could not load the terms. Check your connection.'),
    );
  }, []);

  async function finish() {
    if (!legal) return;
    setBusy(true);
    setError(null);
    try {
      await api('/v1/me/onboarding', {
        method: 'POST',
        body: {
          ageConfirmed16: true,
          accept: {
            terms: legal.terms,
            privacy: legal.privacy,
            image_license: legal.image_license,
          },
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      });
      await refresh();
      router.replace('/feed');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'legal_version_outdated'
          ? 'The terms were just updated. Please review them again.'
          : 'Something went wrong. Try again.',
      );
      if (err instanceof ApiError && err.code === 'legal_version_outdated')
        api<Legal>('/v1/legal').then(setLegal);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <Title sub="Before you start, three things.">Welcome to ShootSpot</Title>

      <Card>
        <Row icon="eye-off-outline" title="Your locations are anonymous">
          Nobody can see who took a photo or where you go, unless you choose to show your name on a
          location.
        </Row>
        <Row icon="images-outline" title="Photos you publish">
          Other members can view them in the app. They can't download or reuse them.
        </Row>
        <Row icon="location-outline" title="Location is optional">
          We ask for your location only when you capture or browse nearby. You can always place a
          pin by hand.
        </Row>
      </Card>

      <Field
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoComplete="given-name"
        textContentType="givenName"
      />
      <Field
        label="Last name (optional)"
        value={lastName}
        onChangeText={setLastName}
        autoComplete="family-name"
        textContentType="familyName"
      />

      <Toggle value={age} onChange={setAge} label="I am 16 or older" />
      <Toggle
        value={accept}
        onChange={setAccept}
        label={`I accept the Terms, Privacy notice and Image licence${legal ? ` (${legal.terms})` : ''}`}
      />
      <Body muted>Draft wording: the final legal texts follow review before public launch.</Body>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        label="Continue"
        busy={busy}
        disabled={!legal || !age || !accept || !firstName.trim()}
        onPress={() => void finish()}
      />
      {!age ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>
          ShootSpot is for people aged 16 and over.
        </Text>
      ) : null}
    </Screen>
  );

  function Row(props: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Ionicons name={props.icon} size={22} color={t.ink} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>{props.title}</Text>
          <Body muted>{props.children}</Body>
        </View>
      </View>
    );
  }
}

function Toggle(props: { value: boolean; onChange(v: boolean): void; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: props.value }}
      onPress={() => props.onChange(!props.value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 }}
    >
      <Switch value={props.value} onValueChange={props.onChange} />
      <Text style={{ color: t.ink, fontSize: 15, flex: 1 }}>{props.label}</Text>
    </Pressable>
  );
}
