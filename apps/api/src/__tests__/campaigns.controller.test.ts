import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { CampaignsController } from '../controllers/campaigns.controller.js';
import type { CampaignsService } from '../services/campaigns/campaigns.service.js';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    tenant: { tenantId: 'tenant-foo' },
    setTimeout: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.setTimeout = vi.fn(() => res);
  res.on = vi.fn(() => res);
  res.off = vi.fn(() => res);
  res.headersSent = false;
  return res;
}

function makeController(service: Partial<CampaignsService> = {}) {
  const svc = service as CampaignsService;
  const repoFactory = vi.fn();
  return new CampaignsController(svc, repoFactory as any);
}

describe('CampaignsController', () => {
  const next: NextFunction = vi.fn() as unknown as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCampaign', () => {
    it('returna 201 com a campanha criada (happy path)', async () => {
      const campaign = { id: 'c1', name: 'Minha Campanha', objective: 'OUTCOME_SALES', dailyBudget: 1000, adAccountId: 'act_1' };
      const ctrl = makeController({ createCampaign: vi.fn().mockResolvedValue(campaign) });
      const req = makeReq({ body: { name: 'Minha Campanha', objective: 'OUTCOME_SALES', dailyBudget: 1000, adAccountId: 'act_1' } });
      const res = makeRes();

      await ctrl.createCampaign(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: campaign }));
      expect(next).not.toHaveBeenCalled();
    });

    it('retorna 400/validação quando body é inválido', async () => {
      const ctrl = makeController();
      const req = makeReq({ body: { name: 'X', objective: 'INVALIDO', dailyBudget: 1 } });
      const res = makeRes();

      await ctrl.createCampaign(req, res, next);

      expect(res.status).not.toHaveBeenCalledWith(201);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCampaign', () => {
    it('retorna o detail da campanha (happy path)', async () => {
      const detail = { id: 'c1', name: 'Minha Campanha' };
      const ctrl = makeController({ getCampaignPanelDetail: vi.fn().mockResolvedValue(detail) });
      const req = makeReq({ params: { id: 'c1' } });
      const res = makeRes();

      await ctrl.getCampaign(req, res, next);

      expect(res.json).toHaveBeenCalledWith(detail);
      expect(next).not.toHaveBeenCalled();
    });

    it('retorna 404 quando a campanha não existe', async () => {
      const ctrl = makeController({ getCampaignPanelDetail: vi.fn().mockResolvedValue(null) });
      const req = makeReq({ params: { id: 'nao-existe' } });
      const res = makeRes();

      await ctrl.getCampaign(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Campanha não encontrada' });
    });
  });

  describe('getCampaigns', () => {
    it('retorna campanhas com paginação (happy path, sem cache)', async () => {
      const result = { items: [{ id: 'c1' }], total: 1 };
      const ctrl = makeController({ getCampaigns: vi.fn().mockResolvedValue(result) });
      const req = makeReq({ query: { limit: '10', offset: '0' } });
      const res = makeRes();

      await ctrl.getCampaigns(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: result.items,
          pagination: { total: 1, limit: 10, offset: 0 },
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });
});