import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';

import { MODEL, aiEnabled } from './ai/client';
import { requireUser, type AppEnv } from './auth';
import { env } from './env';
import { chatRoutes } from './routes/chat';
import { connectRoutes } from './routes/connect';
import { crewRoutes } from './routes/crews';
import { discoverRoutes } from './routes/discover';
import { friendRoutes } from './routes/friends';
import { homeRoutes } from './routes/home';
import { onboardingRoutes } from './routes/onboarding';

const app = new Hono<AppEnv>();

app.use(logger());
app.use(cors()); // Expo web runs on a different port

app.get('/health', (c) => c.json({ ok: true, ai: aiEnabled ? MODEL : 'off' }));
app.route('/', onboardingRoutes);

// Every route registered below this line requires a signed-in user.
app.use('*', requireUser);
app.route('/', homeRoutes);
app.route('/', crewRoutes);
app.route('/', chatRoutes);
app.route('/', discoverRoutes);
app.route('/', friendRoutes);
app.route('/', connectRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);
  console.error(err);
  return c.json({ message: 'Something went wrong' }, 500);
});

// 0.0.0.0 so phones on the same Wi-Fi can reach your laptop.
serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`200 Hours API on http://localhost:${info.port}`);
  console.log(aiEnabled ? `AI: ${MODEL}` : 'AI: off (set MODEL_API_KEY in apps/api/.env to enable)');
});
