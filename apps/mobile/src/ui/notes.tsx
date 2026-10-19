import type { AdvancedInput, TagKind } from '@shootspot/shared';
import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { haptics } from '../lib/device';
import { hideTag, showTag, useHiddenTags } from '../lib/hidden-tags';
import { useReduceMotion } from '../lib/motion';
import { useVocabulary } from '../lib/vocabulary';
import { radius, space, type, useTheme } from '../theme/tokens';
import { Body, Chip, Label, Row, Sheet, Tap } from '.';
import { Icon } from './icon';

/**
 * Scouting-notes building blocks (D-38), shared by the stepped capture flow and the Edit screen:
 * big touch-friendly pills, a personal tag list (long-press to hide, accent "Add" to bring back),
 * the place-name pill and the optional "more details" fields.
 */

const PILL_LAYOUT = LinearTransition.springify().damping(18).stiffness(220);

/** A large selectable pill: easy to hit on a phone held in one hand. */
export function Pill(props: {
  label: string;
  selected?: boolean;
  accent?: boolean;
  editing?: boolean;
  onPress(): void;
  onLongPress?(): void;
}) {
  const t = useTheme();
  const on = props.selected || props.accent;
  const bg = props.accent ? t.accent : props.selected ? t.ink : t.surface;
  const fg = props.accent ? '#FFFFFF' : props.selected ? t.onInk : t.ink;
  return (
    <Tap
      accessibilityRole={props.accent || props.editing ? 'button' : 'checkbox'}
      accessibilityState={props.accent ? undefined : { checked: !!props.selected }}
      accessibilityLabel={props.editing ? `Hide ${props.label}` : props.label}
      accessibilityHint={props.onLongPress ? 'Long-press to edit your list' : undefined}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={380}
      scaleTo={0.94}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 50,
        paddingHorizontal: 20,
        borderRadius: radius.pill,
        backgroundColor: bg,
        borderWidth: on ? 0 : 1,
        borderColor: t.divider,
      }}
    >
      {props.accent ? <Icon name="add" size={18} color={fg} weight="bold" /> : null}
      <Text style={[type.headline, { color: fg, fontWeight: on ? '600' : '500' }]}>
        {props.label}
      </Text>
      {props.editing ? <Icon name="close" size={16} color={fg} weight="bold" /> : null}
    </Tap>
  );
}

/**
 * The tag list for one kind. Long-press any pill to edit the list: pills show an ×, tapping one
 * hides it from this member's pickers. The accent "Add" pill brings hidden tags back.
 */
export function TagPicker(props: {
  kind: TagKind;
  selected: string[];
  onChange(next: string[]): void;
  max?: number;
}) {
  const t = useTheme();
  const reduce = useReduceMotion();
  const { vocab, label } = useVocabulary();
  const hidden = useHiddenTags(props.kind);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const all = (props.kind === 'good_for' ? vocab.goodFor : vocab.bestLight).map((v) => v.key);
  // Selected tags always show (an old record may carry one that's hidden or retired).
  const shown = [
    ...all.filter((k) => !hidden.includes(k) || props.selected.includes(k)),
    ...props.selected.filter((k) => !all.includes(k)),
  ];
  const restorable = all.filter((k) => hidden.includes(k) && !props.selected.includes(k));
  const max = props.max ?? 99;

  function press(key: string) {
    if (editing) {
      hideTag(props.kind, key);
      props.onChange(props.selected.filter((k) => k !== key));
      return;
    }
    haptics.selection();
    if (props.selected.includes(key)) props.onChange(props.selected.filter((k) => k !== key));
    else if (props.selected.length < max) props.onChange([...props.selected, key]);
  }

  const anim = (key: string, child: React.ReactNode) => (
    <Animated.View
      key={key}
      layout={reduce ? undefined : PILL_LAYOUT}
      entering={reduce ? undefined : ZoomIn.duration(180)}
      exiting={reduce ? undefined : ZoomOut.duration(160)}
    >
      {child}
    </Animated.View>
  );

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {shown.map((key) =>
          anim(
            key,
            <Pill
              label={label(props.kind, key)}
              selected={!editing && props.selected.includes(key)}
              editing={editing}
              onPress={() => press(key)}
              onLongPress={() => {
                haptics.light();
                setEditing((e) => !e);
              }}
            />,
          ),
        )}
        {editing
          ? anim('done', <Pill label="Done" selected onPress={() => setEditing(false)} />)
          : anim('add', <Pill label="Add" accent onPress={() => setAdding(true)} />)}
      </View>
      <Text style={[type.caption, { color: t.muted }]}>
        {editing
          ? 'Tap a tag to hide it from your list. You can add it back any time.'
          : 'Long-press a tag to hide the ones you never use.'}
      </Text>

      <Sheet visible={adding} onClose={() => setAdding(false)}>
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg }}>
          <Text style={[type.title, { color: t.ink }]}>Add to your list</Text>
          {restorable.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {restorable.map((key) =>
                anim(
                  key,
                  <Pill
                    label={label(props.kind, key)}
                    onPress={() => {
                      haptics.selection();
                      showTag(props.kind, key);
                      if (props.selected.length < max) props.onChange([...props.selected, key]);
                    }}
                  />,
                ),
              )}
            </View>
          ) : (
            <Body muted>
              Every tag is already in your list. Long-press a tag to hide the ones you don’t use.
            </Body>
          )}
        </View>
      </Sheet>
    </View>
  );
}

