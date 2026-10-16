import {
  draftRecordSchema,
  formatBearing,
  formatCoordinates,
  formatSun,
  lightAngle,
  sunAtCapture,
  type DraftRecord,
} from '@shootspot/shared';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, Text, View, useWindowDimensions } from 'react-native';
import { useCapture } from '../../capture/context';
import { ApiError, api } from '../../lib/api';
import { saveDraft, submitDraft } from '../../lib/drafts';
import { useVocabulary } from '../../lib/vocabulary';
import { useSession } from '../../lib/session';
import { space, useTheme } from '../../theme/tokens';
import { Body, Button, Card, ErrorNote, Label, Mono, Row, Screen } from '../../ui';

const LIGHT_LABEL = {
  backlit: 'Backlit',
  side_lit: 'Side-lit',
  front_lit: 'Front-lit',
  sun_down: 'Sun below horizon',
};

/**
 * Public preview (plan journey 4): exactly what other members will see, anonymous by default.
 * Attribution (D-07) is off unless the member turns it on and accepts the responsibility notice.
 */
export default function Publish() {
  const { label } = useVocabulary();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { state: session } = useSession();
  const { state, update } = useCapture();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { photo, pin } = state;
  if (!photo || !pin || state.bearingDeg == null || !state.capturedAt) return null;

  const sun = sunAtCapture(new Date(state.capturedAt), pin.lat, pin.lon);
  const me = session.status === 'signed-in' ? session.me : null;
  const name = me
    ? me.profile.displayName || `${me.profile.firstName} ${me.profile.lastName}`.trim()
    : '';

  function toggleAttribution(on: boolean) {
    if (!on) return update({ attributed: false });
    Alert.alert(
      'Show your name on this location?',
      'Showing your name links you to this place and the time you were here. You are responsible for this choice. We recommend keeping your locations anonymous.',
      [
        { text: 'Keep anonymous', style: 'cancel' },
        {
          text: 'Show my name',
          onPress: async () => {
            try {
              const legal = await api<{ attribution_notice: string }>('/v1/legal');
              await api('/v1/me/consents', {
                method: 'POST',
                body: { kind: 'attribution_notice', version: legal.attribution_notice },
              });
              update({ attributed: true });
            } catch {
              setError('Could not save your choice. Check your connection.');
            }
          },
        },
      ],
    );
  }

  async function publish() {
    setBusy(true);
    setError(null);
    const draft: DraftRecord = draftRecordSchema.parse({
      draftId: Crypto.randomUUID(),
      framing: photo!.framing,
      pin,
      short: {
        label: state.label.trim(),
        goodFor: state.goodFor,
        goodForNote: state.goodForNote.trim() || undefined,
        bestLight: state.bestLight,
        bestLightNote: state.bestLightNote.trim() || undefined,
        bearingDeg: state.bearingDeg,
      },
      advanced: state.advanced,
      capture: {
        capturedAt: state.capturedAt,
        altitudeM: state.altitudeM,
        focalLength35mm: null,
        headingDeg: state.headingDeg,
      },
      attributed: state.attributed,
    });
    try {
      // Saved on the phone first: nothing is lost if the network drops from here on.
      await saveDraft(draft, photo!.uri, { width: photo!.width, height: photo!.height });
      const result = await submitDraft(draft.draftId);
      // Closing the capture modal discards its state (CaptureProvider unmounts). Resetting first
      // would re-render the screens underneath with an empty capture (iOS console report #1).
      // dismissAll() would only return to the camera (first screen of the capture stack);
      // dismissTo('/profile') closes the whole capture modal (the new location appears in My locations).
      router.dismissTo('/profile');
      if (result?.recordId && result.state === 'processing')
        router.push(`/records/${result.recordId}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Saved on your phone. It will be sent automatically.'
          : 'Could not save the location. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll padded={false}>
      <Image
        source={photo.uri}
        style={{ width, height: width / (photo.width / photo.height), backgroundColor: '#000' }}
        contentFit="cover"
      />
      <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
        <Text style={{ color: t.ink, fontSize: 22, fontWeight: '700' }}>{state.label}</Text>
        <Row wrap>
          {state.goodFor.map((g) => (
            <Text key={g} style={{ color: t.ink, fontSize: 14 }}>
              {label('good_for', g)} ·
            </Text>
          ))}
        </Row>
        <View style={{ gap: 4 }}>
          <Label>Best light</Label>
          <Body>{state.bestLight.map((b) => label('best_light', b)).join(', ')}</Body>
          {state.bestLightNote ? <Body muted>{state.bestLightNote}</Body> : null}
        </View>
        <View style={{ gap: 4 }}>
          <Label>Camera points toward</Label>
          <Mono style={{ fontSize: 14 }}>
            {formatBearing(state.bearingDeg)} · {LIGHT_LABEL[lightAngle(state.bearingDeg, sun)]}
          </Mono>
          <Mono>{formatSun(sun)} at capture</Mono>
          <Mono>
            {formatCoordinates(pin.lat, pin.lon, 5)} · {new Date(state.capturedAt).toLocaleString()}
          </Mono>
        </View>

        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: '600' }}>Show my name</Text>
              <Body muted>
                {state.attributed ? `Shown as “${name}”.` : 'Off: this location is anonymous.'}
              </Body>
            </View>
            <Switch
              value={state.attributed}
              onValueChange={toggleAttribution}
              accessibilityLabel="Show my name on this location"
            />
          </Row>
        </Card>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button label="Publish" busy={busy} onPress={() => void publish()} />
        <Body muted>
          By publishing you confirm you took this photo and may share it under the image licence.
        </Body>
      </View>
    </Screen>
  );
}
