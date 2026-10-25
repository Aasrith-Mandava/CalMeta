# Architecture

```mermaid
flowchart LR
  subgraph Phone["Mobile app (Expo / React Native)"]
    UI["Screens 1–8<br/>src/app"] --> Client["lib/api.ts<br/>typed fetch"]
    NFC["nfc/<br/>read + write tags"]
  end
  Client -->|"JSON + x-user-id"| API["API (Hono, Node)<br/>apps/api"]
  API --> DB[("SQLite via libsql<br/>local.db or Turso")]
  API -->|"OpenAI-compatible<br/>/chat/completions"| Muse["Muse Spark"]
  NFC <-->|"twohundredhours://connect/CODE"| Tag["NFC tag / sticker"]
  Shared["packages/shared<br/>zod schemas + types"] -.-> UI
  Shared -.-> API
```

**Why this stack:** one language (TypeScript) end to end so any teammate can work on any lane; a shared zod package is the API contract; SQLite needs zero setup and can move to a hosted Turso DB by changing `DATABASE_URL`; Expo gets one codebase onto iOS, Android, and web.

## Data model

All tables live in [apps/api/src/db/schema.ts](../apps/api/src/db/schema.ts). IDs are readable prefixed strings (`u_sam`, `c_climb`).

| Table | What it holds |
| --- | --- |
| `users` | Profile, interests, availability slots, one Hinge-style prompt |
| `crews` | Weekly activity: day, start time, place, size. `owner_id` null = AI-run (open join); set = owner approves joins |
| `memberships` | Who is in which crew (`active` / `pending`), plus `last_read_at` for unread counts |
| `sessions` | One meeting of a crew. Weekly ones are created lazily; one-off plans locked by a poll have a `title` |
| `attendance` | `going` or `checked_in` per person per session. **Friendship hours come from here** |
| `messages`, `polls`, `votes` | Crew chat, AI plan polls, votes |
| `likes`, `connections` | Discover likes; mutual likes and NFC taps become connections |
| `connect_codes` | Short-lived codes carried by NFC tags |

## Friendship hours

Hours between two people = the summed duration of every session **both** checked in to ([domain/hours.ts](../apps/api/src/domain/hours.ts)). Milestones follow Hall (2018): 50h casual friend, 90h friend, 200h close friend ([packages/shared/src/hours.ts](../packages/shared/src/hours.ts)). The ring on Home fills as hours / next milestone.

Next sources to add: logged 1:1 hangouts ("food after climbing") and verified check-ins (time window plus location or an NFC tap at the venue).

## Matching

Pure functions in [domain/matching.ts](../apps/api/src/domain/matching.ts), unit-tested:
- **Crews:** exclude full crews and crews outside your free slots; a shared interest dominates; then prefer crews that already have a few people but still have room.
- **People (Discover):** most shared interests first; hides people you've liked, connected with, or already spend time with.

## AI (Muse Spark)

Every AI call goes through one function, `generate()` in [ai/client.ts](../apps/api/src/ai/client.ts): it sends the prompt plus a JSON Schema (generated from a zod schema) to an OpenAI-compatible `/chat/completions` endpoint, extracts the JSON reply, and validates it. On any failure it returns `null`, and every feature in [ai/features.ts](../apps/api/src/ai/features.ts) falls back to a template, so the app never blocks on AI.

| Feature | Screen | Function | Cached |
| --- | --- | --- | --- |
| Free text → interest + availability chips | 1 | `extractInterests` | no |
| "Why this crew" one-liner | 2 | `crewReason` | 24h per person+crew |
| Plan ideas posted as a poll | 5 | `planPoll` | no |
| Level-up nudge ("12 hours with Sam… invite Sam to food after") | 6 | `nextStep` | per 5 hours of progress |

