// =============================================================================
// BDD — T002: MetaSyncRepository (tenant-bound, upserts idempotentes)
//
/*
# Language: pt-BR

Funcionalidade: Repositório de sincronização Meta (snapshots, leads, IG, runs)

  Cenário: upsert de snapshot é idempotente
    Dado repositório tenant-bound
    Quando upsertCampaignSnapshot é chamado duas vezes com o mesmo meta_campaign_id
    Então usa ON CONFLICT (tenant_id, meta_campaign_id) DO UPDATE (não duplica)

  Cenário: upsert de leads é idempotente por meta_lead_id
    Dado repositório tenant-bound
    Quando upsertLeads é chamado com leads repetidos
    Então usa ON CONFLICT (tenant_id, meta_lead_id) DO UPDATE

  Cenário: upsert de mídia Instagram é idempotente por media_id
    Dado repositório tenant-bound
    Quando upsertInstagramMedia é chamado com a mesma media_id
    Então usa ON CONFLICT (tenant_id, media_id) DO UPDATE

  Cenário: todas as consultas são escopadas por tenant
    Dado repositório do tenant T1
    Quando chamo findCampaignSnapshots, findLeadsByCampaign, findAllLeads,
      findLeadCampaigns, findInstagramInsights, lastSuccessfulRun
    Então todos os filtros incluem tenant_id = T1

  Cenário: listagem de snapshots pagina
    Dado snapshots persistidos
    Quando findCampaignSnapshots({ limit, offset })
    Então retorna { items, total }

  Cenário: findLeadCampaigns filtra OUTCOME_LEADS com form
    Dado snapshots variados
    Quando findLeadCampaigns
    Então retorna apenas os que têm objective OUTCOME_LEADS e has_lead_form true

  Cenário: lastSuccessfulRun pega o run success mais recente
    Dado runs com vários status
    Quando lastSuccessfulRun
    Então retorna o run com status success mais recente (ou null se nenhum)

  Cenário: recordSyncRun persiste o run com tenantId
    Dado repositório tenant-bound
    Quando recordSyncRun({ status, counts })
    Então insere com tenant_id do repositório e retorna o run
*/
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { MetaSyncRepository } from '../repository/meta-sync.repository.js';

const tenantId = 'd4e3f2c1-0000-4000-8000-00000000000d';

/** Serializa um filtro drizzle (percorre queryChunks recursivamente) para assert textual. */
function whereText(where: any): string {
  const parts: string[] = [];
  const walk = (node: any): void => {
    if (node == null) return;
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === 'object') {
      if (typeof node.name === 'string') {
        parts.push(node.name);
        return;
      }
      if (node.queryChunks) {
        for (const chunk of node.queryChunks) walk(chunk);
        return;
      }
      if (node.value !== undefined) {
        walk(node.value);
        return;
      }
      if (node.text !== undefined) {
        parts.push(String(node.text));
      }
    }
  };
  walk(where);
  return parts.join(' ');
}

function makeDb() {
  const calls: { method: string; args: any[] }[] = [];

  const query: any = {};
  for (const table of ['metaCampaignSnapshots', 'metaLeads', 'metaInstagramMedia', 'metaSyncRuns']) {
    query[table] = {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    };
  }

  const makeChain = (name: string): any => {
    const proxy = new Proxy(
      function () {},
      {
        get(_t, prop) {
          if (prop === 'then') return undefined;
          return makeChain(String(prop));
        },
        apply(_t, _this, args) {
          calls.push({ method: name, args });
          if (name === 'returning') {
            return Promise.resolve([{ id: 'generated-id' }]);
          }
          return proxy;
        },
      }
    );
    return proxy;
  };

  const db: any = {
    query,
    select: vi.fn(() => ({ from: () => ({ where: async () => [{ count: 2 }] }) })),
    insert: vi.fn((...args: any[]) => {
      calls.push({ method: 'insert', args });
      return makeChain('values');
    }),
    update: vi.fn((...args: any[]) => {
      calls.push({ method: 'update', args });
      return makeChain('set');
    }),
  };
  return { db, calls, query };
}

