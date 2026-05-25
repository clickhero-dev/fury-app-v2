import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test'
    : process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev';

async function runMigrate() {
  // Passo 1: ADD VALUE fora de transação (PostgreSQL exige isso para novos valores de enum)
  const rawClient = postgres(connectionString, { max: 1 });
  try {
    await rawClient.unsafe(
      `ALTER TYPE "compliance_status" ADD VALUE IF NOT EXISTS 'pending_compliance'`
    );
    console.log('Enum updated successfully');
  } catch (err: any) {
    if (!err.message?.includes('already exists')) throw err;
  } finally {
    await rawClient.end();
  }

  // Passo 2: rod migrations normais do Drizzle
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, '../migrations') });
  console.log('Migrations completed');
  await client.end();
}

runMigrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
