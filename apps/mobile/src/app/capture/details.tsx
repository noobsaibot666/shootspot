import { Ionicons } from '@expo/vector-icons';
import { formatBearing, type AdvancedInput } from '@shootspot/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useCapture } from '../../capture/context';
import { useVocabulary } from '../../lib/vocabulary';
import { space, useTheme } from '../../theme/tokens';
import { Body, Button, Chip, Field, Label, Mono, Row, Screen } from '../../ui';

type Group = keyof AdvancedInput;

/** Short input (one screen) + optional advanced input (D-16, docs/phase-0/02 §3). */
export default function Details() {
  const { vocab, label } = useVocabulary();
  const t = useTheme();
  const { state, update } = useCapture();
  const [open, setOpen] = useState(false);
  const [bearingText, setBearingText] = useState(
    state.bearingDeg == null ? '' : String(state.bearingDeg),
  );
  const bearing = bearingText === '' ? null : Number(bearingText);
  const bearingValid =
    bearing !== null && Number.isFinite(bearing) && bearing >= 0 && bearing < 360;
  const valid =
    state.label.trim().length > 0 &&
    state.goodFor.length > 0 &&
    state.bestLight.length > 0 &&
    bearingValid;

  const toggle = <T,>(list: T[], v: T, max = 99) =>
    list.includes(v) ? list.filter((x) => x !== v) : list.length < max ? [...list, v] : list;
  const setAdv = <G extends Group>(group: G, patch: NonNullable<AdvancedInput[G]>) =>
    update({
      advanced: { ...state.advanced, [group]: { ...(state.advanced[group] ?? {}), ...patch } },
    });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll>
        <Field
          label="Name of the place"
          value={state.label}
          onChangeText={(label) => update({ label })}
          maxLength={120}
          hint="Shown with the photo, e.g. “Miradouro da Graça”."
        />

        <View style={{ gap: space.sm }}>
          <Label>Good for (up to 8)</Label>
          <Row wrap>
            {vocab.goodFor
              .map((v) => v.key)
              .map((tag) => (
                <Chip
                  key={tag}
                  label={label('good_for', tag)}
                  selected={state.goodFor.includes(tag)}
                  onPress={() => update({ goodFor: toggle(state.goodFor, tag, 8) })}
                />
              ))}
          </Row>
          <Field
            label="Note (optional)"
            value={state.goodForNote}
            onChangeText={(goodForNote) => update({ goodForNote })}
            maxLength={200}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <Label>Best light</Label>
          <Row wrap>
            {vocab.bestLight
              .map((v) => v.key)
              .map((p) => (
                <Chip
                  key={p}
                  label={label('best_light', p)}
                  selected={state.bestLight.includes(p)}
                  onPress={() => update({ bestLight: toggle(state.bestLight, p) })}
                />
              ))}
          </Row>
          <Field
            label="Light note (optional)"
            value={state.bestLightNote}
            onChangeText={(bestLightNote) => update({ bestLightNote })}
            maxLength={200}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <Field
            label="Camera points toward (degrees)"
            value={bearingText}
            onChangeText={(v) => setBearingText(v.replace(/[^\d]/g, '').slice(0, 3))}
            keyboardType="number-pad"
            error={bearingText !== '' && !bearingValid ? 'Enter 0 to 359.' : null}
            hint={
              state.headingDeg == null
                ? state.origin === 'import'
                  ? 'This photo has no direction data: enter it, 0 = north, 90 = east.'
                  : 'No compass reading: enter the direction, 0 = north, 90 = east.'
                : state.origin === 'import'
                  ? "From the photo's direction data. Correct it if needed."
                  : 'From your compass at the moment of capture. Correct it if needed.'
            }
          />
          {bearingValid ? <Mono>{formatBearing(bearing!)}</Mono> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((o) => !o)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}
        >
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={t.ink} />
          <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600' }}>
            More details (optional)
          </Text>
        </Pressable>

        {open ? (
          <View style={{ gap: space.lg }}>
            <Body muted>Access, permits and practical tips help others plan a shoot.</Body>
            <Choice
              label="Access"
              value={state.advanced.access?.type}
              options={{
                public: 'Public',
                permission_needed: 'Permission needed',
                paid_entry: 'Paid entry',
                restricted: 'Restricted',
              }}
              onChange={(type) => setAdv('access', { type })}
            />
            <Choice
              label="Terrain"
              value={state.advanced.access?.terrain}
              options={{ easy: 'Easy', moderate: 'Moderate', difficult: 'Difficult' }}
              onChange={(terrain) => setAdv('access', { terrain })}
            />
            <Field
              label="Walk from parking (minutes)"
              keyboardType="number-pad"
              value={state.advanced.access?.walkInMinutes?.toString() ?? ''}
              onChangeText={(v) =>
                setAdv('access', {
                  walkInMinutes: v ? Math.min(600, Number(v.replace(/\D/g, ''))) : undefined,
                })
              }
            />
            <Choice
              label="Permit required"
              value={state.advanced.rules?.permitRequired}
              options={TRI}
              onChange={(permitRequired) => setAdv('rules', { permitRequired })}
            />
            <Choice
              label="Drones"
              value={state.advanced.rules?.drone}
              options={{
                allowed: 'Allowed',
                restricted: 'Restricted',
                no_fly: 'No-fly',
                unknown: 'Unknown',
              }}
              onChange={(drone) => setAdv('rules', { drone })}
            />
            <Choice
              label="Tripod allowed"
              value={state.advanced.rules?.tripodAllowed}
              options={TRI}
              onChange={(tripodAllowed) => setAdv('rules', { tripodAllowed })}
            />
            <Choice
              label="Parking"
              value={state.advanced.practical?.parking}
              options={TRI}
              onChange={(parking) => setAdv('practical', { parking })}
            />
            <Choice
              label="Mobile signal"
              value={state.advanced.practical?.mobileSignal}
              options={{ good: 'Good', weak: 'Weak', none: 'None', unknown: 'Unknown' }}
              onChange={(mobileSignal) => setAdv('practical', { mobileSignal })}
            />
            <Choice
              label="Tide-dependent"
              value={state.advanced.conditions?.tideDependent}
              options={TRI}
              onChange={(tideDependent) => setAdv('conditions', { tideDependent })}
            />
            <Field
              label="Hazards / safety"
              value={state.advanced.conditions?.hazardsNote ?? ''}
              onChangeText={(hazardsNote) => setAdv('conditions', { hazardsNote })}
              maxLength={300}
              multiline
            />
            <Field
              label="Lens used"
              value={state.advanced.shot?.lensUsed ?? ''}
              onChangeText={(lensUsed) => setAdv('shot', { lensUsed })}
              maxLength={60}
            />
            <Field
              label="Shot notes"
              value={state.advanced.shot?.note ?? ''}
              onChangeText={(note) => setAdv('shot', { note })}
              maxLength={500}
              multiline
            />
          </View>
        ) : null}

        <Button
          label="Preview"
          disabled={!valid}
          onPress={() => {
            update({ bearingDeg: bearing });
            router.push('/capture/publish');
          }}
        />
        {!valid ? (
          <Body muted>Add a name, at least one “Good for”, best light and a direction.</Body>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const TRI = { yes: 'Yes', no: 'No', unknown: 'Unknown' } as const;

function Choice<K extends string>(props: {
  label: string;
  value: K | undefined;
  options: Record<K, string>;
  onChange(v: K): void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Label>{props.label}</Label>
      <Row wrap>
        {(Object.keys(props.options) as K[]).map((k) => (
          <Chip
            key={k}
            label={props.options[k]}
            selected={props.value === k}
            onPress={() => props.onChange(k)}
          />
        ))}
      </Row>
    </View>
  );
}
