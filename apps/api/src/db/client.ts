import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { env } from '../env';
import * as schema from './schema';

const client = createClient({ url: env.databaseUrl, authToken: env.databaseAuthToken });

export const db = drizzle(client, { schema });

// The local libsql client shares a write connection. Serialize async transactions
// so simultaneous phone requests cannot nest BEGINs or interrupt one another.
let writeQueue: Promise<unknown> = Promise.resolve();
type WriteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function writeTransaction<T>(fn: (tx: WriteTransaction) => Promise<T>): Promise<T> {
  const operation = writeQueue.then(() => db.transaction(fn));
  writeQueue = operation.catch(() => {});
  return operation;
}

/** Readable prefixed ids: u_ user, c_ crew, s_ session, m_ message, p_ poll. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
}
