import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import type { ConnectCode, TapMoment } from '@200h/shared';
import type { AppEnv } from '../auth';

// Build the real schema in an isolated database; never touch the developer's local.db.
const directory = mkdtempSync(resolve(tmpdir(), '200h-connect-'));
const apiDirectory = resolve(import.meta.dirname, '../..');
process.env.DATABASE_URL = `file:${resolve(directory, 'test.db')}`;
process.env.MODEL_API_KEY = '';
process.env.MUSE_API_KEY = '';
execFileSync(process.execPath, [resolve(apiDirectory, '../../node_modules/drizzle-kit/bin.cjs'), 'push', '--force'], {
  cwd: apiDirectory, env: process.env, stdio: 'pipe',
});
const { db } = await import('../db/client');
const { users, tapMoments, connectCodes, connections, crews, memberships } = await import('../db/schema');
const { requireUser } = await import('../auth');
const { connectRoutes } = await import('./connect');
const { friendRoutes } = await import('./friends');
const { hoursBetween } = await import('../domain/hours');
const app = new Hono<AppEnv>();
app.use('*', requireUser);
app.route('/', connectRoutes);
app.route('/', friendRoutes);
app.onError((error, c) => error instanceof HTTPException
  ? c.json({ message: error.message }, error.status)
  : c.json({ message: String(error) }, 500));

