import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resumeDrafts } from '../lib/drafts';
import { SessionProvider, useSession } from '../lib/session';
import { useTheme } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Navigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const t = useTheme();
  const scheme = useColorScheme();
  const { state } = useSession();
  const signedIn = state.status === 'signed-in';

  // Unsent drafts are retried whenever the app comes back to the foreground.
  useEffect(() => {
    if (!signedIn) return;
    void resumeDrafts();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void resumeDrafts();
    });
    return () => sub.remove();
  }, [signedIn]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: t.canvas },
          headerTintColor: t.ink,
          contentStyle: { backgroundColor: t.canvas },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen
          name="capture"
          options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
        />
        <Stack.Screen name="records/[id]" options={{ title: 'Location' }} />
      </Stack>
    </>
  );
}
