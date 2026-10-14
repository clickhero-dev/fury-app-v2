// =============================================================================
// BDD — Repository global do último healthcheck Meta
/*
# Language: pt-BR

Funcionalidade: Persistir último diagnóstico Meta por tenant

  Cenário: gravação substitui a fotografia anterior do tenant
    Dado resultado de healthcheck para um tenant
    Quando salvo o estado atual
    Então faz upsert usando tenantId como chave e mantém o resultado retornado

  Cenário: lista de seleção reúne usuários, conexão e último estado
    Dado usuários com e sem conexão Meta
    Quando consulto a lista administrativa
    Então retorna as informações necessárias sem selecionar credenciais
*/
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tables } = vi.hoisted(() => {
  const table = new Proxy({}, { get: (_target, key) => ({ table: String(key) }) });
  return { tables: { metaConnections: table, metaHealthchecks: table, metaSyncRuns: table, tenants: table, users: table } };
});
vi.mock('@fury/db', () => ({ ...tables, db: {} }));

import { MetaHealthcheckRepository } from '../repository/meta-healthcheck.repository.js';

function makeDb(rows: any[] = []) {
  const calls: any[] = [];
  const returningRow: any = { tenantId: 'tenant-1', checkedAt: new Date(), status: 'success', checks: {}, lastSyncAt: null, lastSyncStatus: null };
  const query: any = {
    metaHealthchecks: { findFirst: vi.fn(async () => returningRow) },
    metaSyncRuns: { findFirst: vi.fn(async () => null) },
  };
  const selectChain: any = {};
  for (const method of ['from', 'leftJoin', 'where', 'limit', 'orderBy']) {
    selectChain[method] = vi.fn((...args: any[]) => { calls.push([method, ...args]); return method === 'orderBy' ? Promise.resolve(rows) : selectChain; });
  }
  const insertChain: any = {};
  insertChain.values = vi.fn((values: any) => { calls.push(['values', values]); return insertChain; });
  insertChain.onConflictDoUpdate = vi.fn((args: any) => { calls.push(['onConflictDoUpdate', args]); return insertChain; });
  insertChain.returning = vi.fn(async () => [returningRow]);
  const db = {
    query,
    select: vi.fn((columns: any) => { calls.push(['select', columns]); return selectChain; }),
    insert: vi.fn(() => insertChain),
  } as any;
  return { db, calls, query, returningRow };
}

describe('BDD: MetaHealthcheckRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cenário: salva a fotografia mais recente usando tenantId para upsert', async () => {
    const { db, calls, returningRow } = makeDb();
    const repository = new MetaHealthcheckRepository(db);
    const record = { tenantId: 'tenant-1', checkedAt: new Date(), status: 'success' as const, checks: { token: { status: 'success' } }, lastSyncAt: null, lastSyncStatus: null };

    const saved = await repository.saveLatest(record);

    expect(saved).toBe(returningRow);
    expect(calls.find(([method]) => method === 'values')?.[1]).toMatchObject(record);
    expect(calls.find(([method]) => method === 'onConflictDoUpdate')?.[1].set.status).toBe('success');
  });

  it('Cenário: lista usuários com status sem ler accessToken', async () => {
    const rows = [{ userId: 'u1', email: 'ana@example.com', connectionId: null, status: null }];
    const { db, calls } = makeDb(rows);
    const repository = new MetaHealthcheckRepository(db);

    expect(await repository.listUsers()).toEqual(rows);
    const selected = calls.find(([method]) => method === 'select')?.[1];
    expect(selected).not.toHaveProperty('accessToken');
    expect(calls.filter(([method]) => method === 'leftJoin')).toHaveLength(3);
  });
});