after(() => { db.$client.close(); rmSync(directory, { recursive: true, force: true }); });
beforeEach(async () => {
  await db.delete(tapMoments); await db.delete(connectCodes); await db.delete(connections);
  await db.delete(memberships); await db.delete(crews); await db.delete(users);
  await db.insert(users).values([
    { id: 'alex', name: 'Alex', city: 'SF', interests: ['climbing', 'tacos'], availability: ['weeknights'] },
    { id: 'sam', name: 'Sam', city: 'SF', interests: ['climbing'], availability: ['weeknights'] },
    { id: 'other', name: 'Other', city: 'SF', interests: ['coffee'], availability: ['weekend_am'] },
  ]);
});
function request(user: string, path: string, body?: unknown) {
  return app.request(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-user-id': user, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function code(user = 'alex'): Promise<ConnectCode> {
  const response = await request(user, '/connect/code', {});
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
async function claim(invitation: ConnectCode, user = 'sam'): Promise<TapMoment> {
  const response = await request(user, '/connect/redeem', { code: invitation.code });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

test('preview is read-only; start needs host consent; no early or one-sided time credit', async () => {
  const invitation = await code();
  const preview = await request('sam', `/connect/preview/${invitation.code}`);
  assert.equal(preview.status, 200);
  assert.deepEqual((await preview.json()).sharedInterests, ['climbing']);
  assert.equal((await db.select().from(tapMoments)).length, 0);
  assert.equal((await db.select().from(connections)).length, 0);
  const moment = await claim(invitation);
  assert.equal(moment.status, 'pending');
  assert.equal(await hoursBetween('alex', 'sam'), 0);
  assert.equal((await db.select().from(connections)).length, 0);
  assert.equal((await request('sam', `/connect/moments/${moment.id}`, { action: 'start' })).status, 403);
  assert.equal((await request('alex', `/connect/moments/${moment.id}`, { action: 'start' })).status, 200);
  assert.equal((await db.select().from(connections)).length, 1);
  assert.equal((await request('alex', `/connect/moments/${moment.id}`, { action: 'confirm' })).status, 409);
  await db.update(tapMoments).set({ startedAt: new Date(Date.now() - 20 * 60_000 - 1000) }).where(eq(tapMoments.id, moment.id));
  assert.equal((await request('alex', `/connect/moments/${moment.id}`, { action: 'confirm' })).status, 200);
  assert.equal(await hoursBetween('alex', 'sam'), 0);
  const finished = await request('sam', `/connect/moments/${moment.id}`, { action: 'confirm' });
  assert.equal((await finished.json()).status, 'completed');
  assert.equal(await hoursBetween('alex', 'sam'), 1 / 3);
  assert.equal(await hoursBetween('sam', 'alex'), 1 / 3);
  await request('sam', `/connect/moments/${moment.id}`, { action: 'confirm' });
  assert.equal(await hoursBetween('alex', 'sam'), 1 / 3);
  const profile = await request('alex', '/friends/sam');
  assert.equal((await profile.json()).firstTwenty.minutes, 20);
});

test('a code is single-use and repeated claims are idempotent', async () => {
  const invitation = await code();
  const first = await claim(invitation);
  assert.equal((await claim(invitation)).id, first.id);
  assert.equal((await request('other', '/connect/redeem', { code: invitation.code })).status, 409);
  assert.equal((await request('other', `/connect/preview/${invitation.code}`)).status, 409);
  assert.equal((await db.select().from(tapMoments)).length, 1);
});

test('participants alone can inspect or change a hangout', async () => {
  const invitation = await code();
  const moment = await claim(invitation);
  assert.equal((await request('other', `/connect/moments/${moment.id}`)).status, 404);
  assert.equal((await request('other', `/connect/moments/${moment.id}`, { action: 'cancel' })).status, 404);
  assert.equal((await request('sam', `/connect/code/${invitation.code}`)).status, 404);
  assert.equal((await request('alex', `/connect/preview/${invitation.code}`)).status, 400);
  assert.equal((await request('', '/connect/current')).status, 401);
});

test('refresh revokes old invitations; expired codes cannot be claimed', async () => {
  const old = await code();
  const fresh = await code();
  assert.notEqual(old.code, fresh.code);
  assert.equal((await request('sam', '/connect/redeem', { code: old.code })).status, 410);
  await db.update(connectCodes).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(connectCodes.code, fresh.code));
  assert.equal((await request('sam', '/connect/redeem', { code: fresh.code })).status, 410);
});

test('ongoing moments resume on either phone and prevent overlapping hangouts', async () => {
  const invitation = await code();
  const otherInvitation = await code('other');
  const moment = await claim(invitation);
  for (const user of ['alex', 'sam']) {
    assert.equal((await (await request(user, '/connect/current')).json()).id, moment.id);
    assert.equal((await request(user, '/connect/code', {})).status, 409);
  }
  assert.equal((await request('sam', '/connect/redeem', { code: otherInvitation.code })).status, 409);
  await request('sam', `/connect/moments/${moment.id}`, { action: 'cancel' });
  assert.equal(await (await request('sam', '/connect/current')).json(), null);
  assert.equal(await hoursBetween('alex', 'sam'), 0);
  assert.equal((await db.select().from(connections)).length, 0);
});

test('unfinished hangouts expire without time credit', async () => {
  const moment = await claim(await code());
  await request('alex', `/connect/moments/${moment.id}`, { action: 'start' });
  await db.update(tapMoments).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(tapMoments.id, moment.id));
  assert.equal((await (await request('alex', `/connect/moments/${moment.id}`)).json()).status, 'expired');
  assert.equal((await request('sam', `/connect/moments/${moment.id}`, { action: 'confirm' })).status, 410);
  assert.equal(await hoursBetween('alex', 'sam'), 0);
});

test('concurrent guests cannot consume the same invitation twice', async () => {
  const invitation = await code();
  const responses = await Promise.all(['sam', 'other'].map((user) => request(user, '/connect/redeem', { code: invitation.code })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await db.select().from(tapMoments)).length, 1);
});

test('concurrent completion requests award time once', async () => {
  const moment = await claim(await code());
  await request('alex', `/connect/moments/${moment.id}`, { action: 'start' });
  await db.update(tapMoments).set({ startedAt: new Date(Date.now() - 21 * 60_000) }).where(eq(tapMoments.id, moment.id));
  const responses = await Promise.all(['alex', 'sam', 'alex', 'sam'].map((user) => request(user, `/connect/moments/${moment.id}`, { action: 'confirm' })));
  assert.deepEqual(responses.map((r) => r.status), [200, 200, 200, 200]);
  assert.equal(await hoursBetween('alex', 'sam'), 1 / 3);
});

test('the next crew fits both people, their city, and two available places', async () => {
  const base = { name: 'Weeknight climbers', city: 'SF', activity: 'climbing' as const, dayOfWeek: 2, startTime: '19:00', location: 'The gym', size: 6 };
  await db.insert(crews).values([
    { ...base, id: 'fit' },
    { ...base, id: 'wrong_city', city: 'LA' },
    { ...base, id: 'wrong_time', dayOfWeek: 6, startTime: '09:00' },
    { ...base, id: 'wrong_interest', activity: 'coffee' },
    { ...base, id: 'no_room', size: 2 },
  ]);
  await db.insert(memberships).values({ crewId: 'no_room', userId: 'other', status: 'active' });
  const moment = await claim(await code());
  assert.equal(moment.nextCrew, null);
  const started = await request('alex', `/connect/moments/${moment.id}`, { action: 'start' });
  assert.equal((await started.json()).nextCrew.id, 'fit');
  const guest = await request('sam', `/connect/moments/${moment.id}`);
  assert.equal((await guest.json()).nextCrew.id, 'fit');
});
