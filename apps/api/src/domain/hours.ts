import { and, eq, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { db } from '../db/client';
import { attendance, sessions, tapMoments } from '../db/schema';

// Shared crew check-ins and mutually completed First 20 moments contribute time.

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
  const hours = new Map(rows.map((r) => [r.otherId, Number(r.minutes) / 60]));
  // Only completed moments have two receipts. Pending/active/cancelled taps earn nothing.
  const moments = await db.select().from(tapMoments).where(and(
    eq(tapMoments.status, 'completed'),
    or(eq(tapMoments.hostId, userId), eq(tapMoments.guestId, userId)),
  ));
  for (const moment of moments) {
    const otherId = moment.hostId === userId ? moment.guestId : moment.hostId;
    hours.set(otherId, (hours.get(otherId) ?? 0) + moment.durationMinutes / 60);
  }
  return hours;
}

export async function hoursBetween(a: string, b: string): Promise<number> {
  return (await hoursWithEveryone(a)).get(b) ?? 0;
}
