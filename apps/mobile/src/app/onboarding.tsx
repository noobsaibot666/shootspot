import { Icon, type IconName } from '../ui/icon';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { ApiError, api } from '../lib/api';
import { links, openLink } from '../lib/links';
import { useSession } from '../lib/session';
import { useTheme, space } from '../theme/tokens';
import { Body, Button, Card, ErrorNote, Field, Screen, Title } from '../ui';

type Legal = { terms: string; privacy: string; image_license: string };

/**
 * Onboarding (plan journey 1): anonymity explainer, age gate (D-41, 18+), name, and versioned
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
          ageConfirmed18: true,
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
      <Title sub="Before you start, four things.">Welcome to ShootSpot</Title>

      <Card>
        <Row icon="hidden" title="Your locations are anonymous">
          Nobody can see who took a photo or where you go, unless you choose to show your name on a
          location.
        </Row>
        <Row icon="gallery" title="Photos you publish">
          Other members can view them in the app. They can't download or reuse them.
        </Row>
        <Row icon="pin" title="Location is optional">
          We ask for your location only when you capture or browse nearby. You can always place a
          pin by hand.
        </Row>
        <Row icon="flag" title="Zero tolerance for abuse">
          Objectionable content and abusive members are not allowed: such content is removed and
          those accounts are closed. Report a location or block its author from the ⋯ menu.
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

      <Toggle value={age} onChange={setAge} label="I am 18 or older" />
      <Toggle
        value={accept}
        onChange={setAccept}
        label={`I accept the Terms, Privacy notice and Image licence${legal ? ` (${legal.terms})` : ''}`}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.lg }}>
        {(
          [
            ['Terms', links.terms],
            ['Privacy notice', links.privacy],
            ['Image licence', links.imageLicence],
          ] as const
        ).map(([label, url]) => (
          <Pressable key={url} accessibilityRole="link" hitSlop={8} onPress={() => openLink(url)}>
            <Text style={{ color: t.ink, fontSize: 14, textDecorationLine: 'underline' }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        label="Continue"
        busy={busy}
        disabled={!legal || !age || !accept || !firstName.trim()}
        onPress={() => void finish()}
      />
      {!age ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>
          ShootSpot is for people aged 18 and over.
        </Text>
      ) : null}
    </Screen>
  );

  function Row(props: { icon: IconName; title: string; children: React.ReactNode }) {
    return (
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Icon name={props.icon} size={22} color={t.ink} style={{ marginTop: 2 }} />
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
