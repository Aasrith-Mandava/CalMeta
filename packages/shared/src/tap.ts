import type { Interest } from './vocab';
import type { TapActivity } from './schemas';

/** Small, immediate activities; no model latency or suggested venue to travel to. */
const ACTIVITIES: Record<Interest, Omit<TapActivity, 'source'>> = {
  climbing: { title: 'Trade a beta, tell a story', prompt: 'Each share a climb that surprised you, then pick a problem to try together next time.' },
  running: { title: 'Find your next running route', prompt: 'Take an easy walk together. Each describe a favorite route and choose one to run another day.' },
  board_games: { title: 'Invent your house rules', prompt: 'Each pitch a favorite game. Together invent one ridiculous house rule and plan a rematch.' },
  pickleball: { title: 'Find your doubles partner', prompt: 'Swap your best and worst shots, then choose a court to play together another day.' },
  cooking: { title: 'Build a two-person menu', prompt: 'Each bring a favorite ingredient to an imaginary dinner. Build a menu and swap the story behind one dish.' },
  hiking: { title: 'Map a little adventure', prompt: 'Take a short stroll together. Swap favorite outdoor spots and choose a trail for another day.' },
  tacos: { title: 'The great taco debate', prompt: 'Build your perfect taco, compare your strongest food opinions, and pick a spot for a future taste test.' },
  live_music: { title: 'Make a two-song soundtrack', prompt: 'Each pick a song with a story. Share why it matters and choose a show you would both want to see.' },
  yoga: { title: 'A little room to breathe', prompt: 'Find a comfortable spot. Share what helps you unwind and plan a class or gentle walk together.' },
  cycling: { title: 'Design your next ride', prompt: 'Each describe a favorite ride. Sketch a route together, with a very important snack stop.' },
  trivia: { title: 'Your very own trivia round', prompt: 'Take turns asking questions about your oddly specific interests. Pick a team name for your next trivia night.' },
  coffee: { title: 'Coffee and a good question', prompt: 'If there is coffee nearby, grab a cup. Each share a small thing that made this week better.' },
};

export function tapActivity(interests: Interest[]): TapActivity {
  const activity = interests[0] ? ACTIVITIES[interests[0]] : {
    title: 'Two stories, one new friend',
    prompt: 'Each share a place that feels like home and something you would love to try in this city. Find one thing to do together next time.',
  };
  return { ...activity, source: 'template' };
}
