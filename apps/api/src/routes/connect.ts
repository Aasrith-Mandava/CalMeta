import { RedeemInput, connectUrl, type ConnectCode, type ConnectResult } from '@200h/shared';

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { AppEnv } from '../auth';
import { db } from '../db/client';
import { connectCodes } from '../db/schema';
import { connect, getUser, sharedInterests, toProfile } from '../domain/views';
import { validate } from '../validate';

// NFC profile exchange. The tag carries a short-lived code, never profile data;
// the receiving phone redeems the code here. Typing the code works as a fallback.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_TTL_MS = 10 * 60_000;

function randomCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const connectRoutes = new Hono<AppEnv>()
  // Share: get a code to write to an NFC tag (or show on screen)
  .post('/connect/code', async (c) => {
    const code = randomCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db.insert(connectCodes).values({ code, userId: c.get('userId'), expiresAt });
    return c.json({ code, url: connectUrl(code), expiresAt: expiresAt.toISOString() } satisfies ConnectCode, 201);
  })

  // Receive: the other phone read the tag (or typed the code)
  .post('/connect/redeem', validate('json', RedeemInput), async (c) => {
    const userId = c.get('userId');
    const [row] = await db.select().from(connectCodes).where(eq(connectCodes.code, c.req.valid('json').code));
    if (!row || row.expiresAt < new Date()) {
      throw new HTTPException(404, { message: 'That code expired. Ask them to share again.' });
    }
    if (row.userId === userId) throw new HTTPException(400, { message: "That's your own code" });

    await connect(userId, row.userId, 'nfc');
    const [me, other] = await Promise.all([getUser(userId), getUser(row.userId)]);
    return c.json({
      user: toProfile(other),
      sharedInterests: sharedInterests(me.interests, other.interests),
    } satisfies ConnectResult);
  });
