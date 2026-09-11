import { describe, it, expect, beforeAll } from 'vitest';
import postgres from 'postgres';

/**
 * T1 — Tabela metrics_daily (feature 014).
 * Valida estrutura física no banco de dev local: PK composta, índice
 * (tenant_id, date), RLS habilitado + policy de tenant isolation.
 * RED antes da migration 0038; GREEN depois dela.
 */
const connectionString =
  process.env.DATABASE_URL || 'postgresql://fury:fury_local@localhost:5432/fury_dev';

const sql = postgres(connectionString, { max: 1, prepare: false });

describe('metrics_daily (migration 0038)', () => {
  let tableExists = false;
  let columns: Record<string, string> = {};
  let primaryKeyCols: string[] = [];
  let indexNames: string[] = [];
  let rlsEnabled = false;
  let policyExists = false;

  beforeAll(async () => {
    const t = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'metrics_daily'
      ) AS exists_;
    `;
    tableExists = t[0]!.exists_ as boolean;
    if (!tableExists) return;

    const cols = await sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'metrics_daily'
    `;
    columns = Object.fromEntries(cols.map((c) => [c.column_name, c.data_type]));

    const pk = await sql`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = 'metrics_daily' AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
    `;
    primaryKeyCols = pk.map((r) => r.column_name);

    const idx = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'metrics_daily' AND indexname != 'metrics_daily_pkey'
    `;
    indexNames = idx.map((r) => r.indexname);

    const rls = await sql`
      SELECT relrowsecurity FROM pg_class
      WHERE relname = 'metrics_daily' AND relnamespace = 'public'::regnamespace
    `;
    rlsEnabled = rls[0]?.relrowsecurity === true;

    const pol = await sql`
      SELECT 1 FROM pg_policies
      WHERE tablename = 'metrics_daily' AND policyname = 'metrics_daily_tenant_isolation'
    `;
    policyExists = pol.length > 0;
  });

  it('tabela metrics_daily existe', () => {
    expect(tableExists).toBe(true);
  });

  it('colunas de métrica e snapshot presentes com tipos corretos', () => {
    expect(columns['tenant_id']).toBe('uuid');
    expect(columns['campaign_meta_id']).toBe('character varying');
    expect(columns['date']).toBe('date');
    expect(columns['spend']).toBe('numeric');
    expect(columns['impressions']).toBe('integer');
    expect(columns['clicks']).toBe('integer');
    expect(columns['ctr']).toBe('numeric');
    expect(columns['cpm']).toBe('numeric');
    expect(columns['cpc']).toBe('numeric');
    expect(columns['conversions']).toBe('numeric');
    expect(columns['roas']).toBe('numeric');
    expect(columns['cpa']).toBe('numeric');
    expect(columns['campaign_name']).toBe('character varying');
    expect(columns['objective']).toBe('character varying');
    expect(columns['status']).toBe('character varying');
    expect(columns['updated_at']).toBe('timestamp with time zone');
  });

  it('PK composta (tenant_id, campaign_meta_id, date) nesta ordem', () => {
    expect(primaryKeyCols).toEqual(['tenant_id', 'campaign_meta_id', 'date']);
  });

  it('índice (tenant_id, date) existe', () => {
    expect(indexNames).toContain('metrics_daily_tenant_date_idx');
  });

  it('RLS habilitado com policy de tenant isolation', () => {
    expect(rlsEnabled).toBe(true);
    expect(policyExists).toBe(true);
  });

  it('FK ausente: campaign_meta_id não referencia campaigns (id Meta livre)', async () => {
    const fks = await sql`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'metrics_daily' AND constraint_type = 'FOREIGN KEY'
    `;
    expect(fks.length).toBe(0);
  });
});