**Provider config** (`apps/api/.env`): `MUSE_API_KEY`, `MUSE_BASE_URL` (default `https://api.meta.ai/v1`), `MUSE_MODEL` (default `muse-spark-1.3`). Get a key from the [Meta Model API dashboard](https://dev.meta.ai/). See the [official quickstart](https://dev.meta.ai/docs/quickstart). Compatible providers can override the base URL and model.

**Voice onboarding:** `expo-speech-recognition` uses native iOS/Android speech recognition or Web Speech Recognition. The user starts and stops the mic, reviews an editable transcript, then taps **Suggest my tags** to call `/ai/interests`. Only text reaches our backend. Recording stops after at most 60 seconds and is aborted when leaving the screen. Mobile requires a development build with microphone/speech permissions; Expo Go and unsupported browsers keep the typed path. Recognition may contact the platform's speech service. The API validates up to 2,000 characters and returns `source: ai | fallback` with the tags. Muse Spark interprets the transcript; it does not transcribe audio in this flow. Meta currently [notes degraded audio support for Spark 1.3](https://dev.meta.ai/docs/video-understanding).

## NFC profile exchange

A tag never carries profile data, only `twohundredhours://connect/<CODE>`. Codes are 6 characters, live for 10 minutes, and are redeemed server-side, which then creates a `connection`.

```mermaid
sequenceDiagram
  participant A as Alex's phone
  participant API
  participant T as NFC tag
  participant B as Sam's phone
  A->>API: POST /connect/code
  API-->>A: { code: K7P2QX, url }
  A->>T: write NDEF URI record
  B->>T: tap / scan
  B->>API: POST /connect/redeem { code }
  API-->>B: Alex's profile (connection created)
```

**What works where** (worth re-checking against current OS docs):

| | iPhone | Android |
| --- | --- | --- |
| Read a tag | ✓ (iPhone 7+) | ✓ |
| Write a tag | ✓ | ✓ |
| Phone acts *as* a tag (true phone-to-phone) | ✗ for normal apps: Apple's card-emulation API needs a special entitlement | ✓ via host card emulation (HCE), not wired up yet |

So the dependable demo is: **share** = write your code to a cheap NFC sticker or card (or show the code), **receive** = scan it. Stretch goal: Android HCE (e.g. `react-native-hce`) so an Android phone can be tapped directly. Typing the code works everywhere, including Expo Go and web.

NFC needs a development build (`npx expo run:ios --device` / `run:android`); the config plugin in `apps/mobile/app.json` adds the iOS permission string and entitlement.

## API

All bodies are validated against `packages/shared` schemas; errors are always `{ "message": string }`. Everything except the first group needs the `x-user-id` header.

| Method | Path | Screen |
| --- | --- | --- |
| POST | `/users` | 1: create account |
| POST | `/ai/interests` | 1: text → chips |
| GET | `/users`, `/users/:id` | dev helper / profile |
| GET | `/me/crew-suggestion?skip=` | 2 |
| POST | `/crews/:id/join` | 2, 4, 8 |
| GET | `/me/home`, `/me/chats` | 3, Chats tab |
| POST | `/sessions/:id/attendance` `{status}` | 3 check in, 8 going |
| GET | `/discover/people`, `/discover/crews` | 4 |
| POST | `/likes` | 4 |
| GET/POST | `/crews/:id/messages` | 5 |
| POST | `/crews/:id/plan`, `/polls/:id/vote` | 5 |
| GET | `/friends/:userId` | 6 |
| GET | `/crews/demand?activity=` | 7 |
| POST | `/crews` | 7 |
| GET | `/crews/:id` | 8 |
| POST | `/crews/:id/members/:userId` `{action}` | 8 |
| POST | `/connect/code`, `/connect/redeem` | Tap to connect |

## Auth

Hackathon stub: the app stores a user id on the device and sends it as `x-user-id` ([apps/api/src/auth.ts](../apps/api/src/auth.ts)). Replace it before real users (e.g. Clerk, Supabase Auth, or Sign in with Apple), keeping `c.get('userId')` as the interface routes use.
