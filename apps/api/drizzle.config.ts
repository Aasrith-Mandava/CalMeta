import { defineConfig } from 'drizzle-kit';

// `npm run db:push` syncs src/db/schema.ts to the database (no migration files during the hackathon).
export default defineConfig({
  dialect: 'turso',
  schema: './src/db/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:local.db',
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
