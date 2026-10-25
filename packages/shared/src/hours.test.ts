import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatTogether, levelFor, progressFor } from './hours';
import { connectUrl, parseConnectUrl, slotFor } from './vocab';

test('levels follow the 50 / 90 / 200 hour milestones', () => {
  assert.equal(levelFor(0), 'new');
  assert.equal(levelFor(49.9), 'new');
  assert.equal(levelFor(50), 'casual');
  assert.equal(levelFor(90), 'friend');
  assert.equal(levelFor(200), 'close');
});

test('ring progress is hours over the next milestone', () => {
  assert.deepEqual(progressFor(52), { hours: 52, level: 'casual', nextThreshold: 90, progress: 52 / 90 });
  assert.equal(progressFor(250).progress, 1);
  assert.equal(progressFor(250).nextThreshold, null);
});

test('a first twenty-minute hangout stays visible in friendship progress', () => {
  assert.equal(formatTogether(progressFor(20 / 60).hours), '20m');
  assert.equal(formatTogether(52), '52h');
});

test('crew times map to availability slots', () => {
  assert.equal(slotFor(2, '19:00'), 'weeknights');
  assert.equal(slotFor(6, '08:30'), 'weekend_am');
  assert.equal(slotFor(0, '14:00'), 'weekend_pm');
});

test('connect URLs round-trip and reject foreign URLs', () => {
  assert.equal(parseConnectUrl(connectUrl('K7P2QX')), 'K7P2QX');
  assert.equal(parseConnectUrl('https://example.com/connect/K7P2QX'), null);
  assert.equal(parseConnectUrl(connectUrl('bad code!')), null);
});
