import type { Interest, Slot } from '@200h/shared';

// Pure ranking logic (no DB), so it is easy to test and tune.

export interface Seeker {
  interests: Interest[];
  availability: Slot[];
}

export interface CrewCandidate {
  id: string;
  activity: Interest;
  slot: Slot;
  size: number;
  memberCount: number;
}

/**
 * How good a crew is for someone, or null if it can't work (full, or meets when they're busy).
 * A shared interest dominates; then prefer crews that already have people but still have room.
 */
export function scoreCrew(seeker: Seeker, crew: CrewCandidate): number | null {
  if (crew.memberCount >= crew.size) return null;
  if (!seeker.availability.includes(crew.slot)) return null;
  const interest = seeker.interests.includes(crew.activity) ? 10 : 0;
  const momentum = Math.min(crew.memberCount, 2);
  const room = (crew.size - crew.memberCount) / crew.size;
  return interest + momentum + room;
}

export function rankCrews<T extends CrewCandidate>(seeker: Seeker, crews: T[]): T[] {
  return crews
    .map((crew) => ({ crew, score: scoreCrew(seeker, crew) }))
    .filter((x): x is { crew: T; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.crew);
}

/** Discover ordering: most shared interests first. */
export function rankPeople<T extends { interests: Interest[] }>(mine: Interest[], people: T[]): T[] {
  const overlap = (p: T) => p.interests.filter((i) => mine.includes(i)).length;
  return [...people].sort((a, b) => overlap(b) - overlap(a));
}
