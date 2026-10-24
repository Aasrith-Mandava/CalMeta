import { SendMessageInput, VoteInput, formatWeekly, type ChatThread, type Interest, type Poll } from '@200h/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { planPoll } from '../ai/features';
import type { AppEnv } from '../auth';
import { db, newId } from '../db/client';
import { attendance, memberships, messages, polls, sessions, users, votes } from '../db/schema';
import {
  activeMemberIds,
  crewSummaries,
  getCrew,
  nextOccurrence,
  profilesById,
  requireActiveMember,
  type CrewRow,
} from '../domain/views';
import { validate } from '../validate';

type PollRow = typeof polls.$inferSelect;

export const chatRoutes = new Hono<AppEnv>()
  // Screen 5. Reading the thread marks it read for unread counts on Home.
  .get('/crews/:id/messages', async (c) => {
    const userId = c.get('userId');
    const crew = await getCrew(c.req.param('id'));
    await requireActiveMember(crew.id, userId);
    const thread = await loadThread(crew, userId);
    await db
      .update(memberships)
      .set({ lastReadAt: new Date() })
      .where(and(eq(memberships.crewId, crew.id), eq(memberships.userId, userId)));
    return c.json(thread);
  })

  .post('/crews/:id/messages', validate('json', SendMessageInput), async (c) => {
    const userId = c.get('userId');
    const crew = await getCrew(c.req.param('id'));
    await requireActiveMember(crew.id, userId);
    await db
      .insert(messages)
      .values({ id: newId('m'), crewId: crew.id, authorId: userId, kind: 'text', text: c.req.valid('json').text });
    return c.json(await loadThread(crew, userId), 201);
  })

  // The AI posts plan ideas as a poll
  .post('/crews/:id/plan', async (c) => {
    const userId = c.get('userId');
    const crew = await getCrew(c.req.param('id'));
    await requireActiveMember(crew.id, userId);
    const members = await db
      .select()
      .from(users)
      .where(inArray(users.id, await activeMemberIds(crew.id)));
    const plan = await planPoll(
      { ...crew, memberNames: members.map((m) => m.name) },
      commonInterests(members.map((m) => m.interests)),
    );
    const pollId = newId('p');
    await db.insert(polls).values({ id: pollId, crewId: crew.id, question: plan.question, options: plan.options });
    await db
      .insert(messages)
      .values({ id: newId('m'), crewId: crew.id, authorId: null, kind: 'poll', text: plan.question, pollId });
    return c.json(await loadThread(crew, userId), 201);
  })

  // A majority locks the plan and adds it to everyone's week
  .post('/polls/:id/vote', validate('json', VoteInput), async (c) => {
    const userId = c.get('userId');
    const [poll] = await db.select().from(polls).where(eq(polls.id, c.req.param('id')));
    if (!poll) throw new HTTPException(404, { message: 'Poll not found' });
    await requireActiveMember(poll.crewId, userId);
    if (poll.lockedIndex !== null) throw new HTTPException(409, { message: 'This plan is already locked' });
    const { optionIndex } = c.req.valid('json');
    if (optionIndex >= poll.options.length) throw new HTTPException(400, { message: 'No such option' });

    await db
      .insert(votes)
      .values({ pollId: poll.id, userId, optionIndex })
      .onConflictDoUpdate({ target: [votes.pollId, votes.userId], set: { optionIndex } });

    const tallies = await db
      .select({ optionIndex: votes.optionIndex, n: count() })
      .from(votes)
      .where(eq(votes.pollId, poll.id))
      .groupBy(votes.optionIndex);
    const memberCount = (await activeMemberIds(poll.crewId)).length;
    const winner = tallies.find((t) => t.n > memberCount / 2);
    if (winner) await lockPlan(poll, winner.optionIndex);

    return c.json(await loadThread(await getCrew(poll.crewId), userId));
  });

/** Interests at least two members share, most common first. */
function commonInterests(lists: Interest[][]): Interest[] {
  const counts = new Map<Interest, number>();
  for (const list of lists) for (const i of list) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i);
}

async function lockPlan(poll: PollRow, index: number): Promise<void> {
  const option = poll.options[index]!;
  const crew = await getCrew(poll.crewId);
  await db.update(polls).set({ lockedIndex: index }).where(eq(polls.id, poll.id));

  const sessionId = newId('s');
  await db.insert(sessions).values({
    id: sessionId,
    crewId: crew.id,
    title: option.label,
    startsAt: nextOccurrence(option.dayOfWeek, option.startTime),
    durationMinutes: 90,
    location: crew.location,
  });
  const voters = await db
    .select()
    .from(votes)
    .where(and(eq(votes.pollId, poll.id), eq(votes.optionIndex, index)));
  await db
    .insert(attendance)
    .values(voters.map((v) => ({ sessionId, userId: v.userId, status: 'going' as const })))
    .onConflictDoNothing();
  await db.insert(messages).values({
    id: newId('m'),
    crewId: crew.id,
    authorId: null,
    kind: 'ai',
    text: `Locked in: ${option.label}, ${formatWeekly(option.dayOfWeek, option.startTime)}. It's on everyone's week.`,
  });
}

async function loadThread(crew: CrewRow, viewerId: string): Promise<ChatThread> {
  const rows = await db.select().from(messages).where(eq(messages.crewId, crew.id)).orderBy(asc(messages.createdAt));
  const recent = rows.slice(-200);

  const authorIds = [...new Set(recent.flatMap((r) => (r.authorId ? [r.authorId] : [])))];
  const authors = new Map((await profilesById(authorIds)).map((p) => [p.id, p]));

  const pollIds = recent.flatMap((r) => (r.pollId ? [r.pollId] : []));
  const pollRows = pollIds.length ? await db.select().from(polls).where(inArray(polls.id, pollIds)) : [];
  const voteRows = pollIds.length ? await db.select().from(votes).where(inArray(votes.pollId, pollIds)) : [];
  const pollsById: Record<string, Poll> = {};
  for (const p of pollRows) {
    const pv = voteRows.filter((v) => v.pollId === p.id);
    pollsById[p.id] = {
      id: p.id,
      question: p.question,
      lockedIndex: p.lockedIndex,
      options: p.options.map((o, i) => ({
        label: o.label,
        votes: pv.filter((v) => v.optionIndex === i).length,
        votedByMe: pv.some((v) => v.optionIndex === i && v.userId === viewerId),
      })),
    };
  }

  return {
    crew: (await crewSummaries([crew]))[0]!,
    messages: recent.map((r) => ({
      id: r.id,
      kind: r.kind,
      author: r.authorId ? (authors.get(r.authorId) ?? null) : null,
      text: r.text,
      pollId: r.pollId,
      createdAt: r.createdAt.toISOString(),
    })),
    polls: pollsById,
  };
}
