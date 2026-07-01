/// <reference path="../types/express.d.ts" />
// Unified startup seed — idempotent, safe to run every deployment.
// Ensures: superadmin user + demo user exist with valid bcrypt hashes.
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL || 'postgresql://fury:***@localhost:5432/fury_test'
    : process.env.DATABASE_URL || 'postgresql://fury:***@localhost:5432/fury_dev';

interface SeedUser {
  email: string;
  password: string;
  name: string;
  role: string;
  tenantName: string;
  tenantSlug: string;
}

export async function seedStartup(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });

  try {
    // 1. Ensure 'superadmin' role exists in user_role enum (idempotent)
    await sql.unsafe(`ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'superadmin';`);
    console.log('  ✓ user_role enum includes superadmin');

    // 2. Seed users from env vars
    const superadminEmail = process.env.SUPERADMIN_EMAIL;
    const superadminPass = process.env.SUPERADMIN_PASSWORD;

    const demoEmail = process.env.DEMO_EMAIL || 'dev.fashion@fury.test';
    const demoPassword = process.env.DEMO_PASSWORD || 'Dev@12345';

    const seeds: SeedUser[] = [];

    if (superadminEmail && superadminPass) {
      seeds.push({
        email: superadminEmail,
        password: superadminPass,
        name: 'FURY Admin',
        role: 'superadmin',
        tenantName: 'FURY Superadmin',
        tenantSlug: 'fury-superadmin',
      });
    } else {
      console.log('  - SUPERADMIN_EMAIL/PASSWORD not set — skipping superadmin seed');
    }

    seeds.push({
      email: demoEmail,
      password: demoPassword,
      name: 'Fashion Demo',
      role: 'owner',
      tenantName: 'Fashion Demo',
      tenantSlug: 'fashion-demo',
    });

    for (const seed of seeds) {
      const existing = await sql`SELECT id, password_hash FROM "users" WHERE email = ${seed.email}`;

      if (existing.length > 0) {
        const hash: string = existing[0].password_hash;
        // If the hash isn't bcrypt ($2a$ / $2b$), it's broken — replace it
        if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
          console.log(`  ✓ user ${seed.email} already exists with valid bcrypt`);
        } else {
          const newHash = await bcrypt.hash(seed.password, 12);
          await sql`UPDATE "users" SET password_hash = ${newHash} WHERE id = ${existing[0].id}`;
          console.log(`  🔧 fixed password hash for ${seed.email} (was non-bcrypt)`);
        }
        continue;
      }

      // Create tenant
      const [tenant] = await sql`
        INSERT INTO "tenants" (name, slug)
        VALUES (${seed.tenantName}, ${seed.tenantSlug})
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `;

      // Create user with bcrypt
      const hash = await bcrypt.hash(seed.password, 12);
      await sql`
        INSERT INTO "users" (tenant_id, email, password_hash, role, name)
        VALUES (${tenant.id}, ${seed.email}, ${hash}, ${seed.role}, ${seed.name})
      `;

      console.log(`  ✓ user ${seed.email} created (${seed.role})`);
    }
  } finally {
    await sql.end();
  }
}
