import {
  AttendanceInput,
  InterestSchema,
  MemberDecisionInput,
  NewCrewInput,
  type CrewDemand,
  type CrewPage,
  type CrewSuggestion,
  type JoinResult,
} from '@200h/shared';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { crewReason } from '../ai/features';
import type { AppEnv } from '../auth';
import { db, newId } from '../db/client';
import { attendance, crews, memberships, sessions, users } from '../db/schema';
import { rankCrews } from '../domain/matching';
import {
  activeMemberIds,
  crewSummaries,
  crewsFor,
  getCrew,
  getUser,
  profilesById,
  requireActiveMember,
  sessionSummary,
  upcomingSession,
} from '../domain/views';
import { validate } from '../validate';

export const crewRoutes = new Hono<AppEnv>()
  // Screen 2: one AI-picked crew at a time. The app sends the ids it already skipped.
  .get('/me/crew-suggestion', validate('query', z.object({ skip: z.string().optional() })), async (c) => {
    const me = await getUser(c.get('userId'));
    const skip = new Set((c.req.valid('query').skip ?? '').split(',').filter(Boolean));
    const mine = new Set((await crewsFor(me.id, ['active', 'pending'])).map((crew) => crew.id));
    const rows = (await db.select().from(crews).where(eq(crews.city, me.city))).filter(
      (r) => !skip.has(r.id) && !mine.has(r.id),
    );
    const [best] = rankCrews(me, await crewSummaries(rows));
    if (!best) throw new HTTPException(404, { message: 'No more crews nearby. Start one!' });

    const members = await profilesById(await activeMemberIds(best.id));
    const crewRow = rows.find((r) => r.id === best.id)!;
    const reason = await crewReason(me, { ...crewRow, memberNames: members.map((m) => m.name) });
    return c.json({ crew: best, members, reason } satisfies CrewSuggestion);
  })

  // Screen 2 "I'm in" and Discover's Crews tab. Owner-run crews need approval; AI-run crews are open.
  .post('/crews/:id/join', async (c) => {
    const userId = c.get('userId');
    const crew = await getCrew(c.req.param('id'));
    const [summary] = await crewSummaries([crew]);
    if (summary!.memberCount >= crew.size) throw new HTTPException(409, { message: 'This crew is full' });
    await db
      .insert(memberships)
      .values({ crewId: crew.id, userId, status: crew.ownerId ? 'pending' : 'active' })
      .onConflictDoNothing();
    const [m] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.crewId, crew.id), eq(memberships.userId, userId)));
    return c.json({ status: m!.status } satisfies JoinResult);
  })

  // Screen 7: "14 people near you want pickleball"
  .get('/crews/demand', validate('query', z.object({ activity: InterestSchema })), async (c) => {
    const me = await getUser(c.get('userId'));
    const { activity } = c.req.valid('query');
    const others = await db
      .select({ interests: users.interests })
      .from(users)
      .where(and(eq(users.city, me.city), ne(users.id, me.id)));
    const interestedCount = others.filter((u) => u.interests.includes(activity)).length;
    return c.json({ activity, interestedCount } satisfies CrewDemand);
  })

  // Screen 7: create a crew you own
  .post('/crews', validate('json', NewCrewInput), async (c) => {
    const me = await getUser(c.get('userId'));
    const [crew] = await db
      .insert(crews)
      .values({ id: newId('c'), ...c.req.valid('json'), city: me.city, ownerId: me.id })
      .returning();
    await db.insert(memberships).values({ crewId: crew!.id, userId: me.id, status: 'active' });
    const [summary] = await crewSummaries([crew!]);
    return c.json(summary, 201);
  })

  // Screen 8
  .get('/crews/:id', async (c) => {
    const userId = c.get('userId');
    const crew = await getCrew(c.req.param('id'));
    const rows = await db.select().from(memberships).where(eq(memberships.crewId, crew.id));
    const isOwner = crew.ownerId === userId;
    const idsWith = (status: 'active' | 'pending') => rows.filter((r) => r.status === status).map((r) => r.userId);

    const page: CrewPage = {
      crew: (await crewSummaries([crew]))[0]!,
      nextSession: await sessionSummary(await upcomingSession(crew), crew.name, userId),
      members: await profilesById(idsWith('active')),
      pending: isOwner ? await profilesById(idsWith('pending')) : [],
      isOwner,
      myStatus: rows.find((r) => r.userId === userId)?.status ?? null,
    };
    return c.json(page);
  })

  // Screen 8: owner approves or declines a join request
  .post('/crews/:id/members/:userId', validate('json', MemberDecisionInput), async (c) => {
    const crew = await getCrew(c.req.param('id'));
    if (crew.ownerId !== c.get('userId')) {
      throw new HTTPException(403, { message: 'Only the crew owner can do that' });
    }
    const request = and(
      eq(memberships.crewId, crew.id),
      eq(memberships.userId, c.req.param('userId')),
      eq(memberships.status, 'pending'),
    );
    if (c.req.valid('json').action === 'approve') {
      await db.update(memberships).set({ status: 'active' }).where(request);
    } else {
      await db.delete(memberships).where(request);
    }
    return c.json({ ok: true });
  })

  // Screen 3 "Check in" and screen 8 "Going". Checking in is what makes hours count.
  .post('/sessions/:id/attendance', validate('json', AttendanceInput), async (c) => {
    const userId = c.get('userId');
    const [session] = await db.select().from(sessions).where(eq(sessions.id, c.req.param('id')));
    if (!session) throw new HTTPException(404, { message: 'Session not found' });
    await requireActiveMember(session.crewId, userId);
    // TODO(hours): only allow check-in near the session time/place so hours can't be faked.
    const { status } = c.req.valid('json');
    await db
      .insert(attendance)
      .values({ sessionId: session.id, userId, status })
      .onConflictDoUpdate({
        target: [attendance.sessionId, attendance.userId],
        set: { status, updatedAt: new Date() },
      });
    return c.json({ status });
  });
