import { Tabs, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../../lib/motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '../../ui';
import { ChromeProvider, useChrome } from '../../ui/chrome';
import { Icon, type IconName } from '../../ui/icon';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Tab width and the distance between tab origins (width + pill gap). */
const TAB_W = 64;
const STEP = TAB_W + 4;

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  feed: { label: 'Feed', icon: 'feed', active: 'feed.fill' },
  map: { label: 'Map', icon: 'map', active: 'map.fill' },
  profile: { label: 'Profile', icon: 'profile', active: 'profile.fill' },
};

/** Feed · Map · Profile in a floating icon pill, plus the round Camera button (D-17). */
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
 * (never colour alone). The camera button sits beside it. While the feed scrolls down, the pill
 * drops first and the camera follows (staggered spring, see ui/chrome). Gallery import lives in
 * the camera (bottom-left) and in the Profile menu.
 */
function FloatingBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { hidden, hiddenLate } = useChrome();
  const drop = (v: Animated.Value) => ({
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 130] }) }],
  });
  const routes = state.routes.filter((r) => TABS[r.name]);

  // The selected backplate slides to the tapped tab (spring), instead of jumping.
  const activeIndex = Math.max(
    0,
    routes.findIndex((r) => r.key === state.routes[state.index]?.key),
  );
  const reduce = useReduceMotion();
  const slide = useRef(new Animated.Value(activeIndex * STEP)).current;
  useEffect(() => {
    if (reduce) slide.setValue(activeIndex * STEP);
    else
      Animated.spring(slide, {
        toValue: activeIndex * STEP,
        tension: 170,
        friction: 18,
        useNativeDriver: true,
      }).start();
  }, [activeIndex, reduce, slide]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 12 }]}>
      <Animated.View style={[styles.pill, drop(hidden)]} accessibilityRole="tablist">
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { transform: [{ translateX: slide }] }]}
        />
        {routes.map((route) => {
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
              style={styles.tab}
            >
              <Icon name={focused ? tab.active : tab.icon} size={24} color="#FFFFFF" />
            </Tap>
          );
        })}
      </Animated.View>
      <Animated.View style={drop(hiddenLate)}>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Capture a location"
          onPress={() => router.push('/capture')}
          scaleTo={0.92}
          style={styles.camera}
        >
          <Icon name="camera.fill" size={28} color="#111111" />
        </Tap>
      </Animated.View>
    </View>
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
    backgroundColor: 'rgba(24,24,24,0.94)',
    borderRadius: 999,
    padding: 6,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tab: {
    width: TAB_W,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: TAB_W,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
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
