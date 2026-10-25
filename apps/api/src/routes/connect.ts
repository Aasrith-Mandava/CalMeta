import {
  FIRST_TWENTY_MINUTES,
  RedeemInput,
  TapActionInput,
  connectUrl,
  type CrewSummary,
  type ConnectCode,
  type ConnectLobby,
  type ConnectPreview,
  type TapMoment,
} from '@200h/shared';
import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { AppEnv } from '../auth';
import { firstHello } from '../ai/features';
import { db, newId, writeTransaction } from '../db/client';
import { connectCodes, connections, crews, tapMoments } from '../db/schema';
import { crewSummaries, getUser, sharedInterests, toProfile } from '../domain/views';
import { validate } from '../validate';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60_000;
const CONFIRM_TTL_MS = 24 * 60 * 60_000;
type MomentRow = typeof tapMoments.$inferSelect;
type Store = Pick<typeof db, 'select' | 'insert' | 'update'>;

// Rejection sampling avoids modulo bias in the short invitation codes.
function randomCode(): string {
  let code = '';
  const limit = 256 - (256 % CODE_ALPHABET.length);
  while (code.length < 6) {
    for (const byte of crypto.getRandomValues(new Uint8Array(12))) {
      if (byte < limit && code.length < 6) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }
  }
  return code;
}

async function momentFor(id: string, userId: string, store: Store = db): Promise<MomentRow> {
  const [row] = await store.select().from(tapMoments).where(and(
    eq(tapMoments.id, id), or(eq(tapMoments.hostId, userId), eq(tapMoments.guestId, userId)),
  ));
  if (!row) throw new HTTPException(404, { message: 'Hangout not found' });
  return row;
}

async function ongoing(userId: string, store: Store = db): Promise<MomentRow | undefined> {
  const [row] = await store.select().from(tapMoments).where(and(
    or(eq(tapMoments.hostId, userId), eq(tapMoments.guestId, userId)),
    inArray(tapMoments.status, ['pending', 'active']),
    gt(tapMoments.expiresAt, new Date()),
  )).orderBy(desc(tapMoments.createdAt)).limit(1);
  return row;
}

async function present(row: MomentRow, userId: string): Promise<TapMoment> {
  const isHost = row.hostId === userId;
  const now = new Date();
  return {
    id: row.id,
    other: toProfile(await getUser(isHost ? row.guestId : row.hostId)),
    isHost,
    status: ['pending', 'active'].includes(row.status) && row.expiresAt <= now ? 'expired' : row.status,
    activity: { title: row.title, prompt: row.prompt, source: row.activitySource },
    sharedInterests: row.sharedInterests,
    durationMinutes: row.durationMinutes,
    startedAt: row.startedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    serverNow: now.toISOString(),
    confirmedByMe: Boolean(isHost ? row.hostConfirmedAt : row.guestConfirmedAt),
    confirmedByOther: Boolean(isHost ? row.guestConfirmedAt : row.hostConfirmedAt),
    nextCrew: row.status === 'active' || row.status === 'completed' ? await nextCrew(row) : null,
  };
}

async function nextCrew(moment: MomentRow): Promise<CrewSummary | null> {
  if (!moment.sharedInterests.length) return null;
  const [host, guest] = await Promise.all([getUser(moment.hostId), getUser(moment.guestId)]);
  if (host.city !== guest.city) return null;
  const commonSlots = host.availability.filter((slot) => guest.availability.includes(slot));
  const rows = await db.select().from(crews).where(and(eq(crews.city, host.city), inArray(crews.activity, moment.sharedInterests)));
  const candidates = (await crewSummaries(rows)).filter((crew) => commonSlots.includes(crew.slot) && crew.size - crew.memberCount >= 2);
  return candidates.sort((a, b) => b.memberCount - a.memberCount || a.id.localeCompare(b.id))[0] ?? null;
}