describe('BDD: MetaSyncRepository', () => {
  it('Cenário: upsertCampaignSnapshot usa onConflictDoUpdate (idempotente)', async () => {
    const { db, calls } = makeDb();
    const repo = new MetaSyncRepository(tenantId, db);
    await repo.upsertCampaignSnapshot({
      metaCampaignId: 'meta-1',
      name: 'Camp',
      status: 'ACTIVE',
      objective: 'OUTCOME_LEADS',
    });

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall).toBeTruthy();
    const valuesCall = calls.find((c) => c.method === 'values');
    expect(valuesCall).toBeTruthy();
    const [values] = valuesCall!.args;
    expect(values.tenantId).toBe(tenantId);
    expect(values.metaCampaignId).toBe('meta-1');
    expect(calls.some((c) => c.method === 'onConflictDoUpdate')).toBe(true);
    const conflict = calls.find((c) => c.method === 'onConflictDoUpdate')!;
    const targetNames = (conflict.args[0].target as any[])
      .map((col: any) => col?.name ?? String(col))
      .join(',');
    expect(targetNames).toContain('meta_campaign_id');
    expect(targetNames).toContain('tenant_id');
  });

  it('Cenário: upsertLeads usa onConflictDoUpdate por meta_lead_id', async () => {
    const { db, calls } = makeDb();
    const repo = new MetaSyncRepository(tenantId, db);
    await repo.upsertLeads([{ metaLeadId: 'lead-1', name: 'Maria' }]);

    const conflict = calls.find((c) => c.method === 'onConflictDoUpdate');
    expect(conflict).toBeTruthy();
    const targetNames = (conflict!.args[0].target as any[])
      .map((col: any) => col?.name ?? String(col))
      .join(',');
    expect(targetNames).toContain('meta_lead_id');
  });

  it('Cenário: upsertInstagramMedia usa onConflictDoUpdate por media_id', async () => {
    const { db, calls } = makeDb();
    const repo = new MetaSyncRepository(tenantId, db);
    await repo.upsertInstagramMedia([{ mediaId: 'media-1' }]);

    const conflict = calls.find((c) => c.method === 'onConflictDoUpdate');
    expect(conflict).toBeTruthy();
    const targetNames = (conflict!.args[0].target as any[])
      .map((col: any) => col?.name ?? String(col))
      .join(',');
    expect(targetNames).toContain('media_id');
  });

  it('Cenário: consultas filtram por tenantId (isolamento)', async () => {
    const { db, query } = makeDb();
    const repo = new MetaSyncRepository(tenantId, db);

    await repo.findCampaignSnapshots({ limit: 10, offset: 0 });
    const [camArgs] = query.metaCampaignSnapshots.findMany.mock.calls[0];
    expect(whereText(camArgs.where)).toContain(tenantId);

    await repo.findLeadsByCampaign('meta-1', { limit: 10, offset: 0 });
    const [leadArgs] = query.metaLeads.findMany.mock.calls[0];
    expect(whereText(leadArgs.where)).toContain(tenantId);
    expect(whereText(leadArgs.where)).toContain('meta-1');

    await repo.findAllLeads({ limit: 10, offset: 0 });
    const [allLeadArgs] = query.metaLeads.findMany.mock.calls[1];
    expect(whereText(allLeadArgs.where)).toContain(tenantId);

    await repo.findInstagramInsights();
    const [igArgs] = query.metaInstagramMedia.findMany.mock.calls[0];
    expect(whereText(igArgs.where)).toContain(tenantId);

    await repo.lastSuccessfulRun();
    const [runArgs] = query.metaSyncRuns.findFirst.mock.calls[0];
    expect(whereText(runArgs.where)).toContain(tenantId);
    expect(whereText(runArgs.where)).toContain('success');
  });

  it('Cenário: findCampaignSnapshots pagina e retorna { items, total }', async () => {
    const { db, query } = makeDb();
    query.metaCampaignSnapshots.findMany.mockResolvedValueOnce([{ id: 's1' }]);
    query.metaCampaignSnapshots.findMany.mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }]);
    const repo = new MetaSyncRepository(tenantId, db);

    const result = await repo.findCampaignSnapshots({ limit: 1, offset: 0 });
    expect(result.items.length).toBe(1);
    expect(result.total).toBe(2);
  });

  it('Cenário: findLeadCampaigns filtra OUTCOME_LEADS com form', async () => {
    const { db, query } = makeDb();
    const repo = new MetaSyncRepository(tenantId, db);

    await repo.findLeadCampaigns();
    const [leadArgs] = query.metaCampaignSnapshots.findMany.mock.calls[0];
    const whereJson = whereText(leadArgs.where);
    expect(whereJson).toContain('OUTCOME_LEADS');
    expect(whereJson).toContain('has_lead_form');
    expect(whereJson).toContain(tenantId);
  });

  it('Cenário: lastSuccessfulRun retorna null quando não há run success', async () => {
    const { db } = makeDb();
    const repo = new MetaSyncRepository(tenantId, db);
    const result = await repo.lastSuccessfulRun();
    expect(result).toBeNull();
  });

  it('Cenário: recordSyncRun insere com tenantId e retorna o run', async () => {
    const { db, calls } = makeDb();
    const repo = new MetaSyncRepository(tenantId, db);
    const run = await repo.recordSyncRun({ status: 'success', campaignsCount: 2, leadsCount: 5 });

    expect(run.id).toBe('generated-id');
    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall).toBeTruthy();
    const valuesCall = calls.find((c) => c.method === 'values');
    const [values] = valuesCall!.args;
    expect(values.tenantId).toBe(tenantId);
    expect(values.status).toBe('success');
    expect(values.campaignsCount).toBe(2);
  });
});