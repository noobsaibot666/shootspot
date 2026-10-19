import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resumeDrafts } from '../lib/drafts';
import { initSentry, withSentry } from '../lib/sentry';
import { ScopeProvider } from '../lib/scope';
import { VocabularyProvider } from '../lib/vocabulary';
import { SessionProvider, useSession } from '../lib/session';
import { useTheme } from '../theme/tokens';

initSentry();

export default withSentry(function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <VocabularyProvider>
          <ScopeProvider>
            <Navigator />
          </ScopeProvider>
        </VocabularyProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
});

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
          headerTitleStyle: { fontSize: 17, fontWeight: '600' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: t.canvas },
          // One consistent push transition on both platforms.
          animation: 'ios_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="capture"
          options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
        />
        {/* A slow, soft cross-fade (UI thread, both platforms); the photo is painted at once from
            the tile's cached image and settles in with a gentle scale. */}
        <Stack.Screen
          name="records/[id]"
          options={{ headerShown: false, animation: 'fade', animationDuration: 380 }}
        />
        <Stack.Screen name="projects/[id]" options={{ title: 'Project' }} />
        <Stack.Screen name="settings" options={{ title: 'Menu' }} />
        <Stack.Screen name="filters" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Edit notes', presentation: 'modal' }} />
        <Stack.Screen
          name="save/[id]"
          options={{ title: 'Save to project', presentation: 'modal' }}
        />
        <Stack.Screen name="report/[id]" options={{ title: 'Report', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
