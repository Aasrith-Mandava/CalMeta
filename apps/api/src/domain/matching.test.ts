import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Interest } from '@200h/shared';

import { rankCrews, rankPeople, scoreCrew, type CrewCandidate, type Seeker } from './matching';

const alex: Seeker = { interests: ['climbing', 'tacos'], availability: ['weeknights'] };
const crew = (overrides: Partial<CrewCandidate>): CrewCandidate => ({
  id: 'c',
  activity: 'climbing',
  slot: 'weeknights',
  size: 8,
  memberCount: 3,
  ...overrides,
});

test('full crews and crews outside your free time are excluded', () => {
  assert.equal(scoreCrew(alex, crew({ memberCount: 8 })), null);
  assert.equal(scoreCrew(alex, crew({ slot: 'weekend_am' })), null);
});

test('a shared interest outranks everything else', () => {
  const ranked = rankCrews(alex, [
    crew({ id: 'games', activity: 'board_games', memberCount: 5 }),
    crew({ id: 'climb', activity: 'climbing', memberCount: 1 }),
  ]);
  assert.deepEqual(
    ranked.map((c) => c.id),
    ['climb', 'games'],
  );
});

test('discover puts the most shared interests first', () => {
  const ranked = rankPeople<{ id: string; interests: Interest[] }>(alex.interests, [
    { id: 'a', interests: ['yoga'] },
    { id: 'b', interests: ['climbing', 'tacos'] },
  ]);
  assert.equal(ranked[0]?.id, 'b');
});
