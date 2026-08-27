import { describe, it, expect, vi } from 'vitest';
import { AutomationRepository } from '../repository/automation.repository.js';

function makeDb() {
  const update = vi.fn(() => ({ set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'rule', ...s }] }) }) }));
  const insert = vi.fn(() => ({ values: (v: any) => ({ returning: async () => [{ id: 'new', ...v }] }) }));
  const del = vi.fn(() => ({ where: async () => {} }));
  const db: any = {
    query: {
      automationRules: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      furyInsights: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update, insert, delete: del,
  };
  return { db, update, insert, del };
}
const tenantId = 'a0b1c2d3-0000-4000-8000-000000000001';

describe('AutomationRepository', () => {
  it('findAutomationRuleByName consulta por tenant+nome', async () => {
    const { db } = makeDb();
    const repo = new AutomationRepository(tenantId, db);
    await repo.findAutomationRuleByName('R');
    expect(db.query.automationRules.findFirst).toHaveBeenCalledTimes(1);
  });

  it('createAutomationRule insere com tenantId', async () => {
    const { db, insert } = makeDb();
    const repo = new AutomationRepository(tenantId, db);
    const rule = await repo.createAutomationRule({ name: 'R' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(rule.tenantId).toBe(tenantId);
  });

  it('updateAutomationRule usa update por id', async () => {
    const { db, update } = makeDb();
    const repo = new AutomationRepository(tenantId, db);
    await repo.updateAutomationRule('rule', { isActive: false });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('deleteAutomationRule usa delete', async () => {
    const { db, del } = makeDb();
    const repo = new AutomationRepository(tenantId, db);
    await repo.deleteAutomationRule('rule');
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('listSmartTakedowns consulta furyInsights smart_takedown', async () => {
    const { db } = makeDb();
    const repo = new AutomationRepository(tenantId, db);
    await repo.listSmartTakedowns();
    expect(db.query.furyInsights.findMany).toHaveBeenCalledTimes(1);
  });
});