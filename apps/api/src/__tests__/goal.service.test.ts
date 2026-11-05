import { describe, it, expect, vi } from 'vitest';
import { GoalService } from '../services/goals/goal.service.js';

const goalRow = {
  id: 'g-1',
  tenantId: 't-1',
  objective: 'aumentar_vendas',
  monthlyBudget: { amount: 500000 }, // R$ 5.000
  targetCpa: { amount: 5000 },        // R$ 50
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockMetrics(overrides: Record<string, any> = {}) {
  return {
    getSummary: vi.fn(async () => ({ spend: 400, conversions: 5, roas: 2, cpa: 80 })),
    getDailyMetrics: vi.fn(async () => [{ date: '2026-08-01', spend: 10, conversions: 1, roas: 2, cpa: 10, impressions: 0 }]),
    ...overrides,
  };
}

function mockRepo(overrides: Record<string, any> = {}) {
  return {
    findClientGoal: vi.fn(async () => null),
    upsertTenantClientGoal: vi.fn(async (d: any) => d),
    updateTenantClientGoal: vi.fn(async (d: any) => d),
    findCampaigns: vi.fn(async () => ({ items: [], total: 0 })),
    ...overrides,
  };
}

describe('GoalService', () => {
  it('getGoal retorna null sem metas', async () => {
    const repo = mockRepo();
    const svc = new GoalService(mockMetrics() as any, () => repo as any);
    expect(await svc.getGoal('t-1')).toBeNull();
    expect(repo.findClientGoal).toHaveBeenCalled();
  });

  it('getGoal serializa monthlyBudget/targetCpa (cents → reais)', async () => {
    const repo = mockRepo({ findClientGoal: vi.fn(async () => goalRow) });
    const svc = new GoalService(mockMetrics() as any, () => repo as any);
    const goal = await svc.getGoal('t-1');
    expect(goal?.monthlyBudget).toBe(5000);
    expect(goal?.targetCpa).toBe(50);
  });

  it('upsertGoal chama o repo e serializa', async () => {
    const repo = mockRepo({ upsertTenantClientGoal: vi.fn(async () => goalRow) });
    const svc = new GoalService(mockMetrics() as any, () => repo as any);
    const r = await svc.upsertGoal('t-1', { objective: 'aumentar_vendas', niche: 'x', mainProduct: 'y', monthlyBudget: 5000, targetCpa: 50 });
    expect(repo.upsertTenantClientGoal).toHaveBeenCalled();
    expect(r?.monthlyBudget).toBe(5000);
  });

  it('updateGoal retorna null quando não há goal', async () => {
    const repo = mockRepo({ updateTenantClientGoal: vi.fn(async () => null) });
    const svc = new GoalService(mockMetrics() as any, () => repo as any);
    expect(await svc.updateGoal('t-1', { objective: 'a', niche: 'n', mainProduct: 'm', monthlyBudget: 100, targetCpa: 10 })).toBeNull();
  });

  it('getProgress sem metas → hasGoals false e status no_goals', async () => {
    const repo = mockRepo();
    const svc = new GoalService(mockMetrics() as any, () => repo as any);
    const p = await svc.getProgress('t-1');
    expect(p.hasGoals).toBe(false);
    expect(p.goals).toHaveLength(3);
    expect(p.primary_goal.status).toBe('no_goals');
    expect(p.onTrack).toBe(false);
  });

  it('getProgress com metas → projeções e primary_goal calculados', async () => {
    const repo = mockRepo({ findClientGoal: vi.fn(async () => goalRow) });
    const svc = new GoalService(mockMetrics() as any, () => repo as any);
    const p = await svc.getProgress('t-1');
    expect(p.hasGoals).toBe(true);
    expect(p.primary_goal.id).toBe('conversions');
    expect(typeof p.goals[0].projected_value).toBe('number');
    expect(p.days_in_month).toBeGreaterThanOrEqual(28);
  });

  it('getProgress com Meta fora do ar → tolerante (zeros, sem crash)', async () => {
    const repo = mockRepo({ findClientGoal: vi.fn(async () => goalRow) });
    const metrics = mockMetrics({ getSummary: vi.fn(async () => { throw new Error('no meta'); }) });
    const svc = new GoalService(metrics as any, () => repo as any);
    const p = await svc.getProgress('t-1');
    expect(p.hasGoals).toBe(true);
    expect(p.goals[0].current_value).toBe(0);
  });

  it('getProgress gera alerta cpa_high p/ campanha com CPA acima de 120% da meta', async () => {
    const repo = mockRepo({
      findClientGoal: vi.fn(async () => goalRow), // targetCpa R$50 → threshold 60
      findCampaigns: vi.fn(async () => ({
        items: [{ id: 'c-1', name: 'Camp', status: 'active', metrics: { cpa: 100, roas: 2.5 } }],
        total: 1,
      })),
    });
    const svc = new GoalService(mockMetrics() as any, () => repo as any);
    const p = await svc.getProgress('t-1');
    expect(p.alerts).toHaveLength(1);
    expect(p.alerts[0]).toMatchObject({ metric: 'CPA', type: 'cpa_high', campaignId: 'c-1' });
  });
});