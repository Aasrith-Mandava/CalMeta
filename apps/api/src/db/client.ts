import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { env } from '../env';
import * as schema from './schema';

const client = createClient({ url: env.databaseUrl, authToken: env.databaseAuthToken });

export const db = drizzle(client, { schema });

/** Readable prefixed ids: u_ user, c_ crew, s_ session, m_ message, p_ poll. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
}
