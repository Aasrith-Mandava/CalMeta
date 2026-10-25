import { tapActivity, type Interest, type Slot } from '@200h/shared';

import { nextOccurrence } from '../domain/views';
import { db } from './client';
import {
  attendance,
  connectCodes,
  connections,
  crews,
  likes,
  memberships,
  messages,
  polls,
  sessions,
  tapMoments,
  users,
  votes,
} from './schema';

// Demo data. Sign in as Alex (u_alex) to see a lived-in account:
// 52h with Sam (matches the wireframe), a poll one vote from locking,
// unread chats, and a crew Alex owns with pending join requests.

const CITY = 'San Francisco';
const WEEK = 7 * 86_400_000;

type Person = [id: string, name: string, interests: Interest[], availability: Slot[], prompt: [string, string]];

const people: Person[] = [
  ['u_alex', 'Alex', ['climbing', 'board_games', 'tacos', 'hiking'], ['weeknights', 'weekend_pm'], ['Best taco in the Mission', 'La Taqueria, no rice. Fight me.']],
  ['u_sam', 'Sam', ['climbing', 'tacos', 'live_music'], ['weeknights', 'weekend_am'], ['I moved here for', 'A job in Dogpatch and the bouldering.']],
  ['u_priya', 'Priya', ['running', 'board_games', 'coffee'], ['weeknights', 'weekend_am'], ['A perfect Saturday', 'Run club, pastries, then a four-hour board game.']],
  ['u_leo', 'Leo', ['climbing', 'pickleball', 'cooking'], ['weeknights', 'weekend_pm'], ['Teach me something about', 'Fermentation. I have three kinds of kimchi going.']],
  ['u_maya', 'Maya', ['hiking', 'cooking', 'board_games'], ['weeknights', 'weekend_pm'], ['Green flag', 'You bring snacks to a hike without being asked.']],
  ['u_jordan', 'Jordan', ['pickleball', 'running', 'trivia'], ['weekend_am', 'weekend_pm'], ['My trivia specialty', '90s one-hit wonders.']],
  ['u_nina', 'Nina', ['yoga', 'coffee', 'hiking'], ['weekend_am'], ['Ask me about', 'Every coffee shop between here and Ocean Beach.']],
  ['u_omar', 'Omar', ['live_music', 'tacos', 'cycling'], ['weeknights', 'weekend_pm'], ['Last great show', 'A tiny jazz set at the Make-Out Room.']],
  ['u_kai', 'Kai', ['board_games', 'trivia', 'coffee'], ['weeknights'], ['Unpopular opinion', 'Monopoly is fine if you skip Free Parking money.']],
  ['u_rosa', 'Rosa', ['pickleball', 'tacos', 'yoga'], ['weeknights', 'weekend_am'], ['Looking for', 'People who say yes to "one more game."']],
];

type CrewDef = {
  id: string;
  name: string;
  activity: Interest;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  location: string;
  size: number;
  ownerId?: string;
  members: string[];
  pending?: string[];
  /** userId → how many of the most recent weekly sessions they checked in to. */
  history?: Record<string, number>;
};

const crewDefs: CrewDef[] = [
  { id: 'c_climb', name: 'Tuesday Climbers', activity: 'climbing', dayOfWeek: 2, startTime: '19:00', durationMinutes: 120, location: 'Mission Cliffs', size: 8, members: ['u_alex', 'u_sam', 'u_leo'], history: { u_alex: 26, u_sam: 26, u_leo: 17 } },
  { id: 'c_games', name: 'Board Game Thursdays', activity: 'board_games', dayOfWeek: 4, startTime: '19:30', durationMinutes: 120, location: 'Game Parlor, Inner Sunset', size: 6, members: ['u_alex', 'u_priya', 'u_maya', 'u_kai'], history: { u_alex: 9, u_priya: 9, u_maya: 4, u_kai: 2 } },
  { id: 'c_run', name: 'Saturday Run Club', activity: 'running', dayOfWeek: 6, startTime: '08:30', durationMinutes: 90, location: 'Crissy Field', size: 12, members: ['u_priya', 'u_jordan', 'u_nina'] },
  { id: 'c_pickle', name: 'Pickleball Sundays', activity: 'pickleball', dayOfWeek: 0, startTime: '10:00', durationMinutes: 120, location: 'Golden Gate Park courts', size: 8, members: ['u_jordan', 'u_rosa', 'u_leo'] },
  { id: 'c_hike', name: 'Sunday Hikers', activity: 'hiking', dayOfWeek: 0, startTime: '14:00', durationMinutes: 180, location: 'Lands End trailhead', size: 10, members: ['u_maya', 'u_nina'] },
  { id: 'c_tacos', name: 'Taco Tour', activity: 'tacos', dayOfWeek: 5, startTime: '19:00', durationMinutes: 120, location: '24th St Mission BART', size: 6, ownerId: 'u_alex', members: ['u_alex', 'u_omar'], pending: ['u_rosa', 'u_sam'] },
];