/** A text field shaped like a pill: the place name, the light note. */
export function PillInput(props: TextInputProps & { large?: boolean }) {
  const t = useTheme();
  const { large, style, ...input } = props;
  return (
    <TextInput
      placeholderTextColor={t.muted}
      style={[
        large ? type.title : type.headline,
        {
          color: t.ink,
          backgroundColor: t.surface,
          borderRadius: input.multiline ? radius.card + 4 : large ? 28 : radius.pill,
          minHeight: input.multiline ? 96 : large ? 64 : 52,
          paddingHorizontal: space.xl,
          paddingVertical: large || input.multiline ? space.md : space.sm,
          textAlignVertical: input.multiline ? 'top' : 'center',
          textAlign: large ? 'center' : 'left',
          fontWeight: large ? '600' : '400',
        },
        style,
      ]}
      {...input}
    />
  );
}

/** The optional advanced input (D-16): access, rules, practical, conditions, the shot. */
export function MoreDetails(props: {
  value: AdvancedInput;
  onChange(next: AdvancedInput): void;
  goodForNote: string;
  onGoodForNote(v: string): void;
}) {
  const v = props.value;
  const set = <G extends keyof AdvancedInput>(group: G, patch: NonNullable<AdvancedInput[G]>) =>
    props.onChange({ ...v, [group]: { ...(v[group] ?? {}), ...patch } });
  return (
    <View style={{ gap: space.xl }}>
      <Choice
        label="Access"
        value={v.access?.type}
        options={{
          public: 'Public',
          permission_needed: 'Permission needed',
          paid_entry: 'Paid entry',
          restricted: 'Restricted',
        }}
        onChange={(type) => set('access', { type })}
      />
      <Choice
        label="Terrain"
        value={v.access?.terrain}
        options={{ easy: 'Easy', moderate: 'Moderate', difficult: 'Difficult' }}
        onChange={(terrain) => set('access', { terrain })}
      />
      <NoteField
        label="Walk from parking (minutes)"
        keyboardType="number-pad"
        value={v.access?.walkInMinutes?.toString() ?? ''}
        onChangeText={(m) =>
          set('access', {
            walkInMinutes: m ? Math.min(600, Number(m.replace(/\D/g, ''))) : undefined,
          })
        }
      />
      <Choice
        label="Permit required"
        value={v.rules?.permitRequired}
        options={TRI}
        onChange={(permitRequired) => set('rules', { permitRequired })}
      />
      <Choice
        label="Drones"
        value={v.rules?.drone}
        options={{
          allowed: 'Allowed',
          restricted: 'Restricted',
          no_fly: 'No-fly',
          unknown: 'Unknown',
        }}
        onChange={(drone) => set('rules', { drone })}
      />
      <Choice
        label="Tripod allowed"
        value={v.rules?.tripodAllowed}
        options={TRI}
        onChange={(tripodAllowed) => set('rules', { tripodAllowed })}
      />
      <Choice
        label="Parking"
        value={v.practical?.parking}
        options={TRI}
        onChange={(parking) => set('practical', { parking })}
      />
      <Choice
        label="Mobile signal"
        value={v.practical?.mobileSignal}
        options={{ good: 'Good', weak: 'Weak', none: 'None', unknown: 'Unknown' }}
        onChange={(mobileSignal) => set('practical', { mobileSignal })}
      />
      <Choice
        label="Tide-dependent"
        value={v.conditions?.tideDependent}
        options={TRI}
        onChange={(tideDependent) => set('conditions', { tideDependent })}
      />
      <NoteField
        label="Good for, in your words"
        value={props.goodForNote}
        onChangeText={props.onGoodForNote}
        maxLength={200}
        placeholder="e.g. Quiet before 9 am on weekdays"
      />
      <NoteField
        label="Hazards / safety"
        value={v.conditions?.hazardsNote ?? ''}
        onChangeText={(hazardsNote) => set('conditions', { hazardsNote })}
        maxLength={300}
        multiline
      />
      <NoteField
        label="Lens used"
        value={v.shot?.lensUsed ?? ''}
        onChangeText={(lensUsed) => set('shot', { lensUsed })}
        maxLength={60}
      />
      <NoteField
        label="Shot notes"
        value={v.shot?.note ?? ''}
        onChangeText={(note) => set('shot', { note })}
        maxLength={500}
        multiline
      />
    </View>
  );
}

const TRI = { yes: 'Yes', no: 'No', unknown: 'Unknown' } as const;

function NoteField(props: TextInputProps & { label: string }) {
  const { label, ...input } = props;
  return (
    <View style={{ gap: space.sm }}>
      <Label>{label}</Label>
      <PillInput accessibilityLabel={label} {...input} />
    </View>
  );
}

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
