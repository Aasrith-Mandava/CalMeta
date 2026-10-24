import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';

import { useSession } from '@/lib/session';
import { colors } from '@/theme';

// Text-only tab bar, as in the wireframes.
export default function TabsLayout() {
  const { userId } = useSession();
  if (!userId) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
      }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
    </Tabs>
  );
}
