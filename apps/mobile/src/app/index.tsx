import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../lib/session';
import { Body, Button, Screen, Title } from '../ui';
import { useTheme } from '../theme/tokens';

/** Session gate: sign-in → onboarding (age, consents) → home. */
export default function Gate() {
  const { state, refresh } = useSession();
  const t = useTheme();
  if (state.status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.canvas,
        }}
      >
        <ActivityIndicator color={t.ink} />
      </View>
    );
  }
  if (state.status === 'offline') {
    return (
      <Screen>
        <Title sub="ShootSpot can't reach its server. Check your connection.">You're offline</Title>
        <Body muted>
          Photos you capture are kept on this phone and sent when you're back online.
        </Body>
        <Button label="Try again" onPress={() => void refresh()} />
      </Screen>
    );
  }
  if (state.status === 'signed-out') return <Redirect href="/sign-in" />;
  if (!state.me.onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/feed" />;
}
