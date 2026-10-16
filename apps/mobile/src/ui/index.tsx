import { Icon, type IconName } from './icon';
import { createContext, useContext, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '../lib/motion';
import { font, motion, radius, space, type, useTheme } from '../theme/tokens';

/**
 * Building blocks: flat, monochrome and consistent (one type scale, one radius set, pill
 * buttons, borderless inputs). Photos carry the colour.
 */

export function Screen(props: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const t = useTheme();
  const body = (
    <View style={{ padding: props.padded === false ? 0 : space.lg, gap: space.lg, flexGrow: 1 }}>
      {props.children}
    </View>
  );
  return (
    // Top edge: header-less screens (sign-in, onboarding) clear the status bar; under a native
    // header the measured top inset is 0, so it adds nothing there.
    <SafeAreaView style={{ flex: 1, backgroundColor: t.canvas }} edges={['top', 'left', 'right']}>
      {props.scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: space.xxl * 2 }}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text accessibilityRole="header" style={[type.display, { color: t.ink }]}>
        {children}
      </Text>
      {sub ? <Text style={[type.body, { color: t.muted }]}>{sub}</Text> : null}
    </View>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[type.headline, { color: t.ink }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text style={[type.body, { color: muted ? t.muted : t.ink }]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={[type.label, { color: t.muted, textTransform: 'uppercase' }]}>{children}</Text>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: object }) {
  const t = useTheme();
  return (
    <Text
      style={[
        { color: t.inkSecondary, fontFamily: font.mono, fontSize: 12, lineHeight: 17 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Pressable with a gentle scale-down on press (tiles, buttons, rows). */
export function Tap(
  props: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; scaleTo?: number },
) {
  const { style, scaleTo = 0.97, children, ...rest } = props;
  const scale = useRef(new Animated.Value(1)).current;
  const reduce = useReduceMotion();
  const to = (v: number) =>
    reduce
      ? undefined
      : Animated.spring(scale, {
          toValue: v,
          useNativeDriver: true,
          speed: 40,
          bounciness: 0,
        }).start();
  // The pressable itself is animated, so layout styles (flex, margins) apply where callers expect.
  return (
    <AnimatedPressable
      {...rest}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
        to(scaleTo);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
        to(1);
        rest.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button(props: {
  label: string;
  onPress(): void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  icon?: IconName;
  size?: 'regular' | 'small';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const kind = props.kind ?? 'primary';
  const bg =
    kind === 'primary'
      ? t.ink
      : kind === 'danger'
        ? t.signalRed
        : kind === 'secondary'
          ? t.surface
          : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? t.onInk : t.ink;
  const off = props.disabled || props.busy;
  const small = props.size === 'small';
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!off, busy: !!props.busy }}
      onPress={props.onPress}
      disabled={off}
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: off ? 0.45 : 1 },
        props.style ?? {},
      ]}
    >
      {props.busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {props.icon ? <Icon name={props.icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[small ? type.bodyStrong : type.headline, { color: fg }]}>
            {props.label}
          </Text>
        </View>
      )}
    </Tap>
  );
}

/** Round icon button; `overlay` for use on top of photos. */
export function IconButton(props: {
  icon: IconName;
  label: string;
  onPress(): void;
  overlay?: boolean;
  size?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const size = props.size ?? 44;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitSlop={8}
      onPress={props.onPress}
      scaleTo={0.9}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: props.overlay ? 'rgba(10,10,10,0.6)' : 'transparent',
        },
        props.style ?? {},
      ]}
    >
      <Icon
        name={props.icon}
        size={Math.round(size * 0.5)}
        color={props.overlay ? '#FFFFFF' : t.ink}
      />
    </Tap>
  );
}

