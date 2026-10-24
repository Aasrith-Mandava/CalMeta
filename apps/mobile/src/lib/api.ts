import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * API base URL. EXPO_PUBLIC_API_URL wins; otherwise use the machine running Metro
 * on port 8787, which works for simulators and for phones on the same Wi-Fi.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:8787`;
}

export const API_URL = resolveApiUrl();

let currentUserId: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Set by the session provider; every request then carries `x-user-id`. */
export function setApiUser(id: string | null, handleUnauthorized: (() => void) | null = null) {
  currentUserId = id;
  onUnauthorized = handleUnauthorized;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Typed fetch against the API. Response types come from @200h/shared. */
export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const sentAs = currentUserId;
  const res = await fetch(API_URL + path, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      'content-type': 'application/json',
      ...(sentAs ? { 'x-user-id': sentAs } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => null);
  // The saved user no longer exists (e.g. the DB was reset): sign out.
  if (res.status === 401 && sentAs && sentAs === currentUserId) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `Request failed (${res.status})`);
  return data as T;
}

export interface Query<T> {
  data: T | undefined;
  error: Error | undefined;
  reload: () => Promise<void>;
}

/**
 * Loads `path` whenever the screen gains focus, and every `pollMs` while focused.
 * Deliberately tiny; swap for TanStack Query if caching needs grow.
 */
export function useApi<T>(path: string, { pollMs }: { pollMs?: number } = {}): Query<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();

  const reload = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      reload();
      if (!pollMs) return;
      const id = setInterval(reload, pollMs);
      return () => clearInterval(id);
    }, [reload, pollMs]),
  );

  return { data, error, reload };
}
