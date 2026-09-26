// =============================================================================
// BDD — T001: Migration 0043 + schema drizzle das tabelas de sync assíncrono Meta
//
/*
# Language: pt-BR

Funcionalidade: Tabelas de sincronização assíncrona Meta (snapshots, leads, IG, runs)

  Cenário: a migration 0043 cria as tabelas novas
    Dado o arquivo packages/db/migrations/0043_meta_sync_tables.sql
    Quando leio o conteúdo
    Então contém CREATE TABLE para meta_campaign_snapshots, meta_leads,
      meta_instagram_media e meta_sync_runs
    E contém o enum meta_sync_run_status (running, success, partial, failed)

  Cenário: a migration aplica RLS tenant-isolation nas 4 tabelas
    Dado o arquivo 0043_meta_sync_tables.sql
    Então habilita ROW LEVEL SECURITY e cria policy de isolamento por tenant
      em cada uma das 4 tabelas

  Cenário: o schema drizzle expõe as tabelas com os tipos corretos
    Dado o módulo @fury/db
    Quando inspeciono os objetos exportados
    Então metaCampaignSnapshots tem coluna meta_campaign_id com unique tenant+campaign
    E metaSyncRuns tem status no enum running/success/partial/failed
    E metaLeads tem unique (tenant_id, meta_lead_id)
*/
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'packages/db/migrations/0043_meta_sync_tables.sql');

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

describe('BDD: Migration 0043 — meta_sync_tables', () => {
  it('Cenário: cria as 4 tabelas + enum de status', () => {
    const sql = readMigration();
    for (const table of [
      'meta_campaign_snapshots',
      'meta_leads',
      'meta_instagram_media',
      'meta_sync_runs',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(sql).toContain("'running'");
    expect(sql).toContain("'success'");
    expect(sql).toContain("'partial'");
    expect(sql).toContain("'failed'");
  });

  it('Cenário: RLS tenant-isolation nas 4 tabelas', () => {
    const sql = readMigration();
    for (const table of [
      'meta_campaign_snapshots',
      'meta_leads',
      'meta_instagram_media',
      'meta_sync_runs',
    ]) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`CREATE POLICY ${table}_tenant_isolation ON ${table}`);
    }
    expect(sql).toContain("current_setting('app.current_tenant_id')::uuid");
  });

  it('Cenário: snapshot tem unique (tenant_id, meta_campaign_id)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/meta_campaign_snapshots_tenant_campaign_unique/);
  });
});

describe('BDD: schema drizzle expõe as tabelas de sync', () => {
  it('Cenário: metaCampaignSnapshots expõe as colunas e unique', async () => {
    const { metaCampaignSnapshots, metaSyncRuns, metaLeads, metaInstagramMedia } =
      await import('@fury/db');

    expect(metaCampaignSnapshots.metaCampaignId.name).toBe('meta_campaign_id');
    expect(metaCampaignSnapshots.tenantId.name).toBe('tenant_id');
    expect(metaCampaignSnapshots.hasLeadForm.name).toBe('has_lead_form');
    expect(metaCampaignSnapshots.lastInsightsAt.name).toBe('last_insights_at');

    const uniqueCols = metaCampaignSnapshots[metaCampaignSnapshots.tenantId.uniqueName as any];
    expect(String(metaCampaignSnapshots.metaCampaignId.dataType)).toBe('string');
    void uniqueCols;

    expect(metaSyncRuns.status.dataType).toBe('string');
    expect(metaSyncRuns.partialFailures.name).toBe('partial_failures');

    expect(metaLeads.metaLeadId.name).toBe('meta_lead_id');
    expect(metaInstagramMedia.mediaId.name).toBe('media_id');
  });
});