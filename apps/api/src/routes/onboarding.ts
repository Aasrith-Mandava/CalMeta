import { ExtractInterestsInput, OnboardingInput } from '@200h/shared';

import { Hono } from 'hono';

import { extractInterests } from '../ai/features';
import { db, newId } from '../db/client';
import { users } from '../db/schema';
import { getUser, toProfile } from '../domain/views';
import { validate } from '../validate';

// Public routes (no x-user-id needed).
export const onboardingRoutes = new Hono()
  // Screen 1: "Find my crew" creates the account
  .post('/users', validate('json', OnboardingInput), async (c) => {
    const [row] = await db
      .insert(users)
      .values({ id: newId('u'), ...c.req.valid('json') })
      .returning();
    return c.json(toProfile(row!), 201);
  })
  // Screen 1 mic: free text (or a speech transcript) → suggested chips
  .post('/ai/interests', validate('json', ExtractInterestsInput), async (c) => {
    return c.json(await extractInterests(c.req.valid('json').text));
  })
  // Dev only: lets the app "continue as" a seeded user. Remove before launch.
  .get('/users', async (c) => {
    const rows = await db.select().from(users).orderBy(users.name);
    return c.json(rows.map(toProfile));
  })
  .get('/users/:id', async (c) => c.json(toProfile(await getUser(c.req.param('id')))));
