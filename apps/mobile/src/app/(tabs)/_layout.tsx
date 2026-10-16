import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChromeProvider, useChrome } from '../../ui/chrome';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }
> = {
  feed: { label: 'Feed', icon: 'images-outline', active: 'images' },
  map: { label: 'Map', icon: 'map-outline', active: 'map' },
  profile: { label: 'Profile', icon: 'person-outline', active: 'person' },
};

/** Feed · Map · Profile + a separate round Camera action (D-17). */
export default function TabsLayout() {
  return (
    <ChromeProvider>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingBar {...props} />}>
        <Tabs.Screen name="feed" />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </ChromeProvider>
  );
}

/**
 * Compact dark pill (the reference's visual inspiration) with labelled single-weight icons; the
 * selected tab is marked by a filled icon and a backplate, not by colour alone. An opaque-enough
 * backplate keeps it legible over bright and dark photos.
 */
function FloatingBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { hidden } = useChrome();
  const translateY = hidden.interpolate({ inputRange: [0, 1], outputRange: [0, 120] });
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 12, transform: [{ translateY }] }]}
    >
      <View style={styles.pill} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={[styles.tab, focused && styles.tabActive]}
            >
              <Ionicons name={focused ? tab.active : tab.icon} size={22} color="#FFFFFF" />
              <Text style={[styles.label, focused && { opacity: 1 }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Capture a location"
        onPress={() => router.push('/capture')}
        style={({ pressed }) => [styles.camera, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <Ionicons name="camera" size={26} color="#111111" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17,17,17,0.92)',
    borderRadius: 999,
    padding: 6,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tab: {
    minWidth: 72,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
  },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  label: { color: '#FFFFFF', fontSize: 11, fontWeight: '600', opacity: 0.75 },
  camera: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.2)',
  },
});
