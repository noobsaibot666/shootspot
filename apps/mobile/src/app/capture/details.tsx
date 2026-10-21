import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  withDelay,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCapture } from '../../capture/context';
import { haptics } from '../../lib/device';
import { useReduceMotion } from '../../lib/motion';
import { space, type, useTheme } from '../../theme/tokens';
import { Button } from '../../ui';
import { Icon } from '../../ui/icon';
import { DETAIL_PAGES, DetailFields, PillInput, TagPicker } from '../../ui/notes';

const REQUIRED = ['name', 'goodFor', 'light'] as const;
const STEPS = [...REQUIRED, ...DETAIL_PAGES.map((p) => p.key)] as const;
type Step = (typeof STEPS)[number];
// Access (public or not) is always shown after Best light, so it counts as a main step (D-42).
const MAIN = REQUIRED.length + 1;
const EASE = Easing.out(Easing.cubic);

/**
 * Scouting notes as steps (D-38): one question per screen, each confirmed with a tap or a swipe.
 * Name (prefilled from the pin) → Good for → Best light → Access (optional) → preview, or on
 * through the optional detail pages (one section each, nothing required). The camera direction
 * is never asked: it comes from the compass at capture (or the photo's data).
 */
export default function Details() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { state, update } = useCapture();
  const [step, setStep] = useState<Step>('name');
  const index = STEPS.indexOf(step);
  const detail = DETAIL_PAGES.find((p) => p.key === step);
  // +1 forward, -1 back: read by the enter/exit animations on the UI thread.
  const dir = useSharedValue(1);

  const ok = [
    state.label.trim().length > 0,
    state.goodFor.length + state.goodForCustom.length > 0,
    state.bestLight.length + state.bestLightCustom.length > 0,
  ];
  const ready = ok.every(Boolean);

  function go(to: number) {
    const next = STEPS[to];
    if (!next || to === index) return;
    // The three required steps must be answered before moving past them; the rest never block.
    if (to > index && ok.slice(0, Math.min(to, REQUIRED.length)).some((o) => !o)) return;
    dir.value = to > index ? 1 : -1;
    haptics.light();
    setStep(next);
  }
  const preview = () => {
    if (ready) router.push('/capture/publish');
  };

  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;

  // Back (header button, Android back) steps back first; from the first step it leaves.
  const navigation = useNavigation();
  useEffect(() => {
    if (index === 0) {
      navigation.setOptions({ headerLeft: undefined });
      return;
    }
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous step"
          hitSlop={12}
          onPress={() => goRef.current(indexRef.current - 1)}
        >
          <Icon name="back" size={24} color={t.ink} />
        </Pressable>
      ),
    });
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goRef.current(indexRef.current - 1);
      return true;
    });
    return () => sub.remove();
  }, [index, navigation, t.ink]);

  // Swipe left for the next page, right for the previous one (no extra native module needed).
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -60 || g.vx < -0.5) goRef.current(indexRef.current + 1);
          else if (g.dx > 60 || g.vx > 0.5) goRef.current(indexRef.current - 1);
        },
      }),
    [],
  );

  const entering: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateX: dir.value * 48 }] },
      animations: {
        opacity: withDelay(90, withTiming(1, { duration: 240, easing: EASE })),
        transform: [{ translateX: withDelay(90, withTiming(0, { duration: 320, easing: EASE })) }],
      },
    };
  };
  const exiting: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: {
        opacity: withTiming(0, { duration: 160 }),
        transform: [{ translateX: withTiming(-dir.value * 48, { duration: 200, easing: EASE }) }],
      },
    };
  };

  const bottom = insets.bottom + space.lg;
  const last = index === STEPS.length - 1;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      {index >= MAIN ? (
        <Progress count={STEPS.length - MAIN} index={index - MAIN} />
      ) : (
        <Progress count={MAIN} index={index} />
      )}
      <View style={{ flex: 1 }} {...swipe.panHandlers}>
        <Animated.View
          key={step}
          entering={reduce ? undefined : entering}
          exiting={reduce ? undefined : exiting}
          style={StyleSheet.absoluteFill}
        >
          {step === 'name' ? (
            <View style={{ flex: 1, paddingHorizontal: space.lg, paddingBottom: bottom }}>
              <StepTitle title="Name of the place" sub="Check the name, or tap it to change it." />
              <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
                <PillInput
                  large
                  clearable
                  value={state.label}
                  onChangeText={(label) => update({ label })}
                  maxLength={120}
                  returnKeyType="done"
                  onSubmitEditing={() => go(1)}
                  placeholder="Name this place"
                  accessibilityLabel="Name of the place"
                />
                <Text style={[type.caption, { color: t.muted, textAlign: 'center' }]}>
                  Shown with the photo, e.g. “Durdle Door, Dorset” or “Bondi Icebergs, Sydney”.
                </Text>
              </View>
              <Button label="Confirm" disabled={!ok[0]} onPress={() => go(1)} />
            </View>
          ) : step === 'goodFor' ? (
            <StepScroll bottom={bottom}>
              <StepTitle title="Good for" sub="What would you shoot here? Pick up to 8." />
              <TagPicker
                kind="good_for"
                selected={state.goodFor}
                custom={state.goodForCustom}
                onChange={(goodFor, goodForCustom) => update({ goodFor, goodForCustom })}
                max={8}
              />
              <View style={{ flex: 1 }} />
              <Button label="Confirm" disabled={!ok[1]} onPress={() => go(2)} />
            </StepScroll>
          ) : step === 'light' ? (
            <StepScroll bottom={bottom}>
              <StepTitle title="Best light" sub="When does this place look its best?" />
              <TagPicker
                kind="best_light"
                selected={state.bestLight}
                custom={state.bestLightCustom}
                onChange={(bestLight, bestLightCustom) => update({ bestLight, bestLightCustom })}
              />
              <PillInput
                clearable
                value={state.bestLightNote}
                onChangeText={(bestLightNote) => update({ bestLightNote })}
                maxLength={200}
                placeholder="Light note (optional)"
                accessibilityLabel="Light note (optional)"
              />
              <View style={{ flex: 1 }} />
              <Actions onPreview={preview} ready={ready} onNext={() => go(index + 1)} />
            </StepScroll>
          ) : detail ? (
            <StepScroll bottom={bottom}>
              <StepTitle
                eyebrow={
                  index >= MAIN
                    ? `More details · ${index - MAIN + 1} of ${STEPS.length - MAIN}`
                    : undefined
                }
                title={detail.title}
                sub={`${detail.sub} All optional.`}
              />
              <DetailFields
                page={detail.key}
                value={state.advanced}
                onChange={(advanced) => update({ advanced })}
                goodForNote={state.goodForNote}
                onGoodForNote={(goodForNote) => update({ goodForNote })}
              />
              <View style={{ flex: 1 }} />
              <Actions
                onPreview={preview}
                ready={ready}
                onNext={last ? undefined : () => go(index + 1)}
              />
            </StepScroll>
          ) : null}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Preview and Next side by side at the same size, Next on the right (where the swipe leads). */
