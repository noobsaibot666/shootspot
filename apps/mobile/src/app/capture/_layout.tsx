import { Stack } from 'expo-router';
import { CaptureProvider } from '../../capture/context';
import { useTheme } from '../../theme/tokens';

/** Capture → review crop → confirm pin → notes → preview & publish. */
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
        <Stack.Screen name="pin" options={{ title: 'Confirm location' }} />
        <Stack.Screen name="details" options={{ title: 'Scouting notes' }} />
        <Stack.Screen name="publish" options={{ title: 'Preview' }} />
      </Stack>
    </CaptureProvider>
  );
}
