# 200 Hours — mobile app

Expo SDK 58 (React Native, Expo Router). Start it from the repo root with `npm run mobile`, with the API running (`npm run api`).

| Where to run | How | NFC |
| --- | --- | --- |
| Web | press `w` | code fallback |
| iOS simulator / Android emulator | press `i` / `a` | code fallback |
| Your phone, quick | Expo Go, scan the QR | code fallback |
| Your phone, full | `npx expo run:ios --device` or `npx expo run:android` (from this folder) | ✓ |

The app calls the API on the machine running Metro (port 8787). Set `EXPO_PUBLIC_API_URL` in `.env` to point elsewhere.

## Layout

```
src/app/               one file per screen (Expo Router)
  onboarding/          1 About you, 2 Your crew
  (tabs)/              3 Home, 4 Discover, Chats
  chat/[crewId]        5 Crew chat
  friend/[userId]      6 Friend profile
  crew/new, [crewId]   7 Start a crew, 8 Crew page
  connect/             Tap to connect (NFC) + deep-link redeem
src/components/        ui.tsx (building blocks), friend-ring.tsx
src/lib/               api.ts (typed fetch + useApi), session.tsx
src/nfc/               NFC read/write (index.web.ts is the web stub)
src/theme.ts           colors, spacing, type sizes
```

Read [AGENTS.md](AGENTS.md) before touching Expo APIs: they change every SDK release.
