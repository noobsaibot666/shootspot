import { BEST_LIGHT_PERIODS, GOOD_FOR_TAGS } from '@shootspot/shared';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { BEST_LIGHT_LABEL, GOOD_FOR_LABEL } from '../lib/labels';
import { RADII, useScope } from '../lib/scope';
import { space } from '../theme/tokens';
import { Body, Button, Chip, ErrorNote, Field, Label, Row, Screen } from '../ui';

/** Filter sheet (design spec §4.4): location, radius, scouting attributes; reset / apply. */
export default function Filters() {
  const { scope, setScope, locationDenied } = useScope();
  const [draft, setDraft] = useState(scope);
  const [query, setQuery] = useState(scope.place?.label ?? '');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findPlace() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const [hit] = await Location.geocodeAsync(query.trim());
      if (!hit) setError('No place found with that name.');
      else
        setDraft((d) => ({
          ...d,
          mode: 'place',
          place: { lat: hit.latitude, lon: hit.longitude, label: query.trim() },
        }));
    } catch {
      setError('Place search is unavailable right now.');
    } finally {
      setSearching(false);
    }
  }

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll>
        <View style={{ gap: space.sm }}>
          <Label>Area</Label>
          <Row wrap>
            <Chip
              label="Everywhere"
              selected={draft.mode === 'everywhere'}
              onPress={() => setDraft((d) => ({ ...d, mode: 'everywhere' }))}
            />
            <Chip
              label="Nearby"
              selected={draft.mode === 'nearby'}
              onPress={() => setDraft((d) => ({ ...d, mode: 'nearby' }))}
            />
            <Chip
              label={draft.place ? draft.place.label : 'A place'}
              selected={draft.mode === 'place'}
              onPress={() => setDraft((d) => ({ ...d, mode: draft.place ? 'place' : d.mode }))}
            />
          </Row>
          {draft.mode === 'nearby' && locationDenied ? (
            <Body muted>
              Location is off for ShootSpot. Search a place below instead, or allow location in
              Settings.
            </Body>
          ) : null}
          <Field
            label="Search a place"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => void findPlace()}
            editable={!searching}
            placeholder="City, area or landmark"
          />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </View>

        {draft.mode !== 'everywhere' ? (
          <View style={{ gap: space.sm }}>
            <Label>Radius</Label>
            <Row wrap>
              {RADII.map((r) => (
                <Chip
                  key={r}
                  label={`${r} km`}
                  selected={draft.radiusKm === r}
                  onPress={() => setDraft((d) => ({ ...d, radiusKm: r }))}
                />
              ))}
            </Row>
          </View>
        ) : null}

        <View style={{ gap: space.sm }}>
          <Label>Good for</Label>
          <Row wrap>
            {GOOD_FOR_TAGS.map((g) => (
              <Chip
                key={g}
                label={GOOD_FOR_LABEL[g]}
                selected={draft.goodFor.includes(g)}
                onPress={() => setDraft((d) => ({ ...d, goodFor: toggle(d.goodFor, g) }))}
              />
            ))}
          </Row>
        </View>

        <View style={{ gap: space.sm }}>
          <Label>Best light</Label>
          <Row wrap>
            {BEST_LIGHT_PERIODS.map((b) => (
              <Chip
                key={b}
                label={BEST_LIGHT_LABEL[b]}
                selected={draft.bestLight.includes(b)}
                onPress={() => setDraft((d) => ({ ...d, bestLight: toggle(d.bestLight, b) }))}
              />
            ))}
          </Row>
        </View>

        <Row>
          <Button
            label="Reset"
            kind="secondary"
            style={{ flex: 1 }}
            onPress={() =>
              setDraft((d) => ({
                ...d,
                mode: 'everywhere',
                goodFor: [],
                bestLight: [],
                radiusKm: 10,
              }))
            }
          />
          <Button
            label="Show results"
            style={{ flex: 2 }}
            onPress={() => {
              setScope(draft);
              router.back();
            }}
          />
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
