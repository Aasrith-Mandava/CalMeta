import { LikeInput, type DiscoverCard, type LikeResult } from '@200h/shared';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { AppEnv } from '../auth';
import { db } from '../db/client';
import { crews, likes, users } from '../db/schema';
import { hoursWithEveryone } from '../domain/hours';
import { rankCrews, rankPeople } from '../domain/matching';
import { connect, connectedIds, crewSummaries, crewsFor, getUser, sharedInterests, toProfile } from '../domain/views';
import { validate } from '../validate';

export const discoverRoutes = new Hono<AppEnv>()
  // Screen 4, People tab: one card at a time, most shared interests first
  .get('/discover/people', async (c) => {
    const me = await getUser(c.get('userId'));
    const liked = await db.select({ id: likes.toUserId }).from(likes).where(eq(likes.fromUserId, me.id));
    // Discover is for new people: hide anyone you've liked, connected with, or already spend time with.
    const hidden = new Set([
      me.id,
      ...liked.map((l) => l.id),
      ...(await connectedIds(me.id)),
      ...(await hoursWithEveryone(me.id)).keys(),
    ]);
    const candidates = (await db.select().from(users).where(eq(users.city, me.city))).filter((u) => !hidden.has(u.id));
    const cards: DiscoverCard[] = rankPeople(me.interests, candidates)
      .slice(0, 20)
      .map((u) => ({ user: toProfile(u), sharedInterests: sharedInterests(me.interests, u.interests) }));
    return c.json(cards);
  })

  // Screen 4, Crews tab: open crews you're not in, best fits first
  .get('/discover/crews', async (c) => {
    const me = await getUser(c.get('userId'));
    const mine = new Set((await crewsFor(me.id, ['active', 'pending'])).map((crew) => crew.id));
    const rows = (await db.select().from(crews).where(eq(crews.city, me.city))).filter((r) => !mine.has(r.id));
    const open = (await crewSummaries(rows)).filter((s) => s.memberCount < s.size);
    const bestFits = rankCrews(me, open);
    return c.json([...bestFits, ...open.filter((s) => !bestFits.includes(s))]);
  })

  // Like a profile (optionally replying to their prompt). Mutual likes become connections.
  .post('/likes', validate('json', LikeInput), async (c) => {
    const userId = c.get('userId');
    const { toUserId, comment } = c.req.valid('json');
    if (toUserId === userId) throw new HTTPException(400, { message: "You can't like yourself" });
    await getUser(toUserId);
    await db.insert(likes).values({ fromUserId: userId, toUserId, comment }).onConflictDoNothing();
    const [likedBack] = await db
      .select()
      .from(likes)
      .where(and(eq(likes.fromUserId, toUserId), eq(likes.toUserId, userId)));
    if (likedBack) await connect(userId, toUserId, 'like');
    return c.json({ matched: Boolean(likedBack) } satisfies LikeResult);
  });
