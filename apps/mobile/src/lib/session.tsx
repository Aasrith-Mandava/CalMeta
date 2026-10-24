import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { setApiUser } from './api';

// Who is signed in. Hackathon auth: just a user id, remembered on the device.

const STORAGE_KEY = '200h.userId';

interface Session {
  userId: string | null;
  signIn: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const signOut = async () => {
    setApiUser(null);
    setUserId(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  const signIn = async (id: string) => {
    setApiUser(id, signOut);
    setUserId(id);
    await AsyncStorage.setItem(STORAGE_KEY, id);
  };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) {
          setApiUser(saved, signOut);
          setUserId(saved);
        }
      })
      .catch(() => {}) // unreadable storage: start signed out
      .finally(() => setReady(true));
  }, []);

  // Render nothing until the saved user is known, so no screen fetches as "signed out" first.
  if (!ready) return null;
  return <SessionContext value={{ userId, signIn, signOut }}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}
