import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do service — isola o controller de DB e do pipeline de agentes.
const startPlanGeneration = vi.fn();
const getJobProgress = vi.fn();
const bulkDeletePosts = vi.fn();
const bulkSchedulePosts = vi.fn();
vi.mock('../services/planner.service.js', () => ({
  startPlanGeneration: (tid: string) => startPlanGeneration(tid),
  getJobProgress: (jid: string) => getJobProgress(jid),
  getPlanById: vi.fn(),
  confirmPlan: vi.fn(),
  revalidatePlan: vi.fn(),
  bulkDeletePosts: (...args: any[]) => bulkDeletePosts(...args),
  bulkSchedulePosts: (...args: any[]) => bulkSchedulePosts(...args),
}));

import { generatePlan, getJob, handleBulkDelete, handleBulkSchedule } from '../controllers/planner.controller.js';

function mockRes() {
  return { json: vi.fn() } as any;
}

beforeEach(() => {
  startPlanGeneration.mockReset();
  getJobProgress.mockReset();
  bulkDeletePosts.mockReset();
  bulkSchedulePosts.mockReset();
});

describe('planner.controller — BUG-001 tenantId', () => {
  it('generatePlan usa o tenant do contexto autenticado, não do body', async () => {
    startPlanGeneration.mockReturnValue({ id: 'job-1', tenantId: 't-1', status: 'running' });
    const req = { tenant: { tenantId: 't-1' }, body: { tenantId: 'current' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await generatePlan(req, res, next);

    // não lançou 400: chamou o service com o tenant real, não com 'current'
    expect(startPlanGeneration).toHaveBeenCalledWith('t-1');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ id: 'job-1' }) });
  });
});

describe('planner.controller — BUG-003 tenant isolation', () => {
  it('getJob de outro tenant retorna 404 (não vaza progresso cross-tenant)', async () => {
    getJobProgress.mockReturnValue({ id: 'job-1', tenantId: 't-OWNER', status: 'done' });
    const req = { tenant: { tenantId: 't-ATTACKER' }, params: { jobId: 'job-1' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await getJob(req, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('getJob do próprio tenant retorna o job', async () => {
    getJobProgress.mockReturnValue({ id: 'job-1', tenantId: 't-1', status: 'done' });
    const req = { tenant: { tenantId: 't-1' }, params: { jobId: 'job-1' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await getJob(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ id: 'job-1' }) });
  });
});

// ===== Issue #122: bulkDeletePosts erro 500 =====

describe('planner.controller — handleBulkDelete (issue #122)', () => {
  it('deleta posts com IDs válidos e retorna o count', async () => {
    bulkDeletePosts.mockResolvedValue([{ id: 'post-1' }, { id: 'post-2' }]);
    const req = {
      tenant: { tenantId: 't-1' },
      body: { postIds: ['a69a748f-b2a0-4900-a036-b324b3252737', 'b69a748f-b2a0-4900-a036-b324b3252737'] },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleBulkDelete(req, res, next);

    expect(bulkDeletePosts).toHaveBeenCalledWith('t-1', req.body.postIds);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { count: 2 } });
  });

  it('retorna 400 (ZodError) se postIds for array vazio', async () => {
    const req = { tenant: { tenantId: 't-1' }, body: { postIds: [] } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleBulkDelete(req, res, next);

    expect(bulkDeletePosts).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('retorna 400 (ZodError) se postIds contiver UUID inválido', async () => {
    const req = { tenant: { tenantId: 't-1' }, body: { postIds: ['not-a-uuid'] } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleBulkDelete(req, res, next);

    expect(bulkDeletePosts).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('propaga AppError do service (ex: NOT_FOUND) via next', async () => {
    const appError = Object.assign(new Error('Nenhum dos posts selecionados foi encontrado'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    bulkDeletePosts.mockRejectedValue(appError);
    const req = {
      tenant: { tenantId: 't-1' },
      body: { postIds: ['a69a748f-b2a0-4900-a036-b324b3252737'] },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleBulkDelete(req, res, next);

    expect(next).toHaveBeenCalledWith(appError);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propaga AppError 500 do service quando DB falha', async () => {
    const dbError = Object.assign(new Error('Erro ao excluir posts. Tente novamente.'), {
      statusCode: 500,
      code: 'DELETE_ERROR',
    });
    bulkDeletePosts.mockRejectedValue(dbError);
    const req = {
      tenant: { tenantId: 't-1' },
      body: { postIds: ['a69a748f-b2a0-4900-a036-b324b3252737'] },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleBulkDelete(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('planner.controller — handleBulkSchedule (issue #122)', () => {
  it('agenda posts com IDs válidos e scheduledAt', async () => {
    bulkSchedulePosts.mockResolvedValue([{ id: 'post-1' }]);
    const req = {
      tenant: { tenantId: 't-1' },
      body: { postIds: ['a69a748f-b2a0-4900-a036-b324b3252737'], scheduledAt: '2025-08-15T10:00:00Z' },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleBulkSchedule(req, res, next);

    expect(bulkSchedulePosts).toHaveBeenCalledWith('t-1', req.body.postIds, '2025-08-15T10:00:00Z');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { count: 1 } });
  });

  it('desprograma posts quando scheduledAt é null', async () => {
    bulkSchedulePosts.mockResolvedValue([{ id: 'post-1' }]);
    const req = {
      tenant: { tenantId: 't-1' },
      body: { postIds: ['a69a748f-b2a0-4900-a036-b324b3252737'], scheduledAt: null },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handleBulkSchedule(req, res, next);

    expect(bulkSchedulePosts).toHaveBeenCalledWith('t-1', req.body.postIds, null);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { count: 1 } });
  });
});
