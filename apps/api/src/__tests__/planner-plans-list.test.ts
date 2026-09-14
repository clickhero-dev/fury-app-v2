import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/planner/planner.service.js', () => ({
  plannerService: {
    startPlanGeneration: vi.fn(),
    getJobProgress: vi.fn(),
    getPlanById: vi.fn(),
    getLatestPlanByTenant: vi.fn(),
    listPlansByTenant: vi.fn(),
    getPrerequisites: vi.fn(),
    confirmPlan: vi.fn(),
    revalidatePlan: vi.fn(),
    editPostWithAI: vi.fn(),
    updatePostFields: vi.fn(),
    getCalendarPostsByDateRange: vi.fn(),
    bulkSchedulePosts: vi.fn(),
    bulkDeletePosts: vi.fn(),
    createManualPost: vi.fn(),
    movePostDate: vi.fn(),
    movePostDay: vi.fn(),
    publishDuePosts: vi.fn(),
    getAgentLabels: vi.fn(),
  },
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { assertCreditsAvailable: vi.fn().mockResolvedValue(undefined) },
}));

import { PlannerController } from '../controllers/planner.controller.js';
import { PlannerRepository } from '../repository/planner.repository.js';

const tenantId = '0fb6d3a7-0000-4000-8000-000000000001';

// ── Repository ─────────────────────────────────────────────────────

function makeDb(plans: any[] = []) {
  const row = { id: 'row-1', tenantId, createdAt: new Date() };
  const db: any = {
    query: {
      campaignPlans: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => plans),
      },
      socialPosts: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
      metaConnections: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    },
    update: vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [row] }) }) })),
    insert: vi.fn(() => ({ values: () => ({ returning: async () => [row] }) })),
    delete: vi.fn(() => ({ where: async () => {} })),
    select: vi.fn(),
  };
  return db;
}

function chainGroupBy(pairs: Array<{ planId: string; total: number }>) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn().mockResolvedValue(pairs),
  };
  return chain;
}

describe('PlannerRepository.listPlans (histórico)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista planos do tenant com postCount, ordenado por createdAt desc e limit 10', async () => {
    const plan = { id: 'p-1', tenantId, title: 'Plano A', status: 'draft', createdAt: new Date() };
    const db = makeDb([plan]);
    db.select.mockReturnValue(chainGroupBy([{ planId: 'p-1', total: 4 }]));
    const repo = new PlannerRepository(tenantId, db);

    const rows = await repo.listPlans(10);

    expect(db.query.campaignPlans.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, orderBy: expect.anything(), where: expect.anything() })
    );
    expect(rows[0]).toMatchObject({ id: 'p-1', postCount: 4 });
  });

  it('sem planos → rows vazias e NÃO consulta contagem', async () => {
    const db = makeDb([]);
    const repo = new PlannerRepository(tenantId, db);

    const rows = await repo.listPlans(10);

    expect(rows).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});

// ── Controller ─────────────────────────────────────────────────────

function mockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { json, status } as any;
}

describe('PlannerController.listPlans (histórico)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listPlans → 200 com rows (tenant vem do contexto do request)', async () => {
    const svc = { listPlansByTenant: vi.fn().mockResolvedValue([{ id: 'p-1', postCount: 4 }]) };
    const c = new PlannerController(svc as any);
    const res = mockRes();

    await c.listPlans({ tenant: { tenantId: 't-1' }, query: {} } as any, res, vi.fn());

    expect(svc.listPlansByTenant).toHaveBeenCalledWith('t-1', 10);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.any(Array) }));
  });

  it('listPlans sem planos → 200 com rows vazio (não é 404)', async () => {
    const svc = { listPlansByTenant: vi.fn().mockResolvedValue([]) };
    const c = new PlannerController(svc as any);
    const res = mockRes();

    await c.listPlans({ tenant: { tenantId: 't-1' }, query: {} } as any, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [] }));
  });

  it('listPlans com limit inválido → propaga ZodError (400)', async () => {
    const svc = { listPlansByTenant: vi.fn() };
    const c = new PlannerController(svc as any);
    const next = vi.fn();

    await c.listPlans({ tenant: { tenantId: 't-1' }, query: { limit: 999 } } as any, mockRes(), next);

    expect(svc.listPlansByTenant).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});