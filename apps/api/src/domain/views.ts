import {
  slotFor,
  type CrewSummary,
  type Interest,
  type PublicProfile,
  type SessionSummary,
} from '@200h/shared';
import { and, count, eq, gt, inArray, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db, newId } from '../db/client';
import { attendance, connections, crews, memberships, sessions, users } from '../db/schema';

// Shared lookups and row → wire-format mappers used across routes.

type UserRow = typeof users.$inferSelect;
export type CrewRow = typeof crews.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;

export function toProfile(u: UserRow): PublicProfile {
  return {
    id: u.id,
    name: u.name,
    photoUrl: u.photoUrl,
    city: u.city,
    interests: u.interests,
    prompt:
      u.promptQuestion && u.promptAnswer ? { question: u.promptQuestion, answer: u.promptAnswer } : null,
  };
}

export async function getUser(id: string): Promise<UserRow> {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw new HTTPException(404, { message: 'User not found' });
  return u;
}

/** Profiles in the same order as `ids`; unknown ids are dropped. */
export async function profilesById(ids: string[]): Promise<PublicProfile[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  const byId = new Map(rows.map((r) => [r.id, toProfile(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export function sharedInterests(a: Interest[], b: Interest[]): Interest[] {
  return a.filter((i) => b.includes(i));
}

// --- Crews -------------------------------------------------------------------

export async function getCrew(id: string): Promise<CrewRow> {
  const [crew] = await db.select().from(crews).where(eq(crews.id, id)).limit(1);
  if (!crew) throw new HTTPException(404, { message: 'Crew not found' });
  return crew;
}

/** Crews the user belongs to (active members only, unless `statuses` says otherwise). */
export async function crewsFor(
  userId: string,
  statuses: ('active' | 'pending')[] = ['active'],
): Promise<CrewRow[]> {
  const rows = await db
    .select({ crew: crews })
    .from(memberships)
    .innerJoin(crews, eq(crews.id, memberships.crewId))
    .where(and(eq(memberships.userId, userId), inArray(memberships.status, statuses)));
  return rows.map((r) => r.crew);
}

export async function activeMemberIds(crewId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.crewId, crewId), eq(memberships.status, 'active')));
  return rows.map((r) => r.userId);
}

export async function requireActiveMember(crewId: string, userId: string): Promise<void> {
  const ids = await activeMemberIds(crewId);
  if (!ids.includes(userId)) throw new HTTPException(403, { message: 'Join this crew first' });
}

export async function crewSummaries(rows: CrewRow[]): Promise<CrewSummary[]> {
  if (rows.length === 0) return [];
  const counts = await db
    .select({ crewId: memberships.crewId, n: count() })
    .from(memberships)
    .where(
      and(
        inArray(
          memberships.crewId,
          rows.map((r) => r.id),
        ),
        eq(memberships.status, 'active'),
      ),
    )
    .groupBy(memberships.crewId);
  const countById = new Map(counts.map((c) => [c.crewId, c.n]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    activity: r.activity,
    dayOfWeek: r.dayOfWeek,
    startTime: r.startTime,
    slot: slotFor(r.dayOfWeek, r.startTime),
    location: r.location,
    size: r.size,
    memberCount: countById.get(r.id) ?? 0,
  }));
}

// --- Sessions ------------------------------------------------------------------

/**
 * Next time a weekly (day, "HH:MM") happens after `from`.
 * Uses the server's time zone. TODO: store a time zone per city.
 */
export function nextOccurrence(dayOfWeek: number, startTime: string, from = new Date()): Date {
  const [h = 0, m = 0] = startTime.split(':').map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + ((dayOfWeek - d.getDay() + 7) % 7));
  if (d <= from) d.setDate(d.getDate() + 7);
  return d;
}

const endsAt = (s: SessionRow) => s.startsAt.getTime() + s.durationMinutes * 60_000;

/**
 * The crew's current-or-next session. A session stays "current" until it ends, so people
 * can check in while it runs. Creates the next weekly occurrence when none exists yet.
 */
export async function upcomingSession(crew: CrewRow, now = new Date()): Promise<SessionRow> {
  const recent = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.crewId, crew.id), gt(sessions.startsAt, new Date(now.getTime() - 86_400_000))));
  const upcoming = recent.filter((s) => endsAt(s) > now.getTime());
  if (!upcoming.some((s) => s.title === null)) {
    const [weekly] = await db
      .insert(sessions)
      .values({
        id: newId('s'),
        crewId: crew.id,
        startsAt: nextOccurrence(crew.dayOfWeek, crew.startTime, now),
        durationMinutes: crew.durationMinutes,
        location: crew.location,
      })
      .returning();
    upcoming.push(weekly!);
  }
  return upcoming.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]!;
}

export async function sessionSummary(
  session: SessionRow,
  crewName: string,
  viewerId: string,
): Promise<SessionSummary> {
  const rows = await db.select().from(attendance).where(eq(attendance.sessionId, session.id));
  return {
    id: session.id,
    crewId: session.crewId,
    crewName,
    title: session.title,
    startsAt: session.startsAt.toISOString(),
    durationMinutes: session.durationMinutes,
    location: session.location,
    attendees: await profilesById(rows.map((r) => r.userId)),
    myStatus: rows.find((r) => r.userId === viewerId)?.status ?? null,
  };
}

// --- Connections -----------------------------------------------------------------

export async function connect(a: string, b: string, source: 'nfc' | 'like'): Promise<void> {
  const [userA, userB] = a < b ? [a, b] : [b, a];
  await db.insert(connections).values({ userA, userB, source }).onConflictDoNothing();
}

export async function connectedIds(userId: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(connections)
    .where(or(eq(connections.userA, userId), eq(connections.userB, userId)));
  return rows.map((r) => (r.userA === userId ? r.userB : r.userA));
}
