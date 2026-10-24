export const env = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: process.env.DATABASE_URL || 'file:local.db',
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,
};
