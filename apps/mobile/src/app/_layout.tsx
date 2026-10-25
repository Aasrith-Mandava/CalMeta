import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/lib/session';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding/crew" options={{ title: 'Your crew' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[crewId]" options={{ title: 'Crew chat' }} />
        <Stack.Screen name="friend/[userId]" options={{ title: '' }} />
        <Stack.Screen name="crew/new" options={{ title: 'Start a crew' }} />
        <Stack.Screen name="crew/[crewId]" options={{ title: 'Crew' }} />
        <Stack.Screen name="connect/index" options={{ title: 'Your first chapter', presentation: 'modal' }} />
        <Stack.Screen name="connect/[code]" options={{ title: 'Connecting' }} />
        <Stack.Screen name="moment/[id]" options={{ title: 'Your first chapter' }} />
      </Stack>
    </SessionProvider>
  );
}
