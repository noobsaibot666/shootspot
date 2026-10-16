import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listImports, pickPhotos } from '../../lib/imports';
import { Sheet, SheetAction, Tap } from '../../ui';
import { ChromeProvider, useChrome } from '../../ui/chrome';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }
> = {
  feed: { label: 'Feed', icon: 'home-outline', active: 'home' },
  map: { label: 'Map', icon: 'map-outline', active: 'map' },
  profile: { label: 'Profile', icon: 'person-circle-outline', active: 'person-circle' },
};

/** Feed · Map · + · Profile in one floating icon pill (Savee-style; D-17 updated 2026-10-16). */
export default function TabsLayout() {
  return (
    <ChromeProvider>
      <Tabs
        screenOptions={{ headerShown: false, animation: 'fade' }}
        tabBar={(props) => <FloatingBar {...props} />}
      >
        <Tabs.Screen name="feed" />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </ChromeProvider>
  );
}

/**
 * Dark pill with single-weight icons; the selected tab gets a soft backplate and a filled icon
 * (never colour alone). "+" opens a small sheet: take a photo, or import from the gallery.
 */
function FloatingBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { hidden } = useChrome();
  const [sheet, setSheet] = useState(false);
  const translateY = hidden.interpolate({ inputRange: [0, 1], outputRange: [0, 120] });
  const routes = state.routes.filter((r) => TABS[r.name]);
  const button = (route: (typeof routes)[number]) => {
    const tab = TABS[route.name]!;
    const focused = state.routes[state.index]?.key === route.key;
    return (
      <Tap
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={tab.label}
        onPress={() => {
          if (!focused) navigateToTab(route.key);
        }}
        scaleTo={0.9}
        style={[styles.tab, focused && styles.tabActive]}
      >
        <Ionicons name={focused ? tab.active : tab.icon} size={24} color="#FFFFFF" />
      </Tap>
    );
  };

  async function importPhotos() {
    const pending = (await listImports()).some((i) => i.state === 'todo');
    if ((await pickPhotos().catch(() => 0)) > 0 || pending) router.push('/capture/import');
  }

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.wrap, { bottom: insets.bottom + 12, transform: [{ translateY }] }]}
      >
        <View style={styles.pill} accessibilityRole="tablist">
          {routes.slice(0, 2).map(button)}
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Add a location"
            onPress={() => setSheet(true)}
            scaleTo={0.9}
            style={styles.tab}
          >
            <Ionicons name="add" size={30} color="#FFFFFF" />
          </Tap>
          {routes.slice(2).map(button)}
        </View>
      </Animated.View>
      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <SheetAction
          icon="camera-outline"
          label="Take a photo"
          onPress={() => router.push('/capture')}
        />
        <SheetAction
          icon="images-outline"
          label="Import from gallery"
          onPress={() => void importPhotos()}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(24,24,24,0.94)',
    borderRadius: 999,
    padding: 6,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tab: {
    width: 60,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
});
