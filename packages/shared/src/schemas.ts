// The API contract. The server validates request bodies with these schemas and
// the mobile app uses the inferred types for responses. Change a shape here and
// TypeScript shows you every caller on both sides.

import { z } from 'zod';

import { INTERESTS, SLOTS } from './vocab';

export const InterestSchema = z.enum(INTERESTS);
export const SlotSchema = z.enum(SLOTS);
const Interest = InterestSchema;
const Slot = SlotSchema;

/** ISO-8601 timestamp, e.g. "2026-10-28T02:00:00.000Z". */
const Timestamp = z.string();

// --- Building blocks ---------------------------------------------------------

export const PublicProfile = z.object({
  id: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  city: z.string(),
  interests: z.array(Interest),
  /** Hinge-style prompt shown on Discover. */
  prompt: z.object({ question: z.string(), answer: z.string() }).nullable(),
});
export type PublicProfile = z.infer<typeof PublicProfile>;

export const CrewSummary = z.object({
  id: z.string(),
  name: z.string(),
  activity: Interest,
  dayOfWeek: z.number().int().min(0).max(6),
  /** "HH:MM", local to the crew's city. */
  startTime: z.string(),
  slot: Slot,
  location: z.string(),
  size: z.number().int(),
  memberCount: z.number().int(),
});
export type CrewSummary = z.infer<typeof CrewSummary>;

export const AttendanceStatus = z.enum(['going', 'checked_in']);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const SessionSummary = z.object({
  id: z.string(),
  crewId: z.string(),
  crewName: z.string(),
  title: z.string().nullable(),
  startsAt: Timestamp,
  durationMinutes: z.number().int(),
  location: z.string(),
  attendees: z.array(PublicProfile),
  myStatus: AttendanceStatus.nullable(),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export const FriendLevel = z.enum(['new', 'casual', 'friend', 'close']);
export type FriendLevel = z.infer<typeof FriendLevel>;

export const Progress = z.object({
  hours: z.number(),
  level: FriendLevel,
  /** Next milestone (50 / 90 / 200), or null once someone is a close friend. */
  nextThreshold: z.number().nullable(),
  /** 0–1 fill for the ring on Home. */
  progress: z.number().min(0).max(1),
});
export type Progress = z.infer<typeof Progress>;

export const Person = z.object({ user: PublicProfile, progress: Progress });
export type Person = z.infer<typeof Person>;

export const ChatSummary = z.object({
  crewId: z.string(),
  crewName: z.string(),
  activity: Interest,
  lastMessage: z.string().nullable(),
  unread: z.number().int(),
});
export type ChatSummary = z.infer<typeof ChatSummary>;

// --- Screen 1–2: onboarding --------------------------------------------------

export const OnboardingInput = z.object({
  name: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(60).default('San Francisco'),
  interests: z.array(Interest).min(1),
  availability: z.array(Slot).min(1),
});
export type OnboardingInput = z.input<typeof OnboardingInput>;

export const ExtractInterestsInput = z.object({ text: z.string().trim().min(1).max(2000) });
export const ExtractInterestsResult = z.object({
  interests: z.array(Interest),
  availability: z.array(Slot),
});
export type ExtractInterestsResult = z.infer<typeof ExtractInterestsResult>;

export const InterestSuggestion = ExtractInterestsResult.extend({
  source: z.enum(['ai', 'fallback']),
});
export type InterestSuggestion = z.infer<typeof InterestSuggestion>;

export const CrewSuggestion = z.object({
  crew: CrewSummary,
  members: z.array(PublicProfile),
  /** One line from the AI: why this crew fits you. */
  reason: z.string(),
});
export type CrewSuggestion = z.infer<typeof CrewSuggestion>;

// --- Screen 3: home ----------------------------------------------------------

export const Home = z.object({
  me: PublicProfile,
  nextSession: SessionSummary.nullable(),
  people: z.array(Person),
  chats: z.array(ChatSummary),
});
export type Home = z.infer<typeof Home>;

export const AttendanceInput = z.object({ status: AttendanceStatus });

// --- Screen 4: discover ------------------------------------------------------

export const DiscoverCard = z.object({ user: PublicProfile, sharedInterests: z.array(Interest) });
export type DiscoverCard = z.infer<typeof DiscoverCard>;

export const LikeInput = z.object({
  toUserId: z.string(),
  /** Optional reply to their prompt. */
  comment: z.string().trim().max(280).optional(),
});
export const LikeResult = z.object({ matched: z.boolean() });
export type LikeResult = z.infer<typeof LikeResult>;

export const JoinResult = z.object({ status: z.enum(['active', 'pending']) });
export type JoinResult = z.infer<typeof JoinResult>;

// --- Screen 5: crew chat -----------------------------------------------------

export const Poll = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.object({ label: z.string(), votes: z.number().int(), votedByMe: z.boolean() })),
  /** Set once a majority agrees; the plan is then on everyone's week. */
  lockedIndex: z.number().int().nullable(),
});
export type Poll = z.infer<typeof Poll>;

export const Message = z.object({
  id: z.string(),
  kind: z.enum(['text', 'poll', 'ai']),
  /** null for AI-authored messages. */
  author: PublicProfile.nullable(),
  text: z.string(),
  pollId: z.string().nullable(),
  createdAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

export const ChatThread = z.object({
  crew: CrewSummary,
  messages: z.array(Message),
  polls: z.record(z.string(), Poll),
});
export type ChatThread = z.infer<typeof ChatThread>;

export const SendMessageInput = z.object({ text: z.string().trim().min(1).max(2000) });
export const VoteInput = z.object({ optionIndex: z.number().int().min(0) });

// --- Screen 6: friend profile ------------------------------------------------

export const FriendProfile = z.object({
  user: PublicProfile,
  progress: Progress,
  sharedInterests: z.array(Interest),
  sharedCrews: z.array(CrewSummary),
  /** AI nudge, e.g. "12 hours with Sam at climbing. Invite Sam to grab food after." */
  nextStep: z.string(),
});
export type FriendProfile = z.infer<typeof FriendProfile>;

// --- Screen 7–8: start a crew / crew page ------------------------------------

export const CrewDemand = z.object({ activity: Interest, interestedCount: z.number().int() });
export type CrewDemand = z.infer<typeof CrewDemand>;

export const NewCrewInput = z.object({
  name: z.string().trim().min(1).max(60),
  activity: Interest,
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  location: z.string().trim().min(1).max(120),
  size: z.number().int().min(2).max(20),
});
export type NewCrewInput = z.infer<typeof NewCrewInput>;

export const CrewPage = z.object({
  crew: CrewSummary,
  nextSession: SessionSummary.nullable(),
  members: z.array(PublicProfile),
  /** Join requests; only populated for the crew's owner. */
  pending: z.array(PublicProfile),
  isOwner: z.boolean(),
  myStatus: z.enum(['active', 'pending']).nullable(),
});
export type CrewPage = z.infer<typeof CrewPage>;

export const MemberDecisionInput = z.object({ action: z.enum(['approve', 'decline']) });

// --- NFC connect -------------------------------------------------------------

export const ConnectCode = z.object({ code: z.string(), url: z.string(), expiresAt: Timestamp });
export type ConnectCode = z.infer<typeof ConnectCode>;

export const RedeemInput = z.object({ code: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9]{4,12}$/)) });
export const ConnectResult = z.object({ user: PublicProfile, sharedInterests: z.array(Interest) });
export type ConnectResult = z.infer<typeof ConnectResult>;
