# 200 Hours

AI that turns strangers into friends by making time together repeat. Newcomers get matched into weekly **crews** (climbing Tuesdays, run club Saturdays), the app tracks **friendship hours** with each person toward 50 / 90 / 200, and the AI nudges the next step at the right moment. Profiles can be swapped in person over **NFC**.

- Product brief, research, and demo script: [docs/PRODUCT.md](docs/PRODUCT.md)
- Wireframes (8 screens): [docs/wireframes.png](docs/wireframes.png)
- How it's built (data model, API, AI, NFC): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Quickstart

Needs Node 22+ (24 recommended, see `.nvmrc`) and npm.

```bash
npm install
npm run db:reset     # creates apps/api/local.db and seeds a demo city
npm run api          # terminal 1 — API on http://localhost:8787
npm run mobile       # terminal 2 — Expo: press w (web), i (iOS sim), a (Android), or scan the QR with Expo Go
```

On the first screen, tap **Dev: continue as Alex** to use the seeded account (52h with Sam, a poll one vote from locking, a crew with join requests). Or onboard as a new person.

Optional:
- **AI:** `cp apps/api/.env.example apps/api/.env` and set `MUSE_API_KEY`. Without it every AI feature uses a template fallback, so the app still works.
- **Voice onboarding:** speak, review the transcript, then tap **Suggest my tags**. Mobile needs a development build; web needs a speech-enabled browser on localhost or HTTPS. Recognition may use the platform's speech service; only reviewed text reaches our API. Typing works everywhere, and suggestions indicate when the keyword fallback was used.
- **NFC:** needs a development build on a real phone: `cd apps/mobile && npx expo run:ios --device` (or `run:android`). Expo Go, simulators, and web fall back to typing a 6-letter code.
- **Phone on Wi-Fi:** the app finds the API at the IP of the machine running Metro. Override with `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`.

## Repo map

```
apps/
  mobile/          Expo (React Native) app — screens in src/app, one file per screen
  api/             Hono API + SQLite (Drizzle) + Muse Spark calls
packages/
  shared/          The contract: zod schemas, types, vocab, friendship-hours rules
docs/              Product brief, architecture, wireframes
```

Change an API shape in `packages/shared/src/schemas.ts` and TypeScript shows every caller on both sides.

## Who owns what

Four lanes, so people rarely edit the same files. Put your name in the table.

| Lane | Owner | Screens | Start here |
| --- | --- | --- | --- |
| **1. Mobile core + design system** | _TBD_ | 1 About you, 2 Your crew, 3 Home | `apps/mobile/src/app/onboarding/`, `src/app/(tabs)/home.tsx`, `src/components/`, `src/theme.ts`, `src/lib/` |
| **2. Social + NFC** | _TBD_ | 4 Discover, 6 Friend profile, Tap to connect | `src/app/(tabs)/discover.tsx`, `src/app/friend/`, `src/app/connect/`, `src/nfc/`, `apps/api/src/routes/{discover,friends,connect}.ts` |
| **3. Crews + chat (full-stack)** | _TBD_ | 5 Crew chat, 7 Start a crew, 8 Crew page | `src/app/chat/`, `src/app/crew/`, `apps/api/src/routes/{crews,chat}.ts` |
| **4. Backend core + AI** | _TBD_ | (powers all of them) | `apps/api/src/{db,domain,ai}/`, `packages/shared/` |

Each screen file starts with a comment naming its wireframe number.

## How we work

- Branch per change: `yourname/short-thing`. Small PRs into `main`; one teammate reviews.
- **Contract first:** changing a request/response shape? Update `packages/shared` in its own small PR and tell the team, then build on it.
- Before opening a PR: `npm run typecheck && npm run lint && npm test`.
- Touching another lane's files? Give the owner a heads-up first.
- Need demo data? Add it to `apps/api/src/db/seed.ts` so everyone gets it on `npm run db:reset`.

| Command | What it does |
| --- | --- |
| `npm run api` | API with reload on save |
| `npm run mobile` | Expo dev server |
| `npm run db:reset` | Sync the schema and re-seed (safe while the API runs) |
| `npm run typecheck` | Typecheck all workspaces |
| `npm test` | Unit tests (hours rules, matching) |

## Known gaps (good next tasks)

- **Auth** is a stub (`x-user-id` header). Anyone can act as anyone.
- **Phone-to-phone NFC** works by writing to a tag; Android host card emulation would make two phones tap directly (see ARCHITECTURE).
- **Check-ins** aren't verified (time/place), so hours can be faked.
- **1:1 DMs, push notifications, per-city time zones, realtime chat** (chat polls every 4s).