export const connectRoutes = new Hono<AppEnv>()
  // Resume after closing the app, or when an invitation is already in progress.
  .get('/connect/current', async (c) => {
    const row = await ongoing(c.get('userId'));
    return c.json(row ? await present(row, c.get('userId')) : null);
  })

  .post('/connect/code', async (c) => {
    const userId = c.get('userId');
    const result = await writeTransaction(async (tx) => {
      if (await ongoing(userId, tx)) {
        throw new HTTPException(409, { message: 'Finish or cancel your current First 20 before sharing again.' });
      }
      const now = new Date();
      // Refreshing a card revokes its old, unclaimed invitation.
      await tx.update(connectCodes).set({ expiresAt: now }).where(and(
        eq(connectCodes.userId, userId), gt(connectCodes.expiresAt, now),
      ));
      const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const [inserted] = await tx.insert(connectCodes).values({ code, userId, expiresAt })
          .onConflictDoNothing().returning();
        if (inserted) return { code, url: connectUrl(code), expiresAt: expiresAt.toISOString() } satisfies ConnectCode;
      }
      throw new HTTPException(503, { message: 'Could not create a code. Please try again.' });
    });
    return c.json(result, 201);
  })

  // Only the person sharing can watch a guest arrive. Codes never expose a guest to others.
  .get('/connect/code/:code', validate('param', RedeemInput), async (c) => {
    const { code } = c.req.valid('param');
    const userId = c.get('userId');
    const [invitation] = await db.select().from(connectCodes).where(and(
      eq(connectCodes.code, code), eq(connectCodes.userId, userId),
    ));
    if (!invitation) throw new HTTPException(404, { message: 'Invitation not found' });
    const [row] = await db.select().from(tapMoments).where(eq(tapMoments.code, code));
    return c.json({
      expiresAt: invitation.expiresAt.toISOString(),
      moment: row ? await present(row, userId) : null,
    } satisfies ConnectLobby);
  })

  // A scan previews common ground. It does not connect people or start a timer.
  .get('/connect/preview/:code', validate('param', RedeemInput), async (c) => {
    const { code } = c.req.valid('param');
    const userId = c.get('userId');
    const [invitation] = await db.select().from(connectCodes).where(eq(connectCodes.code, code));
    if (!invitation) throw new HTTPException(404, { message: 'That invitation expired. Ask for a fresh tap.' });
    if (invitation.userId === userId) throw new HTTPException(400, { message: "That is your own invitation. Ask someone to scan your tag." });
    const [claimed] = await db.select().from(tapMoments).where(eq(tapMoments.code, code));
    if (claimed && claimed.guestId !== userId) throw new HTTPException(409, { message: 'Someone already used that invitation. Ask for a fresh tap.' });
    if (!claimed && invitation.expiresAt <= new Date()) {
      throw new HTTPException(410, { message: 'That invitation expired. Ask for a fresh tap.' });
    }
    const [me, host] = await Promise.all([getUser(userId), getUser(invitation.userId)]);
    const interests = sharedInterests(me.interests, host.interests);
    return c.json({
      user: toProfile(host), sharedInterests: interests, code,
      expiresAt: invitation.expiresAt.toISOString(),
      activity: claimed ? { title: claimed.title, prompt: claimed.prompt, source: claimed.activitySource } : await firstHello(code, me, host, interests),
      momentId: claimed?.id ?? null,
    } satisfies ConnectPreview);
  })

  // Single-use claim. The host must still approve before the timer or connection starts.
  .post('/connect/redeem', validate('json', RedeemInput), async (c) => {
    const userId = c.get('userId');
    const { code } = c.req.valid('json');
    // Generate outside the write transaction so an optional AI request never holds a DB lock.
    const [invitationPreview] = await db.select().from(connectCodes).where(eq(connectCodes.code, code));
    if (!invitationPreview) throw new HTTPException(404, { message: 'Invitation not found. Ask for a fresh tap.' });
    if (invitationPreview.userId === userId) throw new HTTPException(400, { message: 'That is your own invitation' });
    const [existing] = await db.select().from(tapMoments).where(eq(tapMoments.code, code));
    if (existing) {
      if (existing.guestId === userId) return c.json(await present(existing, userId));
      throw new HTTPException(409, { message: 'Someone already used that invitation. Ask for a fresh tap.' });
    }
    if (invitationPreview.expiresAt <= new Date()) throw new HTTPException(410, { message: 'That invitation expired. Ask for a fresh tap.' });
    const [guest, host] = await Promise.all([getUser(userId), getUser(invitationPreview.userId)]);
    const proposed = await firstHello(code, guest, host, sharedInterests(guest.interests, host.interests));
    const row = await writeTransaction(async (tx) => {
      const [invitation] = await tx.select().from(connectCodes).where(eq(connectCodes.code, code));
      if (!invitation) throw new HTTPException(404, { message: 'Invitation not found. Ask for a fresh tap.' });
      if (invitation.userId === userId) throw new HTTPException(400, { message: "That is your own invitation" });
      const [claimed] = await tx.select().from(tapMoments).where(eq(tapMoments.code, code));
      // Retries return the same hangout; another guest cannot reuse a card.
      if (claimed) {
        if (claimed.guestId === userId) return claimed;
        throw new HTTPException(409, { message: 'Someone already used that invitation. Ask for a fresh tap.' });
      }
      if (invitation.expiresAt <= new Date()) throw new HTTPException(410, { message: 'That invitation expired. Ask for a fresh tap.' });
      if (await ongoing(userId, tx) || await ongoing(invitation.userId, tx)) {
        throw new HTTPException(409, { message: 'One of you already has a First 20 in progress. Finish or cancel it first.' });
      }
      const interests = sharedInterests(guest.interests, host.interests);
      const [created] = await tx.insert(tapMoments).values({
        id: newId('tap'), code, hostId: host.id, guestId: guest.id,
        title: proposed.title, prompt: proposed.prompt, activitySource: proposed.source, sharedInterests: interests,
        durationMinutes: FIRST_TWENTY_MINUTES, expiresAt: invitation.expiresAt,
      }).returning();
      return created!;
    });
    return c.json(await present(row, userId));
  })

  .get('/connect/moments/:id', async (c) => c.json(
    await present(await momentFor(c.req.param('id'), c.get('userId')), c.get('userId')),
  ))

  .post('/connect/moments/:id', validate('json', TapActionInput), async (c) => {
    const userId = c.get('userId');
    const { action } = c.req.valid('json');
    const row = await writeTransaction(async (tx) => {
      const moment = await momentFor(c.req.param('id'), userId, tx);
      const now = new Date();
      if (moment.status === 'completed' && action === 'confirm') return moment;
      if (moment.status === 'cancelled' && action === 'cancel') return moment;
      if (['completed', 'cancelled'].includes(moment.status)) {
        throw new HTTPException(409, { message: 'This hangout has already ended' });
      }
      if (moment.expiresAt <= now) throw new HTTPException(410, { message: 'This hangout expired. Start again with a fresh tap.' });
      if (action === 'cancel') {
        const [cancelled] = await tx.update(tapMoments).set({ status: 'cancelled' })
          .where(eq(tapMoments.id, moment.id)).returning();
        return cancelled!;
      }
      if (action === 'start') {
        if (moment.hostId !== userId) throw new HTTPException(403, { message: 'The person sharing the tag starts the hangout' });
        if (moment.status === 'active') return moment;
        const [userA, userB] = [moment.hostId, moment.guestId].sort();
        await tx.insert(connections).values({ userA: userA!, userB: userB!, source: 'nfc' }).onConflictDoNothing();
        const [started] = await tx.update(tapMoments).set({
          status: 'active', startedAt: now, expiresAt: new Date(now.getTime() + CONFIRM_TTL_MS),
        }).where(eq(tapMoments.id, moment.id)).returning();
        return started!;
      }
      if (!moment.startedAt || moment.status !== 'active') {
        throw new HTTPException(409, { message: 'Wait for the host to start your hangout' });
      }
      if (now.getTime() < moment.startedAt.getTime() + moment.durationMinutes * 60_000) {
        throw new HTTPException(409, { message: 'Enjoy the full 20 minutes together before confirming.' });
      }
      const isHost = moment.hostId === userId;
      const bothConfirmed = Boolean(isHost ? moment.guestConfirmedAt : moment.hostConfirmedAt);
      const [confirmed] = await tx.update(tapMoments).set({
        ...(isHost ? { hostConfirmedAt: moment.hostConfirmedAt ?? now } : { guestConfirmedAt: moment.guestConfirmedAt ?? now }),
        ...(bothConfirmed ? { status: 'completed' as const, completedAt: now } : {}),
      }).where(eq(tapMoments.id, moment.id)).returning();
      return confirmed!;
    });
    return c.json(await present(row, userId));
  });
