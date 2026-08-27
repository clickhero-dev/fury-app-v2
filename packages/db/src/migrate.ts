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
  { tag: '0015_form_submissions' },
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
  { tag: '0028_google_meu_negocio' },
  { tag: '0028_add_missing_post_status_values' },
  { tag: '0029_google_social_login' },
  { tag: '0030_add_calendar_date_to_social_posts' },
  {
    tag: '0031_add_post_status_rejected_confirmed',
    afterHook: async (client) => {
      await client.unsafe(`ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'rejected'`);
      await client.unsafe(`ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'confirmed'`);
      console.log('    + added rejected, confirmed to post_status');
    },
  },
  { tag: '0031_migrate_carousel_images' },
  {
    tag: '0030_workflow_jobs',
    afterHook: async (client) => {
      await client.unsafe(`ALTER TYPE "workflow_status" ADD VALUE IF NOT EXISTS 'awaiting_images'`);
      console.log('    + added awaiting_images to workflow_status');
    },
  },
  { tag: '0011_fr8_publish_retry',
    afterHook: async (client) => {
      await client.unsafe(`ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'failed'`);
      console.log('    + added failed to post_status');
    },
  },
  { tag: '0032_add_budget_optimizations' },
];

/** Nomes de todas as tabelas do schema (26 tabelas) — usados para validação. */
export const REQUIRED_TABLES = [
  'tenants',
  'users',
  'meta_connections',
  'campaigns',
  'creative_assets',
  'client_goals',
  'fury_insights',
  'automation_rules',
  'budget_optimizations',
  'performance_rules',
  'performance_scores',
  'rule_executions',
  'fury_config',
  'form_submissions',
  'plans',
  'subscriptions',
  'invoices',
  'brand_kits',
  'request_logs',
  'campaign_plans',
  'social_posts',
  'workflow_jobs',
  'google_connections',
  'google_business_profiles',
  'business_profile_settings',
  'google_sync_logs',
];

/**
 * Executa todas as migrations pendentes.
 * Idempotente: pode ser chamado múltiplas vezes.
 */
export async function runMigrations(): Promise<void> {
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

/**
 * Valida se todas as tabelas obrigatórias existem no banco.
 * Retorna { ok: true, missing: [] } se todas existirem,
 * ou { ok: false, missing: string[] } com as tabelas faltantes.
 */
export async function validateRequiredTables(): Promise<{ ok: boolean; missing: string[] }> {
  const client = postgres(connectionString, { max: 1 });

  try {
    const rows = await client<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `;
    const existingTables = new Set(rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !existingTables.has(t));

    if (missing.length === 0) {
      console.log('[validateRequiredTables] All 26 required tables exist');
      return { ok: true, missing: [] };
    }

    console.error('[validateRequiredTables] Missing tables:', missing);
    return { ok: false, missing };
  } finally {
    await client.end();
  }
}

/**
 * Executa migrations e valida tabelas — uso principal no boot da API.
 */
export async function runMigrationsAndValidate(): Promise<void> {
  await runMigrations();
  const validation = await validateRequiredTables();
  if (!validation.ok) {
    throw new Error(`Migration validation failed: missing tables ${validation.missing.join(', ')}`);
  }
}

// CLI entry point — only runs when file is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    console.error('Stack:', err?.stack);
    console.error('Error details:', JSON.stringify(err, null, 2));
    process.exit(1);
  });
}