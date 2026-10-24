import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { db } from './db/client';
import { users } from './db/schema';

export type AppEnv = { Variables: { userId: string } };

/**
 * Hackathon auth: the app sends the signed-in user's id as `x-user-id`.
 * Anyone can impersonate anyone. Replace with real auth before real users touch this.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.req.header('x-user-id');
  if (!userId) throw new HTTPException(401, { message: 'Missing x-user-id header' });
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new HTTPException(401, { message: `Unknown user ${userId}` });
  c.set('userId', userId);
  await next();
});
