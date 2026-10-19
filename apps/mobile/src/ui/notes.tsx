import type { AdvancedInput, TagKind } from '@shootspot/shared';
import { useRef, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { haptics } from '../lib/device';
import { forgetTag, hideTag, rememberTag, showTag, useMyTags } from '../lib/hidden-tags';
import { useReduceMotion } from '../lib/motion';
import { useVocabulary } from '../lib/vocabulary';
import { radius, space, type, useTheme } from '../theme/tokens';
import { IconButton, Label, Tap } from '.';
import { Icon } from './icon';

/**
 * Scouting-notes building blocks (D-38, D-39), shared by the stepped capture flow and the Edit
 * screen: big pills that fill each row, a personal tag list (long-press to hide, accent "Add" to
 * bring back or type your own), the place-name pill and the optional detail pages.
 */

const PILL_LAYOUT = LinearTransition.springify().damping(18).stiffness(220);
const MAX_CUSTOM = 3;

/** A large selectable pill: easy to hit on a phone held in one hand. */
export function Pill(props: {
  label: string;
  selected?: boolean;
  accent?: boolean;
  editing?: boolean;
  /** Stretch to share the row with its neighbours (no empty space at the end of a row). */
  fill?: boolean;
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
      accessibilityLabel={props.editing ? `Remove ${props.label} from your list` : props.label}
      accessibilityHint={props.onLongPress ? 'Long-press to edit your list' : undefined}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={380}
      scaleTo={0.94}
      style={{
        flexGrow: props.fill ? 1 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
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

/** Pills that wrap and stretch so every row spans the full width. */
export function PillRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

function useAnim() {
  const reduce = useReduceMotion();
  // The wrapper grows too, so the pill inside can fill its share of the row.
  return (key: string, child: React.ReactNode) => (
    <Animated.View
      key={key}
      style={{ flexGrow: 1 }}
      layout={reduce ? undefined : PILL_LAYOUT}
      entering={reduce ? undefined : ZoomIn.duration(180)}
      exiting={reduce ? undefined : ZoomOut.duration(160)}
    >
      {child}
    </Animated.View>
  );
}

/**
 * The tag list for one kind: the admin's tags plus the member's own. Long-press any pill to edit
 * the list (× hides a listed tag or forgets a typed one). The accent "Add" pill opens a panel to
 * type a new tag or bring a hidden one back.
 */
export function TagPicker(props: {
  kind: TagKind;
  selected: string[];
  custom: string[];
  onChange(selected: string[], custom: string[]): void;
  max?: number;
}) {
  const t = useTheme();
  const anim = useAnim();
  const reduce = useReduceMotion();
  const { vocab, label } = useVocabulary();
  const { hidden, personal } = useMyTags(props.kind);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const all = (props.kind === 'good_for' ? vocab.goodFor : vocab.bestLight).map((v) => v.key);
  // Selected tags always show (an old record may carry one that's hidden or retired).
  const shown = [
    ...all.filter((k) => !hidden.includes(k) || props.selected.includes(k)),
    ...props.selected.filter((k) => !all.includes(k)),
  ];
  const mine = [...props.custom, ...personal.filter((p) => !props.custom.includes(p))];
  const restorable = all.filter((k) => hidden.includes(k) && !props.selected.includes(k));
  const max = props.max ?? 99;
  const { selected, custom } = props;

  function toggle(key: string) {
    if (editing) {
      hideTag(props.kind, key);
      return props.onChange(
        selected.filter((k) => k !== key),
        custom,
      );
    }
    haptics.selection();
    if (selected.includes(key))
      props.onChange(
        selected.filter((k) => k !== key),
        custom,
      );
    else if (selected.length < max) props.onChange([...selected, key], custom);
  }
  function toggleMine(tag: string) {
    if (editing) {
      forgetTag(props.kind, tag);
      return props.onChange(
        selected,
        custom.filter((c) => c !== tag),
      );
    }
    haptics.selection();
    if (custom.includes(tag))
      props.onChange(
        selected,
        custom.filter((c) => c !== tag),
      );
    else if (custom.length < MAX_CUSTOM) props.onChange(selected, [...custom, tag]);
  }
  function addTyped() {
    const tag = text.trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!tag) return;
    haptics.light();
    rememberTag(props.kind, tag);
    if (!custom.includes(tag) && custom.length < MAX_CUSTOM)
      props.onChange(selected, [...custom, tag]);
    setText('');
    setAdding(false);
  }
  const longPress = () => {
    haptics.light();
    setAdding(false);
    setEditing((e) => !e);
  };

  return (
    <View style={{ gap: space.md }}>
      <PillRow>
        {shown.map((key) =>
          anim(
            key,
            <Pill
              fill
              label={label(props.kind, key)}
              selected={!editing && selected.includes(key)}
              editing={editing}
              onPress={() => toggle(key)}
              onLongPress={longPress}
            />,
          ),
        )}
        {mine.map((tag) =>
          anim(
            `mine:${tag}`,
            <Pill
              fill
              label={tag}
              selected={!editing && custom.includes(tag)}
              editing={editing}
              onPress={() => toggleMine(tag)}
              onLongPress={longPress}
            />,
          ),
        )}
        {editing
          ? anim('done', <Pill fill label="Done" selected onPress={() => setEditing(false)} />)
          : anim('add', <Pill fill label="Add" accent onPress={() => setAdding((a) => !a)} />)}
      </PillRow>

      {adding ? (
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(180)}
          exiting={reduce ? undefined : FadeOut.duration(120)}
          style={{ gap: space.md }}
        >
          <PillInput
            autoFocus
            value={text}
            onChangeText={setText}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={addTyped}
            placeholder="Type your own tag"
            accessibilityLabel="Type your own tag"
            action={{ icon: 'check', label: 'Add this tag', onPress: addTyped }}
          />
          {custom.length >= MAX_CUSTOM ? (
            <Text style={[type.caption, { color: t.muted }]}>
              Up to {MAX_CUSTOM} of your own tags per photo.
            </Text>
          ) : null}
          {restorable.length ? (
            <View style={{ gap: space.sm }}>
              <Label>Bring back</Label>
              <PillRow>
                {restorable.map((key) =>
                  anim(
                    `back:${key}`,
                    <Pill
                      fill
                      label={label(props.kind, key)}
                      onPress={() => {
                        haptics.selection();
                        showTag(props.kind, key);
                        if (selected.length < max) props.onChange([...selected, key], custom);
                      }}
                    />,
                  ),
                )}
              </PillRow>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <Text style={[type.caption, { color: t.muted }]}>
        {editing
          ? 'Tap a tag to remove it from your list. Add brings it back any time.'
          : 'Long-press a tag to hide the ones you never use.'}
      </Text>
    </View>
  );
}

/**
 * A text field shaped like a pill: the place name, notes, a new tag. `clearable` shows an × that
 * empties it in one tap; `action` puts a round button at the end (e.g. ✓ to add a tag).
 */
export function PillInput(
  props: TextInputProps & {
    large?: boolean;
    clearable?: boolean;
    action?: { icon: 'check'; label: string; onPress(): void };
  },
) {
  const t = useTheme();
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const { large, clearable, action, style, ...input } = props;
  const showClear = clearable && Boolean(input.value);
  const end = showClear || action;
  return (
    <View style={{ justifyContent: 'center' }}>
      <TextInput
        ref={ref}
        placeholderTextColor={t.muted}
        style={[
          large ? type.title : type.headline,
          {
            color: t.ink,
            backgroundColor: t.surface,
            borderRadius: input.multiline ? radius.card + 4 : large ? 28 : radius.pill,
            minHeight: input.multiline ? 96 : large ? 64 : 52,
            paddingLeft: space.xl,
            paddingRight: end ? 56 : space.xl,
            paddingVertical: large || input.multiline ? space.md : space.sm,
            textAlign: large ? 'center' : 'left',
            textAlignVertical: input.multiline ? 'top' : 'center',
            fontWeight: large ? '600' : '400',
          },
          style,
        ]}
        {...input}
      />
      {action ? (
        <View style={{ position: 'absolute', right: 6 }}>
          <Tap
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            scaleTo={0.9}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: t.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={action.icon} size={20} color={t.onInk} weight="bold" />
          </Tap>
        </View>
      ) : showClear ? (
        <IconButton
          icon="close"
          label="Clear"
          size={40}
          style={{ position: 'absolute', right: 8 }}
          onPress={() => {
            input.onChangeText?.('');
            ref.current?.focus();
          }}
        />
      ) : null}
    </View>
  );
}

/** One choice from a few, as big pills; tapping the chosen one clears it (all optional). */
function ChoicePills<K extends string>(props: {
  label: string;
  value: K | undefined;
  options: Record<K, string>;
  onChange(v: K | undefined): void;
}) {
  return (
    <View style={{ gap: space.md }}>
      <Text style={[type.bodyStrong, { color: useTheme().inkSecondary }]}>{props.label}</Text>
      <PillRow>
        {(Object.keys(props.options) as K[]).map((k) => (
          <Pill
            key={k}
            fill
            label={props.options[k]}
            selected={props.value === k}
            onPress={() => {
              haptics.selection();
              props.onChange(props.value === k ? undefined : k);
            }}
          />
        ))}
      </PillRow>
    </View>
  );
}

function NoteField(props: TextInputProps & { label: string }) {
  const { label, ...input } = props;
  return (
    <View style={{ gap: space.md }}>
      <Text style={[type.bodyStrong, { color: useTheme().inkSecondary }]}>{label}</Text>
      <PillInput accessibilityLabel={label} clearable={!input.multiline} {...input} />
    </View>
  );
}

const TRI = { yes: 'Yes', no: 'No', unknown: 'Not sure' } as const;

/** The optional detail pages (D-16 advanced input), one section per page in the capture flow. */
export const DETAIL_PAGES = [
  { key: 'access', title: 'Access', sub: 'How do people get there?' },
  { key: 'rules', title: 'Rules', sub: 'Permits, drones and tripods.' },
  { key: 'practical', title: 'Practical', sub: 'Parking and mobile signal.' },
  { key: 'conditions', title: 'Conditions', sub: 'Tides and safety.' },
  { key: 'shot', title: 'The shot', sub: 'Lens and tips for the next photographer.' },
] as const;
export type DetailPage = (typeof DETAIL_PAGES)[number]['key'];

export function DetailFields(props: {
  page: DetailPage;
  value: AdvancedInput;
  onChange(next: AdvancedInput): void;
  goodForNote: string;
  onGoodForNote(v: string): void;
}) {
  const v = props.value;
  const set = <G extends keyof AdvancedInput>(group: G, patch: NonNullable<AdvancedInput[G]>) =>
    props.onChange({ ...v, [group]: { ...(v[group] ?? {}), ...patch } });
  const gap = { gap: space.xxl };
  switch (props.page) {
    case 'access':
      return (
        <View style={gap}>
          <ChoicePills
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
          <ChoicePills
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
            placeholder="e.g. 10"
          />
        </View>
      );
    case 'rules':
      return (
        <View style={gap}>
          <ChoicePills
            label="Permit required"
            value={v.rules?.permitRequired}
            options={TRI}
            onChange={(permitRequired) => set('rules', { permitRequired })}
          />
          <ChoicePills
            label="Drones"
            value={v.rules?.drone}
            options={{
              allowed: 'Allowed',
              restricted: 'Restricted',
              no_fly: 'No-fly',
              unknown: 'Not sure',
            }}
            onChange={(drone) => set('rules', { drone })}
          />
          <ChoicePills
            label="Tripod allowed"
            value={v.rules?.tripodAllowed}
            options={TRI}
            onChange={(tripodAllowed) => set('rules', { tripodAllowed })}
          />
        </View>
      );
    case 'practical':
      return (
        <View style={gap}>
          <ChoicePills
            label="Parking"
            value={v.practical?.parking}
            options={TRI}
            onChange={(parking) => set('practical', { parking })}
          />
          <ChoicePills
            label="Mobile signal"
            value={v.practical?.mobileSignal}
            options={{ good: 'Good', weak: 'Weak', none: 'None', unknown: 'Not sure' }}
            onChange={(mobileSignal) => set('practical', { mobileSignal })}
          />
        </View>
      );
    case 'conditions':
      return (
        <View style={gap}>
          <ChoicePills
            label="Tide-dependent"
            value={v.conditions?.tideDependent}
            options={TRI}
            onChange={(tideDependent) => set('conditions', { tideDependent })}
          />
          <NoteField
            label="Hazards / safety"
            value={v.conditions?.hazardsNote ?? ''}
            onChangeText={(hazardsNote) => set('conditions', { hazardsNote })}
            maxLength={300}
            multiline
            placeholder="e.g. Slippery rocks at high tide"
          />
        </View>
      );
    case 'shot':
      return (
        <View style={gap}>
          <NoteField
            label="Lens used"
            value={v.shot?.lensUsed ?? ''}
            onChangeText={(lensUsed) => set('shot', { lensUsed })}
            maxLength={60}
            placeholder="e.g. 24–70 mm"
          />
          <NoteField
            label="Good for, in your words"
            value={props.goodForNote}
            onChangeText={props.onGoodForNote}
            maxLength={200}
            placeholder="e.g. Quiet before 9 am on weekdays"
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
}

/** Every detail page in one scroll, with headings (the Edit screen). */
export function MoreDetails(props: Omit<Parameters<typeof DetailFields>[0], 'page'>) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xxl + space.md }}>
      {DETAIL_PAGES.map((p) => (
        <View key={p.key} style={{ gap: space.lg }}>
          <Text accessibilityRole="header" style={[type.headline, { color: t.ink }]}>
            {p.title}
          </Text>
          <DetailFields page={p.key} {...props} />
        </View>
      ))}
    </View>
  );
}