async function seed() {
  // Children before parents (foreign keys).
  for (const table of [votes, messages, polls, attendance, sessions, memberships, likes, connections, tapMoments, connectCodes, crews, users]) {
    await db.delete(table);
  }

  await db.insert(users).values(
    people.map(([id, name, interests, availability, [promptQuestion, promptAnswer]]) => ({
      id, name, city: CITY, interests, availability, promptQuestion, promptAnswer,
    })),
  );

  const now = new Date();
  for (const def of crewDefs) {
    const { members, pending = [], history = {}, ...crew } = def;
    await db.insert(crews).values({ ...crew, city: CITY, ownerId: crew.ownerId ?? null });
    await db.insert(memberships).values([
      ...members.map((userId) => ({ crewId: crew.id, userId, status: 'active' as const })),
      ...pending.map((userId) => ({ crewId: crew.id, userId, status: 'pending' as const })),
    ]);

    // Past weekly sessions with check-ins: this is where friendship hours come from.
    const weeks = Math.max(0, ...Object.values(history));
    const next = nextOccurrence(crew.dayOfWeek, crew.startTime, now);
    for (let k = 1; k <= weeks; k++) {
      const sessionId = `s_${crew.id.slice(2)}_${k}`;
      await db.insert(sessions).values({
        id: sessionId,
        crewId: crew.id,
        startsAt: new Date(next.getTime() - k * WEEK),
        durationMinutes: crew.durationMinutes,
        location: crew.location,
      });
      const present = Object.entries(history).filter(([, n]) => k <= n);
      if (present.length) {
        await db
          .insert(attendance)
          .values(present.map(([userId]) => ({ sessionId, userId, status: 'checked_in' as const })));
      }
    }
  }

  // Chat history, a poll one vote away from locking (Sam voted; Alex's vote makes 2 of 3), and unread counts.
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  await db.insert(polls).values({
    id: 'p_climb_weekend',
    crewId: 'c_climb',
    question: 'This weekend? Tap to vote',
    options: [
      { label: 'Tacos after climbing', dayOfWeek: 2, startTime: '21:00' },
      { label: 'Saturday brunch', dayOfWeek: 6, startTime: '11:00' },
      { label: 'Sunday hike at Lands End', dayOfWeek: 0, startTime: '10:00' },
    ],
  });
  await db.insert(votes).values({ pollId: 'p_climb_weekend', userId: 'u_sam', optionIndex: 0 });
  await db.insert(messages).values([
    { id: 'm_1', crewId: 'c_climb', authorId: 'u_sam', kind: 'text', text: "Who's in Tuesday? I'm trying the new V4.", createdAt: minutesAgo(300) },
    { id: 'm_2', crewId: 'c_climb', authorId: 'u_leo', kind: 'text', text: 'Me. Bringing the new shoes.', createdAt: minutesAgo(280) },
    { id: 'm_3', crewId: 'c_climb', authorId: null, kind: 'poll', text: 'This weekend? Tap to vote', pollId: 'p_climb_weekend', createdAt: minutesAgo(120) },
    { id: 'm_4', crewId: 'c_climb', authorId: null, kind: 'ai', text: 'Sam and Alex both love tacos. La Taqueria is a 6 minute walk from the gym.', createdAt: minutesAgo(119) },
    { id: 'm_5', crewId: 'c_games', authorId: 'u_priya', kind: 'text', text: 'Bringing Wingspan this week!', createdAt: minutesAgo(90) },
    { id: 'm_6', crewId: 'c_games', authorId: 'u_kai', kind: 'text', text: "I'll bring snacks. Maya, rematch?", createdAt: minutesAgo(60) },
    { id: 'm_7', crewId: 'c_tacos', authorId: 'u_omar', kind: 'text', text: 'Friday route: El Farolito → Taqueria Cancún → Pancho Villa?', createdAt: minutesAgo(30) },
  ]);

  // A completed First 20 is explicit seeded history for the short stage demo.
  await db.insert(connections).values({ userA: 'u_alex', userB: 'u_nina', source: 'nfc' });
  const firstStart = new Date(now.getTime() - 2 * 86_400_000);
  const firstEnd = new Date(firstStart.getTime() + 20 * 60_000);
  const idea = tapActivity(['hiking']);
  await db.insert(connectCodes).values({ code: 'K7P2QX', userId: 'u_alex', expiresAt: firstStart });
  await db.insert(tapMoments).values({
    id: 'tap_demo_nina', code: 'K7P2QX', hostId: 'u_alex', guestId: 'u_nina', status: 'completed',
    title: idea.title, prompt: idea.prompt, activitySource: idea.source, sharedInterests: ['hiking'], durationMinutes: 20,
    startedAt: firstStart, expiresAt: new Date(firstStart.getTime() + 86_400_000),
    hostConfirmedAt: firstEnd, guestConfirmedAt: firstEnd, completedAt: firstEnd,
  });

  console.log(`Seeded ${people.length} people and ${crewDefs.length} crews in ${CITY}. Sign in as u_alex.`);
}

await seed();
