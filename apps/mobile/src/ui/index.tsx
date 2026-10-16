import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, radius, space, useTheme } from '../theme/tokens';

/** Small, restrained building blocks (design spec §2: flat, thin borders, calm). */

export function Screen(props: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const t = useTheme();
  const body = (
    <View style={{ padding: props.padded === false ? 0 : space.lg, gap: space.lg, flexGrow: 1 }}>
      {props.children}
    </View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.canvas }} edges={['top', 'left', 'right']}>
      {props.scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: space.xxl }}
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
      <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 24, fontWeight: '700' }}>
        {children}
      </Text>
      {sub ? <Text style={{ color: t.muted, fontSize: 15, lineHeight: 21 }}>{sub}</Text> : null}
    </View>
  );
}

export function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  const t = useTheme();
  return (
    <Text style={{ color: muted ? t.muted : t.ink, fontSize: 15, lineHeight: 21 }}>{children}</Text>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 13, fontWeight: '600' }}>{children}</Text>;
}

export function Mono({ children, style }: { children: React.ReactNode; style?: object }) {
  const t = useTheme();
  return (
    <Text style={[{ color: t.inkSecondary, fontFamily: font.mono, fontSize: 12 }, style]}>
      {children}
    </Text>
  );
}

export function Button(props: {
  label: string;
  onPress(): void;
  kind?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const kind = props.kind ?? 'primary';
  const bg = kind === 'primary' ? t.ink : kind === 'danger' ? t.signalRed : 'transparent';
  const fg = kind === 'secondary' ? t.ink : t.onInk;
  const off = props.disabled || props.busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!props.busy }}
      onPress={props.onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: kind === 'secondary' ? t.divider : bg,
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
        },
        props.style,
      ]}
    >
      {props.busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function Field(
  props: TextInputProps & { label: string; hint?: string; error?: string | null },
) {
  const t = useTheme();
  const { label, hint, error, style, ...input } = props;
  return (
    <View style={{ gap: space.xs }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        style={[
          styles.input,
          { color: t.ink, backgroundColor: t.raised, borderColor: error ? t.signalRed : t.divider },
          style,
        ]}
        {...input}
      />
      {error ? (
        <Text style={{ color: t.signalRed, fontSize: 13 }}>{error}</Text>
      ) : hint ? (
        <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Chip(props: { label: string; selected: boolean; onPress(): void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      style={[
        styles.chip,
        {
          backgroundColor: props.selected ? t.ink : 'transparent',
          borderColor: props.selected ? t.ink : t.divider,
        },
      ]}
    >
      {props.selected ? <Ionicons name="checkmark" size={14} color={t.onInk} /> : null}
      <Text style={{ color: props.selected ? t.onInk : t.ink, fontSize: 14 }}>{props.label}</Text>
    </Pressable>
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
        {
          backgroundColor: t.surface,
          borderColor: t.divider,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space.lg,
          gap: space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="alert" style={{ color: t.signalRed, fontSize: 14 }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