export function Field(
  props: TextInputProps & { label: string; hint?: string; error?: string | null },
) {
  const t = useTheme();
  const { label, hint, error, style, ...input } = props;
  return (
    <View style={{ gap: space.sm }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        style={[
          styles.input,
          type.body,
          {
            color: t.ink,
            backgroundColor: t.surface,
            borderColor: error ? t.signalRed : 'transparent',
          },
          style,
        ]}
        {...input}
      />
      {error ? (
        <Text style={[type.caption, { color: t.signalRed }]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.caption, { color: t.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Chip(props: { label: string; selected: boolean; onPress(): void }) {
  const t = useTheme();
  return (
    <Tap
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      // 36 pt chip + slop = 44 pt touch target.
      hitSlop={4}
      scaleTo={0.95}
      style={[
        styles.chip,
        {
          backgroundColor: props.selected ? t.ink : 'transparent',
          borderColor: props.selected ? t.ink : t.divider,
        },
      ]}
    >
      <Text style={[type.caption, { color: props.selected ? t.onInk : t.ink, fontWeight: '600' }]}>
        {props.label}
      </Text>
    </Tap>
  );
}

export function Row(props: { children: React.ReactNode; wrap?: boolean; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          flexWrap: props.wrap ? 'wrap' : 'nowrap',
        },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.surface, borderRadius: radius.card, padding: space.lg, gap: space.md },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A settings/menu row: icon, label, optional value or trailing control, chevron. */
export function ListRow(props: {
  icon?: IconName;
  label: string;
  value?: string;
  danger?: boolean;
  trailing?: React.ReactNode;
  onPress?(): void;
}) {
  const t = useTheme();
  const color = props.danger ? t.signalRed : t.ink;
  const content = (
    <View style={styles.listRow}>
      {props.icon ? <Icon name={props.icon} size={22} color={color} /> : null}
      <Text style={[type.headline, { color, flex: 1, fontWeight: '500' }]}>{props.label}</Text>
      {props.value ? <Text style={[type.body, { color: t.muted }]}>{props.value}</Text> : null}
      {props.trailing ?? (props.onPress ? <Icon name="forward" size={18} color={t.muted} /> : null)}
    </View>
  );
  return props.onPress ? (
    <Tap accessibilityRole="button" onPress={props.onPress} scaleTo={0.98}>
      {content}
    </Tap>
  ) : (
    content
  );
}

/** Initials avatar (no profile photos in V1). */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '·';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.raised,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: t.ink, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/** Underlined text tabs (Profile: Locations / Projects). */
export function TextTabs<K extends string>(props: {
  tabs: { key: K; label: string }[];
  value: K;
  onChange(k: K): void;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: space.xl }}>
      {props.tabs.map((tab) => {
        const on = tab.key === props.value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => props.onChange(tab.key)}
            hitSlop={8}
            style={{ paddingVertical: space.sm }}
          >
            <Text style={[type.headline, { color: on ? t.ink : t.muted }]}>{tab.label}</Text>
            <View
              style={{
                height: 2,
                marginTop: 6,
                borderRadius: 1,
                backgroundColor: on ? t.ink : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom sheet with a slide-up animation (capture menu, small choices). */
export function Sheet(props: { visible: boolean; onClose(): void; children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const y = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (props.visible)
      Animated.timing(y, {
        toValue: 0,
        duration: reduce ? 0 : motion.base,
        useNativeDriver: true,
      }).start();
    else y.setValue(1);
  }, [props.visible, reduce, y]);
  const close = () =>
    Animated.timing(y, {
      toValue: 1,
      duration: reduce ? 0 : motion.fast,
      useNativeDriver: true,
    }).start(() => props.onClose());
  return (
    <Modal
      transparent
      visible={props.visible}
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(0,0,0,0.5)',
            opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          },
        ]}
      >
        <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <Animated.View
        // Screen readers stay inside the sheet while it's open; the scrim is a "Close" button.
        accessibilityViewIsModal
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: t.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingTop: space.sm,
          paddingBottom: insets.bottom + space.md,
          transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }],
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: t.divider,
            marginBottom: space.sm,
          }}
        />
        <SheetContext close={close}>{props.children}</SheetContext>
      </Animated.View>
    </Modal>
  );
}

const SheetCtx = createContext<(() => void) | null>(null);
function SheetContext({ close, children }: { close(): void; children: React.ReactNode }) {
  return <SheetCtx.Provider value={close}>{children}</SheetCtx.Provider>;
}
/** A sheet action: closes the sheet, then runs. */
export function SheetAction(props: { icon: IconName; label: string; onPress(): void }) {
  const close = useContext(SheetCtx);
  return (
    <View style={{ paddingHorizontal: space.sm }}>
      <ListRow
        icon={props.icon}
        label={props.label}
        trailing={<View />}
        onPress={() => {
          close?.();
          setTimeout(props.onPress, motion.fast);
        }}
      />
    </View>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="alert" style={[type.body, { color: t.signalRed }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: space.lg },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    minHeight: 56,
    paddingHorizontal: space.lg,
  },
});
