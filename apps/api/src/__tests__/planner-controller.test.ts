import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do service — isola o controller de DB e do pipeline de agentes.
const startPlanGeneration = vi.fn();
const getJobProgress = vi.fn();
vi.mock('../services/planner.service.js', () => ({
  startPlanGeneration: (tid: string) => startPlanGeneration(tid),
  getJobProgress: (jid: string) => getJobProgress(jid),
  getPlanById: vi.fn(),
  confirmPlan: vi.fn(),
  revalidatePlan: vi.fn(),
}));

import { generatePlan, getJob } from '../controllers/planner.controller.js';

function mockRes() {
  return { json: vi.fn() } as any;
}

beforeEach(() => {
  startPlanGeneration.mockReset();
  getJobProgress.mockReset();
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
