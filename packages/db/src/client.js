import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
const connectionString = process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev';
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
//# sourceMappingURL=client.js.map