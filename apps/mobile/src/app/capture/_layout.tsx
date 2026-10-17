import { Icon } from '../../ui/icon';
import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';
import { CaptureProvider } from '../../capture/context';
import { useTheme } from '../../theme/tokens';

/**
 * Capture → review crop → confirm pin → notes → preview & publish.
 * Gallery import (D-28): import batch → frame (crop) → the same pin → notes → publish.
 */
export default function CaptureLayout() {
  const t = useTheme();
  return (
    <CaptureProvider>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: t.canvas },
          headerTintColor: t.ink,
          contentStyle: { backgroundColor: t.canvas },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}
        />
        <Stack.Screen
          name="review"
          options={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}
        />
        <Stack.Screen
          name="import"
          options={{
            title: 'Import photos',
            // Closes the whole capture modal; unfinished photos stay listed in Profile.
            headerLeft: () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={() => router.dismissTo('/profile')}
              >
                <Icon name="close" size={26} color={t.ink} />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen
          name="crop"
          options={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}
        />
        <Stack.Screen name="pin" options={{ title: 'Confirm location' }} />
        <Stack.Screen name="details" options={{ title: 'Scouting notes' }} />
        <Stack.Screen name="publish" options={{ title: 'Preview' }} />
      </Stack>
    </CaptureProvider>
  );
}
