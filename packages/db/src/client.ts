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
