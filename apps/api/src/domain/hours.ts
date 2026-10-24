import { and, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { db } from '../db/client';
import { attendance, sessions } from '../db/schema';

// The friendship-hours engine. Today hours only come from crew sessions both people
// checked in to. Logged 1:1 hangouts ("food after climbing") are a natural next source.

/** Hours `userId` has spent with each other person, keyed by their id. */
export async function hoursWithEveryone(userId: string): Promise<Map<string, number>> {
  const me = alias(attendance, 'me');
  const them = alias(attendance, 'them');
  const rows = await db
    .select({ otherId: them.userId, minutes: sql<number>`sum(${sessions.durationMinutes})` })
    .from(me)
    .innerJoin(them, and(eq(them.sessionId, me.sessionId), ne(them.userId, me.userId)))
    .innerJoin(sessions, eq(sessions.id, me.sessionId))
    .where(and(eq(me.userId, userId), eq(me.status, 'checked_in'), eq(them.status, 'checked_in')))
    .groupBy(them.userId);
  return new Map(rows.map((r) => [r.otherId, Number(r.minutes) / 60]));
}

export async function hoursBetween(a: string, b: string): Promise<number> {
  return (await hoursWithEveryone(a)).get(b) ?? 0;
}
