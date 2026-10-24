import type { ConnectResult } from '@200h/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Body, Button, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

// Opened by a tapped tag's deep link: twohundredhours://connect/<code>.

export default function RedeemFromLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { userId } = useSession();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!userId || !code) return;
    api<ConnectResult>('/connect/redeem', { body: { code } })
      .then((result) => router.replace(`/friend/${result.user.id}`))
      .catch((e) => setError(errorMessage(e)));
  }, [userId, code]);

  if (!userId) return <Redirect href="/onboarding" />;

  return (
    <Screen edges={['bottom']}>
      {error ? (
        <>
          <Body>{error}</Body>
          <Button title="Back home" onPress={() => router.replace('/home')} />
        </>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </Screen>
  );
}
