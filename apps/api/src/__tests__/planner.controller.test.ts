import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isola o planner.service — evita instanciar o singleton real (DB/LLM/workers).
vi.mock('../services/planner/planner.service.js', () => ({
  plannerService: {
    startPlanGeneration: vi.fn(),
    getJobProgress: vi.fn(),
    confirmPlan: vi.fn(),
    bulkDeletePosts: vi.fn(),
    bulkSchedulePosts: vi.fn(),
    getCalendarPostsByDateRange: vi.fn(),
  },
}));

// Gera planos chama o gate de créditos — mocka para não tocar a rede.
vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { assertCreditsAvailable: vi.fn().mockResolvedValue(undefined) },
}));

import { PlannerController } from '../controllers/planner.controller.js';

function mockPlannerService() {
  return {
    startPlanGeneration: vi.fn(),
    getJobProgress: vi.fn(),
    getPlanById: vi.fn(),
    getLatestPlanByTenant: vi.fn(),
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
  };
}

function mockRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { json, status } as any;
}

describe('PlannerController — happy path', () => {
  it('generatePlan inicia a geração usando o tenant do contexto e responde 200', async () => {
    const svc = mockPlannerService();
    svc.startPlanGeneration.mockResolvedValue({ id: 'job-1', tenantId: 't-1', status: 'running' });
    const c = new PlannerController(svc as any);

    const req = { tenant: { tenantId: 't-1' }, body: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.generatePlan(req, res, next);

    expect(svc.startPlanGeneration).toHaveBeenCalledWith('t-1');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ id: 'job-1' }) });
  });

  it('handleBulkSchedule agenda posts válidos e responde com count', async () => {
    const svc = mockPlannerService();
    svc.bulkSchedulePosts.mockResolvedValue([{ id: 'post-1' }, { id: 'post-2' }]);
    const c = new PlannerController(svc as any);

    const req = {
      tenant: { tenantId: 't-1' },
      body: {
        postIds: ['a69a748f-b2a0-4900-a036-b324b3252737'],
        scheduledAt: '2025-08-15T10:00:00Z',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.handleBulkSchedule(req, res, next);

    expect(svc.bulkSchedulePosts).toHaveBeenCalledWith('t-1', req.body.postIds, '2025-08-15T10:00:00Z');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { count: 2 } });
  });
});

describe('PlannerController — 400 validation', () => {
  it('handleBulkDelete com postIds vazio propaga ZodError (400) e não chama service', async () => {
    const svc = mockPlannerService();
    const c = new PlannerController(svc as any);

    const req = { tenant: { tenantId: 't-1' }, body: { postIds: [] } } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.handleBulkDelete(req, res, next);

    expect(svc.bulkDeletePosts).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('handleConfirm com planId inválido propaga ZodError (400)', async () => {
    const svc = mockPlannerService();
    const c = new PlannerController(svc as any);

    const req = { tenant: { tenantId: 't-1' }, body: { planId: 'not-a-uuid' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.handleConfirm(req, res, next);

    expect(svc.confirmPlan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('handleGetCalendar sem startDate propaga ZodError (400)', async () => {
    const svc = mockPlannerService();
    const c = new PlannerController(svc as any);

    const req = { tenant: { tenantId: 't-1' }, query: { endDate: '2026-09-01' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await c.handleGetCalendar(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});