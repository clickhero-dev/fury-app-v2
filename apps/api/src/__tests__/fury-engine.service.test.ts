import { describe, it, expect, vi } from 'vitest';
import { FuryEngineService } from '../services/fury/fury-engine.service.js';

function makeRepo(override: Record<string, any> = {}) {
  return {
    findOrCreateFuryConfig: vi.fn(async () => ({ id: 'cfg', targetRoas: '3' })),
    upsertFuryConfig: vi.fn(async (d: any) => ({ id: 'cfg', ...d })),
    listPerformanceRules: vi.fn(async () => [{ id: 'r1' }]),
    createPerformanceRule: vi.fn(async (d: any) => ({ id: 'r-new', ...d })),
    findPerformanceRuleById: vi.fn(async () => ({ id: 'r1' })),
    updatePerformanceRule: vi.fn(async (id: string, d: any) => ({ id, ...d })),
    deletePerformanceRule: vi.fn(async () => {}),
    listPerformanceScores: vi.fn(async () => [{ id: 's1' }]),
    listRuleExecutions: vi.fn(async () => [{ id: 'e1' }]),
    ...override,
  };
}
let repo: any = makeRepo();
const svc = new FuryEngineService(() => repo as any);

describe('FuryEngineService', () => {
  it('getConfig retorna config', async () => {
    await expect(svc.getConfig('t-1')).resolves.toEqual({ id: 'cfg', targetRoas: '3' });
  });

  it('updateConfig converte números → strings', async () => {
    await svc.updateConfig('t-1', { targetRoas: 3.5, targetCtr: 2 });
    const called = repo.upsertFuryConfig.mock.calls[0][0];
    expect(called.targetRoas).toBe('3.5');
    expect(called.targetCtr).toBe('2');
  });

  it('createRule mapeia actionValue number → string e isActive default true', async () => {
    await svc.createRule('t-1', { name: 'X', conditionField: 'cpa', conditionOperator: 'gt', conditionValue: 10, action: 'pause_campaign', actionValue: 5 });
    const called = repo.createPerformanceRule.mock.calls[0][0];
    expect(called.conditionValue).toBe('10');
    expect(called.actionValue).toBe('5');
    expect(called.isActive).toBe(true);
  });

  it('updateRule lança 404 quando regra não existe', async () => {
    repo = makeRepo({ findPerformanceRuleById: vi.fn(async () => null) });
    await expect(svc.updateRule('t-1', 'nope', { name: 'X' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updateRule atualiza valores (string) e mantém semana', async () => {
    repo = makeRepo();
    const out = await svc.updateRule('t-1', 'r1', { conditionValue: 20 });
    expect(repo.updatePerformanceRule).toHaveBeenCalledWith('r1', expect.objectContaining({ conditionValue: '20' }));
    expect(out.conditionValue).toBe('20');
  });

  it('listScores filtra por campaignId', async () => {
    await svc.listScores('t-1', 'c-9');
    expect(repo.listPerformanceScores).toHaveBeenCalledWith('c-9');
  });

  it('listHistory retorna [] quando não há regras', async () => {
    repo = makeRepo({ listPerformanceRules: vi.fn(async () => []) });
    await expect(svc.listHistory('t-1')).resolves.toEqual([]);
  });
});