// Friendship-hours rules. Source: Jeffrey Hall (2018), "How many hours does it
// take to make a friend?": ~50h → casual friend, ~90h → friend, 200h+ → close friend.

import type { FriendLevel, Progress } from './schemas';

export const THRESHOLDS = { casual: 50, friend: 90, close: 200 } as const;

const MILESTONES = [THRESHOLDS.casual, THRESHOLDS.friend, THRESHOLDS.close];

export const LEVEL_LABELS: Record<FriendLevel, string> = {
  new: 'New',
  casual: 'Casual friend',
  friend: 'Friend',
  close: 'Close friend',
};

export function levelFor(hours: number): FriendLevel {
  if (hours >= THRESHOLDS.close) return 'close';
  if (hours >= THRESHOLDS.friend) return 'friend';
  if (hours >= THRESHOLDS.casual) return 'casual';
  return 'new';
}

export function nextThresholdFor(hours: number): number | null {
  return MILESTONES.find((t) => hours < t) ?? null;
}

/** Ring fill is hours over the next milestone ("52 of 90"); full once someone is a close friend. */
export function progressFor(hours: number): Progress {
  const next = nextThresholdFor(hours);
  return {
    hours: Math.round(hours * 10) / 10,
    level: levelFor(hours),
    nextThreshold: next,
    progress: next === null ? 1 : Math.max(0, hours) / next,
  };
}
