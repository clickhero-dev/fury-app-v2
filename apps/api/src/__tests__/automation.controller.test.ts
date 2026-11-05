import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationController } from '../controllers/automation.controller.js';

const emitToTenant = vi.fn();
vi.mock('../lib/sse.js', () => ({
  emitToTenant: (...args: any[]) => emitToTenant(...args),
  registerSSEClient: vi.fn(),
  removeSSEClient: vi.fn(),
}));

const automationService = {
  upsertAutomationRule: vi.fn(),
  getAutomationRules: vi.fn(),
  deleteAutomationRuleById: vi.fn(),
  getSmartTakedowns: vi.fn(),
  getBudgetSmart: vi.fn(),
};

const ctrl = new AutomationController(automationService as any);

function mockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    write: vi.fn(),
    on: vi.fn(),
    writableEnded: false,
  };
  return res;
}

function mockReq(overrides: Record<string, any> = {}) {
  return { body: {}, params: {}, query: {}, tenant: { tenantId: 't-1' }, ...overrides } as any;
}

beforeEach(() => {
  Object.values(automationService).forEach((fn) => (fn as any).mockReset());
  emitToTenant.mockReset();
});

describe('AutomationController.createRuleHandler', () => {
  const validBody = { name: 'Regra X', trigger: 'cpa', threshold: 75, action: 'pause' };

  it('happy path (nova regra) → 201 + emite rule_created', async () => {
    automationService.upsertAutomationRule.mockResolvedValue({ rule: { id: 'r1', name: 'Regra X' }, created: true });
    const req = mockReq({ body: validBody });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.createRuleHandler(req, res, next);

    expect(automationService.upsertAutomationRule).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-1', name: 'Regra X', trigger: 'cpa', threshold: 75 }),
    );
    expect(emitToTenant).toHaveBeenCalledWith('t-1', 'rule_created', expect.objectContaining({ id: 'r1' }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it('regra existente → 200 + emite rule_updated', async () => {
    automationService.upsertAutomationRule.mockResolvedValue({ rule: { id: 'r1' }, created: false });
    const req = mockReq({ body: validBody });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.createRuleHandler(req, res, next);

    expect(emitToTenant).toHaveBeenCalledWith('t-1', 'rule_updated', expect.objectContaining({ id: 'r1' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('body inválido (threshold ausente) → next com ZodError', async () => {
    const req = mockReq({ body: { name: 'X', action: 'pause' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.createRuleHandler(req, res, next);

    expect(automationService.upsertAutomationRule).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });

  it('sem tenant no contexto → next com AppError 401', async () => {
    const req = mockReq({ tenant: undefined });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.createRuleHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('AutomationController.getRulesHandler', () => {
  it('happy path → 200 com lista', async () => {
    automationService.getAutomationRules.mockResolvedValue([{ id: 'r1', enabled: true, threshold: 75 }]);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await ctrl.getRulesHandler(req, res, next);

    expect(automationService.getAutomationRules).toHaveBeenCalledWith('t-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe('AutomationController.deleteRuleHandler', () => {
  it('happy path → 200 + emite rule_deleted', async () => {
    automationService.deleteAutomationRuleById.mockResolvedValue(undefined);
    const req = mockReq({ params: { id: 'a69a748f-b2a0-4900-a036-b324b3252737' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.deleteRuleHandler(req, res, next);

    expect(automationService.deleteAutomationRuleById).toHaveBeenCalledWith('t-1', req.params.id);
    expect(emitToTenant).toHaveBeenCalledWith('t-1', 'rule_deleted', { id: req.params.id });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('params inválido (UUID) → next com ZodError', async () => {
    const req = mockReq({ params: { id: 'not-a-uuid' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.deleteRuleHandler(req, res, next);

    expect(automationService.deleteAutomationRuleById).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});

describe('AutomationController.getTakedownsHandler', () => {
  it('happy path → 200', async () => {
    automationService.getSmartTakedowns.mockResolvedValue([{ id: 'td1' }]);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await ctrl.getTakedownsHandler(req, res, next);

    expect(automationService.getSmartTakedowns).toHaveBeenCalledWith('t-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('AutomationController.budgetSmartHandler', () => {
  it('happy path → 200', async () => {
    automationService.getBudgetSmart.mockReturnValue({ monthlyBudget: 1000, distribution: [] });
    const req = mockReq({ body: { monthlyBudget: 1000, adAccountId: 'act_1' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.budgetSmartHandler(req, res, next);

    expect(automationService.getBudgetSmart).toHaveBeenCalledWith(1000);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('body inválido (monthlyBudget < 300) → next com ZodError', async () => {
    const req = mockReq({ body: { monthlyBudget: 100, adAccountId: 'act_1' } });
    const res = mockRes();
    const next = vi.fn();

    await ctrl.budgetSmartHandler(req, res, next);

    expect(automationService.getBudgetSmart).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});