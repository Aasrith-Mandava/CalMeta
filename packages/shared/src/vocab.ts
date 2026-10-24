// Fixed vocabularies used by onboarding, matching, and the AI prompts.
// Adding an interest here makes it available everywhere (chips, matching, AI tagging).

export const INTERESTS = [
  'climbing',
  'running',
  'board_games',
  'pickleball',
  'cooking',
  'hiking',
  'tacos',
  'live_music',
  'yoga',
  'cycling',
  'trivia',
  'coffee',
] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  climbing: 'Climbing',
  running: 'Running',
  board_games: 'Board games',
  pickleball: 'Pickleball',
  cooking: 'Cooking',
  hiking: 'Hiking',
  tacos: 'Tacos',
  live_music: 'Live music',
  yoga: 'Yoga',
  cycling: 'Cycling',
  trivia: 'Trivia',
  coffee: 'Coffee',
};

/** When someone is free. A crew's weekly time maps to exactly one slot. */
export const SLOTS = ['weeknights', 'weekend_am', 'weekend_pm'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  weeknights: 'Weeknights',
  weekend_am: 'Wknd AM',
  weekend_pm: 'Wknd PM',
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** dayOfWeek is 0 (Sun) – 6 (Sat); startTime is "HH:MM" in 24h. */
export function slotFor(dayOfWeek: number, startTime: string): Slot {
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return 'weeknights';
  const hour = Number(startTime.split(':')[0]);
  return hour < 12 ? 'weekend_am' : 'weekend_pm';
}

/** "Tue 7:00 PM" */
export function formatWeekly(dayOfWeek: number, startTime: string): string {
  const [h = 0, m = 0] = startTime.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${DAY_NAMES[dayOfWeek]} ${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// --- NFC / deep links -------------------------------------------------------
// A connect tag carries only a short-lived code, never the profile itself.
// The app scheme must match `scheme` in apps/mobile/app.json.

export const APP_SCHEME = 'twohundredhours';
const CONNECT_PREFIX = `${APP_SCHEME}://connect/`;

export function connectUrl(code: string): string {
  return CONNECT_PREFIX + code;
}

/** Returns the code from a connect URL, or null for anything else. */
export function parseConnectUrl(url: string): string | null {
  if (!url.startsWith(CONNECT_PREFIX)) return null;
  const code = url.slice(CONNECT_PREFIX.length).trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}
