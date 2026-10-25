import type { AttendanceStatus, Interest, Slot } from '@200h/shared';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Timestamps are stored as epoch milliseconds and surface as Date objects.
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  photoUrl: text('photo_url'),
  city: text('city').notNull(),
  interests: text('interests', { mode: 'json' }).$type<Interest[]>().notNull(),
  availability: text('availability', { mode: 'json' }).$type<Slot[]>().notNull(),
  promptQuestion: text('prompt_question'),
  promptAnswer: text('prompt_answer'),
  createdAt: createdAt(),
});

/**
 * A recurring weekly activity. `ownerId` null means an AI-run crew anyone can join;
 * otherwise the owner approves join requests (screen 8).
 */
export const crews = sqliteTable('crews', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  activity: text('activity').$type<Interest>().notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: text('start_time').notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(120),
  location: text('location').notNull(),
  city: text('city').notNull(),
  size: integer('size').notNull(),
  ownerId: text('owner_id').references(() => users.id),
  createdAt: createdAt(),
});

export const memberships = sqliteTable(
  'memberships',
  {
    crewId: text('crew_id')
      .notNull()
      .references(() => crews.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['active', 'pending'] }).notNull(),
    /** Drives unread counts on Home. */
    lastReadAt: integer('last_read_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);

/**
 * One meeting of a crew. Weekly occurrences are created lazily (see upcomingSession);
 * one-off plans locked by a poll have a `title`.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    crewId: text('crew_id')
      .notNull()
      .references(() => crews.id),
    title: text('title'),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    location: text('location').notNull(),
  },
  (t) => [index('sessions_crew_idx').on(t.crewId, t.startsAt)],
);

/** Friendship hours come from here: two people `checked_in` to the same session share its duration. */
export const attendance = sqliteTable(
  'attendance',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').$type<AttendanceStatus>().notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] }), index('attendance_user_idx').on(t.userId)],
);

export interface PlanOption {
  label: string;
  dayOfWeek: number;
  startTime: string;
}

export const polls = sqliteTable('polls', {
  id: text('id').primaryKey(),
  crewId: text('crew_id')
    .notNull()
    .references(() => crews.id),
  question: text('question').notNull(),
  options: text('options', { mode: 'json' }).$type<PlanOption[]>().notNull(),
  lockedIndex: integer('locked_index'),
  createdAt: createdAt(),
});

export const votes = sqliteTable(
  'votes',
  {
    pollId: text('poll_id')
      .notNull()
      .references(() => polls.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    optionIndex: integer('option_index').notNull(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId] })],
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    crewId: text('crew_id')
      .notNull()
      .references(() => crews.id),
    /** null = posted by the AI. */
    authorId: text('author_id').references(() => users.id),
    kind: text('kind', { enum: ['text', 'poll', 'ai'] }).notNull(),
    text: text('text').notNull(),
    pollId: text('poll_id').references(() => polls.id),
    createdAt: createdAt(),
  },
  (t) => [index('messages_crew_idx').on(t.crewId, t.createdAt)],
);

export const likes = sqliteTable(
  'likes',
  {
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => users.id),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => users.id),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.fromUserId, t.toUserId] })],
);

/** A mutual connection from an NFC tap or a mutual like. Stored once, with userA < userB. */
export const connections = sqliteTable(
  'connections',
  {
    userA: text('user_a')
      .notNull()
      .references(() => users.id),
    userB: text('user_b')
      .notNull()
      .references(() => users.id),
    source: text('source', { enum: ['nfc', 'like'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userA, t.userB] })],
);

/** Short-lived codes carried by NFC tags (or typed in). */
export const connectCodes = sqliteTable('connect_codes', {
  code: text('code').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

/** A single-use invitation with consent, a server clock, and two completion receipts. */
export const tapMoments = sqliteTable('tap_moments', {
  id: text('id').primaryKey(),
  code: text('code').notNull().references(() => connectCodes.code),
  hostId: text('host_id').notNull().references(() => users.id),
  guestId: text('guest_id').notNull().references(() => users.id),
  status: text('status', { enum: ['pending', 'active', 'completed', 'cancelled'] }).notNull().default('pending'),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  activitySource: text('activity_source', { enum: ['ai', 'template'] }).notNull().default('template'),
  sharedInterests: text('shared_interests', { mode: 'json' }).$type<Interest[]>().notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(20),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  hostConfirmedAt: integer('host_confirmed_at', { mode: 'timestamp_ms' }),
  guestConfirmedAt: integer('guest_confirmed_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('tap_moments_code_idx').on(t.code),
  index('tap_moments_host_idx').on(t.hostId, t.status),
  index('tap_moments_guest_idx').on(t.guestId, t.status),
]);
