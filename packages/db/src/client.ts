import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://admin:***@localhost:5444/fury_test'
    : process.env.DATABASE_URL || 'postgresql://admin:***@localhost:5444/fury_dev';

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export type Database = typeof db;