function Actions(props: { onPreview(): void; ready: boolean; onNext?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Button
        label="Preview"
        disabled={!props.ready}
        onPress={props.onPreview}
        style={{ flex: 1, minHeight: 50 }}
      />
      {props.onNext ? (
        <Button
          label="Next"
          kind="secondary"
          onPress={props.onNext}
          style={{ flex: 1, minHeight: 50 }}
        />
      ) : null}
    </View>
  );
}

function StepTitle({ title, sub, eyebrow }: { title: string; sub: string; eyebrow?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.sm, paddingTop: space.xl, paddingBottom: space.sm }}>
      {eyebrow ? (
        <Text style={[type.label, { color: t.muted, textTransform: 'uppercase' }]}>{eyebrow}</Text>
      ) : null}
      <Text accessibilityRole="header" style={[type.display, { color: t.ink }]}>
        {title}
      </Text>
      <Text style={[type.body, { color: t.muted }]}>{sub}</Text>
    </View>
  );
}

function StepScroll({ children, bottom }: { children: React.ReactNode; bottom: number }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: space.lg,
        paddingBottom: bottom,
        gap: space.xl,
      }}
    >
      {children}
    </ScrollView>
  );
}

/** Thin bars: the three main steps, or the detail pages. */
function Progress({ count, index }: { count: number; index: number }) {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={`Step ${index + 1} of ${count}`}
      style={{ flexDirection: 'row', gap: 6, paddingHorizontal: space.lg, paddingTop: space.sm }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: i <= index ? t.ink : t.divider,
          }}
        />
      ))}
    </View>
  );
}
