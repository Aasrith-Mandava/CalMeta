# 200 Hours

npm-workspaces monorepo: `apps/mobile` (Expo), `apps/api` (Hono + Drizzle/SQLite + Muse Spark), `packages/shared` (zod contract). Read README.md for lanes and docs/ARCHITECTURE.md for the data model, API table, and NFC constraints. `apps/mobile` has its own AGENTS.md with Expo-specific rules.

## Commands

- `npm run api` / `npm run mobile` start the dev servers (run them through these scripts so they start in the right workspace).
- `npm run db:reset` re-syncs the schema and re-seeds; seeded login is `u_alex`.
- `npm run typecheck && npm run lint && npm test` must pass before a PR.

## Conventions

- API shapes live in `packages/shared/src/schemas.ts`. Change the shape there first, then the server route and the screen.
- Validate request bodies with `validate()` from `apps/api/src/validate.ts`; throw `HTTPException` for errors. Responses for errors are always `{ message }`.
- AI calls go through `generate()` in `apps/api/src/ai/client.ts`, and every feature needs a template fallback for when AI is off.
- Mobile screens fetch with `useApi()` and post with `api()` from `src/lib/api.ts`, and build UI from `src/components/ui.tsx`.
- In copy the AI generates or templates, refer to people by name, not pronouns.
