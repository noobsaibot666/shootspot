import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useScope } from '../../lib/scope';
import { useSession } from '../../lib/session';
import { useTheme } from '../../theme/tokens';

/**
 * iOS quick actions (widgets, Control Center, Siri) open `shootspot://quick/scout` or
 * `shootspot://quick/nearby` (native side: apps/mobile/targets/widget).
 *
 * Signed out, offline or mid-onboarding goes through the usual gate. Otherwise Scout opens the
 * camera: on top of whatever is open, or over the Feed when the app was launched by the action,
 * so closing the camera lands somewhere. Nearby opens the Feed scoped to the member's location.
 */
export default function QuickAction() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const { state } = useSession();
  const { setScope } = useScope();
  const t = useTheme();
  const ready = state.status === 'signed-in' && state.me.onboarded;

  useEffect(() => {
    if (!ready) return;
    if (action === 'scout') {
      if (router.canGoBack()) {
        router.replace('/capture');
      } else {
        router.replace('/feed');
        router.push('/capture');
      }
      return;
    }
    if (action === 'nearby') setScope({ mode: 'nearby' });
    router.dismissTo('/feed');
  }, [ready, action, setScope]);

  if (state.status === 'signed-in' && !state.me.onboarded) return <Redirect href="/onboarding" />;
  if (state.status !== 'signed-in' && state.status !== 'loading') return <Redirect href="/" />;
  return <View style={{ flex: 1, backgroundColor: t.canvas }} />;
}
