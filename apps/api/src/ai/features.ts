import {
  ExtractInterestsResult,
  INTEREST_LABELS,
  INTERESTS,
  THRESHOLDS,
  formatWeekly,
  type Interest,
  type Slot,
} from '@200h/shared';
import { z } from 'zod';

import type { PlanOption } from '../db/schema';
import { cached, generate } from './client';

// Every AI feature lives here, each with a deterministic fallback so the product
// works (and demos) without a key. Prompt-tuning happens in this file.

const HOUR = 3_600_000;

export interface PersonContext {
  id: string;
  name: string;
  interests: Interest[];
}

export interface CrewContext {
  id: string;
  name: string;
  activity: Interest;
  dayOfWeek: number;
  startTime: string;
  location: string;
  memberNames: string[];
}

const describeCrew = (crew: CrewContext) => ({
  name: crew.name,
  activity: INTEREST_LABELS[crew.activity],
  when: `every ${formatWeekly(crew.dayOfWeek, crew.startTime)}`,
  where: crew.location,
  members: crew.memberNames,
});

// --- Screen 1: "say them out loud" → chips -----------------------------------------

export async function extractInterests(text: string): Promise<ExtractInterestsResult> {
  const ai = await generate({
    system:
      'You tag a newcomer for a friend-making app that groups people into weekly activity crews. ' +
      'Use only the allowed tags. Leave a list empty rather than guess.',
    prompt:
      `Allowed interests: ${INTERESTS.join(', ')}\n` +
      'Allowed availability: weeknights (Mon–Fri evenings), weekend_am, weekend_pm\n\n' +
      `What they said:\n"""${text}"""`,
    schema: ExtractInterestsResult,
  });
  return ai ?? keywordTags(text);
}

function keywordTags(text: string): ExtractInterestsResult {
  const t = text.toLowerCase();
  const interests = INTERESTS.filter((i) => t.includes(INTEREST_LABELS[i].toLowerCase()));
  const availability: Slot[] = [];
  if (/weeknight|evening|after work/.test(t)) availability.push('weeknights');
  if (/morning/.test(t)) availability.push('weekend_am');
  if (/afternoon|weekend/.test(t)) availability.push('weekend_pm');
  return { interests, availability };
}

// --- Screen 2: why this crew (one line) ----------------------------------------------

export function crewReason(person: PersonContext, crew: CrewContext): Promise<string> {
  return cached(`reason:${person.id}:${crew.id}`, 24 * HOUR, async () => {
    const ai = await generate({
      system:
        'You write the single line telling a newcomer why a weekly activity crew fits them. ' +
        'At most 18 words. Warm and specific. No emoji, no exclamation marks.',
      prompt: JSON.stringify({
        newcomer: { name: person.name, interests: person.interests.map((i) => INTEREST_LABELS[i]) },
        crew: describeCrew(crew),
      }),
      schema: z.object({ reason: z.string() }),
    });
    return (
      ai?.reason ??
      `${INTEREST_LABELS[crew.activity]} every ${formatWeekly(crew.dayOfWeek, crew.startTime)}, ` +
        `with ${crew.memberNames.length} other newcomers already in.`
    );
  });
}

// --- Screen 5: AI posts ideas as a poll ------------------------------------------------

export interface Plan {
  question: string;
  options: PlanOption[];
}

const PlanSchema = z.object({
  question: z.string(),
  options: z.array(z.object({ label: z.string(), dayOfWeek: z.number().int(), startTime: z.string() })),
});

export async function planPoll(crew: CrewContext, groupInterests: Interest[]): Promise<Plan> {
  const ai = await generate({
    system:
      'You help a weekly activity crew of newcomers spend more time together. Propose exactly 3 concrete, ' +
      'low-cost plans for the coming week that build on what the group shares, often right before or after ' +
      'their usual session. Labels under 40 characters. dayOfWeek is 0 (Sunday) to 6 (Saturday); ' +
      'startTime is 24h "HH:MM". The question is a short, friendly prompt to vote.',
    prompt: JSON.stringify({ crew: describeCrew(crew), groupInterests: groupInterests.map((i) => INTEREST_LABELS[i]) }),
    schema: PlanSchema,
  });
  const options = (ai?.options ?? []).filter(
    (o) => o.dayOfWeek >= 0 && o.dayOfWeek <= 6 && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.startTime),
  );
  if (ai && options.length >= 2) return { question: ai.question, options: options.slice(0, 3) };

  const [h = 19, m = 0] = crew.startTime.split(':').map(Number);
  const after = `${String(Math.min(h + 2, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return {
    question: 'This weekend? Tap to vote',
    options: [
      { label: `Food after ${INTEREST_LABELS[crew.activity].toLowerCase()}`, dayOfWeek: crew.dayOfWeek, startTime: after },
      { label: 'Saturday brunch', dayOfWeek: 6, startTime: '11:00' },
      { label: 'Sunday walk + coffee', dayOfWeek: 0, startTime: '10:00' },
    ],
  };
}

// --- Screen 6: the level-up nudge -------------------------------------------------------

export function nextStep(
  me: PersonContext,
  friend: PersonContext,
  hours: number,
  shared: Interest[],
  crewNames: string[],
): Promise<string> {
  // Re-generate every 5 hours of progress, not on every page view.
  const bucket = Math.floor(hours / 5);
  return cached(`next:${me.id}:${friend.id}:${bucket}`, 12 * HOUR, async () => {
    const ai = await generate({
      system:
        'You coach a newcomer turning an acquaintance into a friend. About 50 hours together makes casual ' +
        'friends, 90 makes friends, 200+ makes close friends. Suggest ONE next step that adds time together ' +
        'or deepens it, e.g. food after their usual session, or a 1:1 plan around a shared interest. ' +
        'Open with the hours and where they spend them, then the suggestion. Under 25 words. ' +
        "Always use the friend's name, never a pronoun, for the friend.",
      prompt: JSON.stringify({
        me: me.name,
        friend: friend.name,
        hoursTogether: Math.round(hours),
        sharedInterests: shared.map((i) => INTEREST_LABELS[i]),
        crewsTogether: crewNames,
      }),
      schema: z.object({ suggestion: z.string() }),
    });
    return ai?.suggestion ?? templateNextStep(friend.name, hours, shared, crewNames);
  });
}

function templateNextStep(name: string, hours: number, shared: Interest[], crewNames: string[]): string {
  const h = Math.round(hours);
  const where = crewNames[0] ? ` at ${crewNames[0]}` : '';
  const idea = shared[0] ? INTEREST_LABELS[shared[0]].toLowerCase() : 'coffee';
  if (hours < 10) return `${h} hours with ${name}${where}. Say hi and team up at the next session.`;
  if (hours < THRESHOLDS.casual) return `${h} hours with ${name}${where}. Invite ${name} to grab food after.`;
  if (hours < THRESHOLDS.friend) return `${h} hours: you and ${name} are casual friends. Plan something just you two, like ${idea}.`;
  return `${h} hours with ${name}. Make it a standing plan: a monthly ${idea} night.`;
}
