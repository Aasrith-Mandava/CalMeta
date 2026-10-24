import { progressFor, type ChatSummary, type Home, type Person } from '@200h/shared';
import { and, count, desc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';

import type { AppEnv } from '../auth';
import { db } from '../db/client';
import { memberships, messages } from '../db/schema';
import { hoursWithEveryone } from '../domain/hours';
import {
  connectedIds,
  crewsFor,
  getUser,
  profilesById,
  sessionSummary,
  toProfile,
  upcomingSession,
  type CrewRow,
} from '../domain/views';

export const homeRoutes = new Hono<AppEnv>()
  // Screen 3: next session, people as rings, chats with unread counts
  .get('/me/home', async (c) => {
    const userId = c.get('userId');
    const myCrews = await crewsFor(userId);
    const upcoming = await Promise.all(
      myCrews.map(async (crew) => ({ crew, session: await upcomingSession(crew) })),
    );
    const next = upcoming.sort((a, b) => a.session.startsAt.getTime() - b.session.startsAt.getTime())[0];

    const home: Home = {
      me: toProfile(await getUser(userId)),
      nextSession: next ? await sessionSummary(next.session, next.crew.name, userId) : null,
      people: await myPeople(userId),
      chats: await chatSummaries(userId, myCrews),
    };
    return c.json(home);
  })
  .get('/me/chats', async (c) => {
    const userId = c.get('userId');
    return c.json(await chatSummaries(userId, await crewsFor(userId)));
  });

/** Everyone you've spent time with, plus new connections at 0h, most hours first. */
async function myPeople(userId: string): Promise<Person[]> {
  const hours = await hoursWithEveryone(userId);
  for (const id of await connectedIds(userId)) if (!hours.has(id)) hours.set(id, 0);
  const ranked = [...hours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const profiles = await profilesById(ranked.map(([id]) => id));
  return profiles.map((user) => ({ user, progress: progressFor(hours.get(user.id) ?? 0) }));
}

async function chatSummaries(userId: string, crewRows: CrewRow[]): Promise<ChatSummary[]> {
  return Promise.all(
    crewRows.map(async (crew) => {
      const [last] = await db
        .select()
        .from(messages)
        .where(eq(messages.crewId, crew.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const [membership] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.crewId, crew.id), eq(memberships.userId, userId)));
      const [unread] = await db
        .select({ n: count() })
        .from(messages)
        .where(
          and(
            eq(messages.crewId, crew.id),
            gt(messages.createdAt, membership?.lastReadAt ?? new Date(0)),
            or(isNull(messages.authorId), ne(messages.authorId, userId)),
          ),
        );
      return {
        crewId: crew.id,
        crewName: crew.name,
        activity: crew.activity,
        lastMessage: last?.text ?? null,
        unread: unread?.n ?? 0,
      };
    }),
  );
}
