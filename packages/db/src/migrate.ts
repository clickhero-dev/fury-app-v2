import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load packages/db/.env before reading process.env — does nothing if file is absent.
const envFile = path.join(__dirname, '../.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_test'
    : process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev';

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');

interface MigrationStep {
  tag: string;
  afterHook?: (client: postgres.Sql) => Promise<void>;
}

// Ordered list of migrations. afterHook runs after the file commits,
// outside any transaction — required for ALTER TYPE ADD VALUE.
const STEPS: MigrationStep[] = [
  {
    tag: '0000_cloudy_jack_murdock',
    afterHook: async (client) => {
      await client.unsafe(
        `ALTER TYPE "compliance_status" ADD VALUE IF NOT EXISTS 'pending_compliance'`,
      );
      console.log('    + added pending_compliance to compliance_status');
    },
  },
  { tag: '0001_consolidated' },
  { tag: '0002_add_performance_rules' },
  { tag: '0005_performance_scores' },
  { tag: '0006_remove_automation_rules_enabled' },
  { tag: '0007_add_billing_tables' },
  { tag: '0008_add_selected_ad_account' },
  { tag: '0009_add_main_product_to_goals' },
  { tag: '0010_add_name_to_users' },
  { tag: '0011_add_notification_prefs' },
  { tag: '0012_add_brand_kits' },
  { tag: '0013_meta_connections_dedupe_unique' },
  { tag: '0014_add_asset_selection' },
  { tag: '0015_add_request_logs' },
  { tag: '0016_fix_request_logs_user_id' },
  { tag: '0018_add_audience_defaults' },
  { tag: '0020_add_referer_to_request_logs' },
  { tag: '0021_add_auth_fields_to_users' },
  {
    tag: '0019_add_superadmin_role',
    afterHook: async (client) => {
      // Seed superadmin user if env vars are set
      const email = process.env.SUPERADMIN_EMAIL;
      const password = process.env.SUPERADMIN_PASSWORD;
      if (email && password) {
        const existing = await client`SELECT id FROM "users" WHERE email = ${email}`;
        if (existing.length === 0) {
          const bcrypt = await import('bcrypt');
          const hash = await bcrypt.hash(password, 10);
          // Create a tenant for the superadmin
          const [tenant] = await client`
            INSERT INTO "tenants" (name, slug)
            VALUES ('FURY Superadmin', 'fury-superadmin')
            RETURNING id
          `;
          await client`
            INSERT INTO "users" (tenant_id, email, password_hash, role, name)
            VALUES (${tenant.id}, ${email}, ${hash}, 'superadmin', 'FURY Admin')
          `;
          console.log('    + superadmin user created');
        } else {
          console.log('    + superadmin user already exists');
        }
      } else {
        console.log('    - SUPERADMIN_EMAIL/PASSWORD not set, skipping superadmin seed');
      }
    },
  },
  { tag: '0021_add_tenant_codigo' },
  { tag: '0022_add_tenant_business_context' },
  { tag: '0023_planner_tables' },
  { tag: '0024_add_reel_post_type' },
  { tag: '0025_add_is_non_expirable_to_subscriptions' },
  { tag: '0026_add_creative_quota_limits' },
  { tag: '0027_add_missing_planner_columns' },
];

async function runMigrate() {
  const client = postgres(connectionString, { max: 1 });

  try {
    // Tracking table — keyed by migration tag, not content hash,
    // so re-running with the same files is always idempotent.
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id       SERIAL PRIMARY KEY,
        hash     text NOT NULL UNIQUE,
        created_at bigint
      )
    `);

    const rows = await client<{ hash: string }[]>`
      SELECT hash FROM "__drizzle_migrations"
    `;
    const applied = new Set(rows.map((r) => r.hash));

    for (const step of STEPS) {
      if (applied.has(step.tag)) {
        console.log(`  ✓ ${step.tag} (already applied)`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, `${step.tag}.sql`);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`  → ${step.tag}`);

      // Drizzle-generated files use '--> statement-breakpoint' as separator.
      // Files without it are sent as a single batch — both work with
      // postgres.js simple-query protocol (no implicit transaction wrapping).
      const parts = sql
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of parts) {
        await client.unsafe(stmt);
      }

      await client.unsafe(
        `INSERT INTO "__drizzle_migrations" (hash, created_at)
         VALUES ($1, $2)
         ON CONFLICT (hash) DO NOTHING`,
        [step.tag, Date.now()],
      );

      console.log(`  ✓ ${step.tag}`);

      if (step.afterHook) {
        await step.afterHook(client);
      }
    }

    console.log('\nMigrations completed successfully');
  } finally {
    await client.end();
  }
}

runMigrate().catch((err) => {
  console.error('Migration failed:', err);
  console.error('Stack:', err?.stack);
  console.error('Error details:', JSON.stringify(err, null, 2));
  process.exit(1);
});
