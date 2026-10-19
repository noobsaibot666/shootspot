import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVocabulary } from '../lib/vocabulary';
import { RADII, useScope } from '../lib/scope';
import { radius, space, type, useTheme } from '../theme/tokens';
import { Body, Chip, ErrorNote, IconButton, Row, Tap } from '../ui';
import { Icon } from '../ui/icon';

/** Filter sheet (design spec §4.4): location, radius, scouting attributes; reset / apply. */
export default function Filters() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { vocab, label } = useVocabulary();
  const { scope, setScope, locationDenied } = useScope();
  const [draft, setDraft] = useState(scope);
  const [query, setQuery] = useState(scope.place?.label ?? '');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = useRef<React.ComponentRef<typeof TextInput>>(null);

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
      style={{ flex: 1, backgroundColor: t.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Own header: a title and a close button on every platform. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: (Platform.OS === 'ios' ? space.md : insets.top) + space.sm,
          paddingLeft: space.lg,
          paddingRight: space.sm,
          paddingBottom: space.sm,
        }}
      >
        <Text accessibilityRole="header" style={[type.title, { color: t.ink }]}>
          Area & filters
        </Text>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: space.lg,
          paddingBottom: space.xxl,
          gap: space.xxl + space.md,
        }}
      >
        <Section title="Area" sub="Where to look for locations.">
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
              onPress={() => {
                // With a place found, select it; otherwise jump to the search to find one.
                if (draft.place) setDraft((d) => ({ ...d, mode: 'place' }));
                else search.current?.focus();
              }}
            />
          </Row>
          {draft.mode === 'nearby' && locationDenied ? (
            <Body muted>
              Location is off for ShootSpot. Search a place below instead, or allow location in
              Settings.
            </Body>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              backgroundColor: t.surface,
              borderRadius: radius.pill,
              paddingHorizontal: space.lg,
              minHeight: 50,
            }}
          >
            <Icon name="search" size={18} color={t.muted} />
            <TextInput
              ref={search}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              onSubmitEditing={() => void findPlace()}
              editable={!searching}
              placeholder="Search a city, area or landmark"
              placeholderTextColor={t.muted}
              accessibilityLabel="Search a place"
              style={[type.body, { flex: 1, color: t.ink, paddingVertical: space.sm }]}
            />
          </View>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </Section>

        {draft.mode !== 'everywhere' ? (
          <Section title="Radius" sub="How far around it.">
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
          </Section>
        ) : null}

        <Section title="Good for" sub="Show places suited to these shoots.">
          <Row wrap>
            {vocab.goodFor.map(({ key: g }) => (
              <Chip
                key={g}
                label={label('good_for', g)}
                selected={draft.goodFor.includes(g)}
                onPress={() => setDraft((d) => ({ ...d, goodFor: toggle(d.goodFor, g) }))}
              />
            ))}
          </Row>
        </Section>

        <Section title="Best light" sub="When the place looks its best.">
          <Row wrap>
            {vocab.bestLight.map(({ key: b }) => (
              <Chip
                key={b}
                label={label('best_light', b)}
                selected={draft.bestLight.includes(b)}
                onPress={() => setDraft((d) => ({ ...d, bestLight: toggle(d.bestLight, b) }))}
              />
            ))}
          </Row>
        </Section>
      </ScrollView>

      {/* Two equal, compact actions, apart from the content. */}
      <View
        style={{
          flexDirection: 'row',
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingTop: space.lg,
          paddingBottom: insets.bottom + space.md,
          borderTopWidth: 1,
          borderColor: t.divider,
          backgroundColor: t.canvas,
        }}
      >
        <BarButton
          label="Reset"
          color={t.accent}
          outline
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
        <BarButton
          label="Show results"
          color={t.ink}
          onPress={() => {
            setScope(draft);
            router.back();
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Section(props: { title: string; sub: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={[type.headline, { color: t.ink }]}>
          {props.title}
        </Text>
        <Text style={[type.caption, { color: t.muted }]}>{props.sub}</Text>
      </View>
      {props.children}
    </View>
  );
}

function BarButton(props: { label: string; color: string; outline?: boolean; onPress(): void }) {
  const t = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={{
        flex: 1,
        minHeight: 44,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.outline ? 'transparent' : props.color,
        borderWidth: props.outline ? 1.5 : 0,
        borderColor: props.color,
      }}
    >
      <Text style={[type.bodyStrong, { color: props.outline ? props.color : t.onInk }]}>
        {props.label}
      </Text>
    </Tap>
  );
}
