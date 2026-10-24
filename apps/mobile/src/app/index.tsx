import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

export default function Index() {
  const { userId } = useSession();
  return <Redirect href={userId ? '/home' : '/onboarding'} />;
}
