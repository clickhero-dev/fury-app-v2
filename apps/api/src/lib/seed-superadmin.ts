/// <reference path="../types/express.d.ts" />
// Seed superadmin user on API startup.
// Idempotent — safe to run every deployment.
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL || 'postgresql://fury:fury@localhost:5432/fury_test'
    : process.env.DATABASE_URL || 'postgresql://fury:fury@localhost:5432/fury_dev';

export async function seedSuperadmin(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });

  try {
    // 1. Add 'superadmin' to user_role enum (idempotent)
    await sql.unsafe(`ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'superadmin';`);
    console.log('  ✓ user_role enum has superadmin');

    // 2. Create superadmin user if env vars are set and user doesn't exist
    const email = process.env.SUPERADMIN_EMAIL;
    const password = process.env.SUPERADMIN_PASSWORD;

    if (!email || !password) {
      console.log('  - SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD not set — skipping superadmin seed');
      return;
    }

    const existing = await sql`SELECT id FROM "users" WHERE email = ${email}`;
    if (existing.length > 0) {
      console.log(`  ✓ superadmin user (${email}) already exists`);
      return;
    }

    const hash = await bcrypt.hash(password, 12);

    // Create a tenant for the superadmin
    const [tenant] = await sql`
      INSERT INTO "tenants" (name, slug)
      VALUES ('FURY Superadmin', 'fury-superadmin')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    await sql`
      INSERT INTO "users" (tenant_id, email, password_hash, role, name)
      VALUES (${tenant.id}, ${email}, ${hash}, 'superadmin', 'FURY Admin')
    `;

    console.log(`  ✓ superadmin user created (${email})`);
  } finally {
    await sql.end();
  }
}