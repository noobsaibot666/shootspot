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
import { MoreDetails, Pill, PillInput, TagPicker } from '../../ui/notes';

const STEPS = ['name', 'goodFor', 'light', 'more'] as const;
type Step = (typeof STEPS)[number];
const EASE = Easing.out(Easing.cubic);

/**
 * Scouting notes as steps (D-38): one question per screen, each confirmed with a tap or a swipe.
 * Name (prefilled from the pin) → Good for → Best light → optional more details → preview. The
 * camera direction is never asked: it comes from the compass at capture (or the photo's data).
 */
export default function Details() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { state, update } = useCapture();
  const [step, setStep] = useState<Step>('name');
  const index = STEPS.indexOf(step);
  // +1 forward, -1 back: read by the enter/exit animations on the UI thread.
  const dir = useSharedValue(1);

  const ok: Record<Step, boolean> = {
    name: state.label.trim().length > 0,
    goodFor: state.goodFor.length > 0,
    light: state.bestLight.length > 0,
    more: true,
  };
  const ready = ok.name && ok.goodFor && ok.light;

  function go(to: number) {
    const next = STEPS[to];
    if (!next || to === index) return;
    if (to > index && !ok[step]) return;
    dir.value = to > index ? 1 : -1;
    haptics.light();
    setStep(next);
  }
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

  const preview = () => {
    if (!ready) return;
    router.push('/capture/publish');
  };

  // Swipe left for the next step, right for the previous one (no extra native module needed).
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -60 || g.vx < -0.5) goRef.current(Math.min(indexRef.current + 1, 2));
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Progress index={Math.min(index, 2)} done={step === 'more'} />
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
              <Button label="Confirm" disabled={!ok.name} onPress={() => go(1)} />
            </View>
          ) : step === 'goodFor' ? (
            <StepScroll bottom={bottom}>
              <StepTitle title="Good for" sub="Up to 8. What would you shoot here?" />
              <TagPicker
                kind="good_for"
                selected={state.goodFor}
                onChange={(goodFor) => update({ goodFor })}
                max={8}
              />
              <View style={{ flex: 1 }} />
              <Button label="Confirm" disabled={!ok.goodFor} onPress={() => go(2)} />
            </StepScroll>
          ) : step === 'light' ? (
            <StepScroll bottom={bottom}>
              <StepTitle title="Best light" sub="When does this place look its best?" />
              <TagPicker
                kind="best_light"
                selected={state.bestLight}
                onChange={(bestLight) => update({ bestLight })}
              />
              <PillInput
                value={state.bestLightNote}
                onChangeText={(bestLightNote) => update({ bestLightNote })}
                maxLength={200}
                placeholder="Light note (optional)"
                accessibilityLabel="Light note (optional)"
              />
              <View style={{ flex: 1 }} />
              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                <Pill label="More details" onPress={() => go(3)} />
                <Button
                  label="Preview"
                  disabled={!ready}
                  onPress={preview}
                  style={{ flex: 1, minHeight: 50 }}
                />
              </View>
            </StepScroll>
          ) : (
            <StepScroll bottom={bottom}>
              <StepTitle
                title="More details"
                sub="All optional. Access, rules and tips help others plan a shoot."
              />
              <MoreDetails
                value={state.advanced}
                onChange={(advanced) => update({ advanced })}
                goodForNote={state.goodForNote}
                onGoodForNote={(goodForNote) => update({ goodForNote })}
              />
              <Button label="Preview" disabled={!ready} onPress={preview} />
            </StepScroll>
          )}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.sm, paddingTop: space.xl, paddingBottom: space.lg }}>
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

/** Three thin bars: name, good for, best light. */
function Progress({ index, done }: { index: number; done: boolean }) {
  const t = useTheme();
  return (
    <View
      accessibilityLabel={`Step ${index + 1} of 3`}
      style={{ flexDirection: 'row', gap: 6, paddingHorizontal: space.lg, paddingTop: space.sm }}
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: done || i <= index ? t.ink : t.divider,
          }}
        />
      ))}
    </View>
  );
}
