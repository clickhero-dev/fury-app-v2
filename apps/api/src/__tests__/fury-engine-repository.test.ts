import { describe, it, expect, vi } from 'vitest';
import { FuryEngineRepository } from '../repository/fury-engine.repository.js';

function makeDb() {
  const update = vi.fn(() => ({ set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'r-1', ...s }] }) }) }));
  const insert = vi.fn(() => ({ values: (v: any) => ({ returning: async () => [{ id: 'new', ...v }] }) }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const db: any = {
    query: {
      furyConfig: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      performanceRules: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      performanceScores: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      ruleExecutions: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update, insert, delete: del,
  };
  return { db, update, insert, del };
}
const tenantId = 'f6e5d4c3-0000-4000-8000-00000000000f';

describe('FuryEngineRepository', () => {
  it('findOrCreateFuryConfig insere default quando não existe', async () => {
    const { db, insert } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    const config = await repo.findOrCreateFuryConfig();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(config.tenantId).toBe(tenantId);
  });

  it('upsertFuryConfig insere quando não existe', async () => {
    const { db, insert } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    await repo.upsertFuryConfig({ targetRoas: '2' });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('listPerformanceRules consulta performanceRules por tenant', async () => {
    const { db } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    await repo.listPerformanceRules();
    expect(db.query.performanceRules.findMany).toHaveBeenCalledTimes(1);
  });

  it('findActiveRules consulta regras ativas', async () => {
    const { db } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    await repo.findActiveRules();
    expect(db.query.performanceRules.findMany).toHaveBeenCalledTimes(1);
  });

  it('createPerformanceRule insere e retorna', async () => {
    const { db, insert } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    const rule = await repo.createPerformanceRule({ name: 'R' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(rule.tenantId).toBe(tenantId);
  });

  it('updatePerformanceRule usa update por id+tenant', async () => {
    const { db, update } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    await repo.updatePerformanceRule('r-1', { isActive: false });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('listPerformanceScores passa campaignId opcional', async () => {
    const { db } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    await repo.listPerformanceScores('c-1');
    expect(db.query.performanceScores.findMany).toHaveBeenCalledTimes(1);
  });

  it('createRuleExecution insere execução', async () => {
    const { db, insert } = makeDb();
    const repo = new FuryEngineRepository(tenantId, db);
    await repo.createRuleExecution({ ruleId: 'r-1', campaignId: 'c-1', actionTaken: 'notify', result: {} });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});