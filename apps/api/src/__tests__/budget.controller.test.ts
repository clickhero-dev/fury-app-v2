import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetController } from '../controllers/budget.controller.js';

function mockBudgetOptimizer() {
  return {
    optimizeBudget: vi.fn(),
    saveSuggestions: vi.fn(),
    getSuggestions: vi.fn(),
    applySuggestions: vi.fn(),
    rejectSuggestions: vi.fn(),
    getBudgetConfig: vi.fn(),
    updateBudgetConfig: vi.fn(),
  };
}

function mockRes() {
  const json = vi.fn();
  return { json } as any;
}

const TENANT_REQ = { tenant: { tenantId: 't-1' }, params: {}, query: {}, body: {} } as any;

describe('BudgetController — happy path', () => {
  it('getConfig responde com a configuração do tenant', async () => {
    const svc = mockBudgetOptimizer();
    svc.getBudgetConfig.mockReturnValue({
      tenantId: 't-1',
      mode: 'suggestion',
      totalBudget: 1000,
      autoApplyEnabled: false,
    });
    const c = new BudgetController(svc as any);

    const res = mockRes();
    const next = vi.fn();

    await c.getConfig(TENANT_REQ, res, next);

    expect(svc.getBudgetConfig).toHaveBeenCalledWith('t-1');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ mode: 'suggestion' }) }),
    );
  });

  it('getSuggestions filtra por status e responde com count', async () => {
    const svc = mockBudgetOptimizer();
    svc.getSuggestions.mockReturnValue([
      { id: 's-1', campaignId: 'c-1', campaignName: 'Camp', currentBudget: 100, suggestedBudget: 120, change_pct: 20, reason: 'x', status: 'pending' },
    ]);
    const c = new BudgetController(svc as any);

    const req = { ...TENANT_REQ, query: { status: 'pending' } };
    const res = mockRes();
    const next = vi.fn();

    await c.getSuggestions(req, res, next);

    expect(svc.getSuggestions).toHaveBeenCalledWith('t-1', 'pending');
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ count: 1 }) }));
  });

  it('applyBulk aplica múltiplas sugestões e responde com appliedCount', async () => {
    const svc = mockBudgetOptimizer();
    svc.applySuggestions.mockResolvedValue([{ id: 's-1', campaignId: 'c-1', suggestedBudget: 120, status: 'applied' }]);
    const c = new BudgetController(svc as any);

    const req = { ...TENANT_REQ, body: { suggestionIds: ['s-1'] } };
    const res = mockRes();
    const next = vi.fn();

    await c.applyBulk(req, res, next);

    expect(svc.applySuggestions).toHaveBeenCalledWith('t-1', ['s-1']);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ appliedCount: 1 }) }),
    );
  });
});

describe('BudgetController — 400 validation', () => {
  it('triggerOptimization com totalBudget não-positivo propaga ZodError', async () => {
    const svc = mockBudgetOptimizer();
    const c = new BudgetController(svc as any);

    const req = { ...TENANT_REQ, body: { totalBudget: 0 } };
    const res = mockRes();
    const next = vi.fn();

    await c.triggerOptimization(req, res, next);

    expect(svc.optimizeBudget).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('applyBulk com suggestionIds vazio propaga ZodError', async () => {
    const svc = mockBudgetOptimizer();
    const c = new BudgetController(svc as any);

    const req = { ...TENANT_REQ, body: { suggestionIds: [] } };
    const res = mockRes();
    const next = vi.fn();

    await c.applyBulk(req, res, next);

    expect(svc.applySuggestions).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('updateConfig com body vazio propaga AppError EMPTY_UPDATE', async () => {
    const svc = mockBudgetOptimizer();
    const c = new BudgetController(svc as any);

    const req = { ...TENANT_REQ, body: {} };
    const res = mockRes();
    const next = vi.fn();

    await c.updateConfig(req, res, next);

    expect(svc.updateBudgetConfig).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'EMPTY_UPDATE' }));
  });

  it('applySuggestion sem id de rota propaga AppError MISSING_SUGGESTION_ID', async () => {
    const svc = mockBudgetOptimizer();
    const c = new BudgetController(svc as any);

    const req = { ...TENANT_REQ, params: {} };
    const res = mockRes();
    const next = vi.fn();

    await c.applySuggestion(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'MISSING_SUGGESTION_ID' }));
  });
});