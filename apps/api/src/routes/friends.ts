import { progressFor, type FriendProfile } from '@200h/shared';
import { Hono } from 'hono';

import { nextStep } from '../ai/features';
import type { AppEnv } from '../auth';
import { hoursBetween } from '../domain/hours';
import { crewSummaries, crewsFor, getUser, sharedInterests, toProfile } from '../domain/views';

export const friendRoutes = new Hono<AppEnv>()
  // Screen 6: hours together, what you share, and the AI's next step
  .get('/friends/:userId', async (c) => {
    const me = await getUser(c.get('userId'));
    const friend = await getUser(c.req.param('userId'));
    const hours = await hoursBetween(me.id, friend.id);
    const theirCrewIds = new Set((await crewsFor(friend.id)).map((crew) => crew.id));
    const sharedCrews = (await crewsFor(me.id)).filter((crew) => theirCrewIds.has(crew.id));
    const interests = sharedInterests(me.interests, friend.interests);

    const profile: FriendProfile = {
      user: toProfile(friend),
      progress: progressFor(hours),
      sharedInterests: interests,
      sharedCrews: await crewSummaries(sharedCrews),
      nextStep: await nextStep(
        me,
        friend,
        hours,
        interests,
        sharedCrews.map((crew) => crew.name),
      ),
    };
    return c.json(profile);
  });
