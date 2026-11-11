import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://fury:fury_local@localhost:5432/fury_test'
    : process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev';

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});
export const db = drizzle(client, { schema });

export type Database = typeof db;

/** Conexão isolada permite encerrar o probe mesmo se o servidor não responder ao cancelamento. */
export function createDatabaseProbe(): PromiseLike<unknown> & { cancel(): void } {
  const probe = postgres(connectionString, { max: 1, connect_timeout: 10, prepare: false });
  const query = probe`SELECT 1`;
  const result = Promise.resolve(query).finally(() => probe.end({ timeout: 0 }));
  return Object.assign(result, { cancel: () => { void probe.end({ timeout: 0 }).catch(() => {}); } });
}
