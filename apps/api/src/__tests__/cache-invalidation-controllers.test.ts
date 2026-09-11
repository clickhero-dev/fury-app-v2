/**
 * Invalidação do cache HTTP nos writes — campanhas, billing, meta e goals.
 * Garante que toda ação de escrita derruba as chaves de leitura afetadas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockInvalidateHttpCache, mockInvalidateCampaignsCache } = vi.hoisted(() => ({
  mockInvalidateHttpCache: vi.fn().mockResolvedValue(undefined),
  mockInvalidateCampaignsCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/campaigns-cache.js', () => ({
  getCampaignsCache: vi.fn().mockResolvedValue(null),
  setCampaignsCache: vi.fn().mockResolvedValue(undefined),
  invalidateCampaignsCache: mockInvalidateCampaignsCache,
}));

vi.mock('../lib/http-cache.js', () => ({
  invalidateHttpCache: mockInvalidateHttpCache,
}));

vi.mock('../services/email/notify.js', () => ({
  sendToTenant: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/email/email.service.js', () => ({
  emailService: {
    sendAccountConnected: vi.fn(),
    sendAccountDisconnected: vi.fn(),
    sendCampaignPublished: vi.fn(),
  },
}));

import { CampaignsController } from '../controllers/campaigns.controller.js';
import type { CampaignsService } from '../services/campaigns/campaigns.service.js';
import { BillingController } from '../controllers/billing.controller.js';
import type { BillingService } from '../services/billing/billing.service.js';
import { MetaController } from '../controllers/meta.controller.js';
import type { MetaService } from '../services/meta/meta.service.js';
import { GoalController } from '../controllers/goal.controller.js';
import type { GoalService } from '../services/goals/goal.service.js';

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
  res.redirect = vi.fn(() => res);
  res.setTimeout = vi.fn(() => res);
  res.on = vi.fn(() => res);
  res.off = vi.fn(() => res);
  res.headersSent = false;
  return res;
}

const next: NextFunction = vi.fn() as unknown as NextFunction;

const METRICS_E_GOALS = ['/api/metrics', '/api/goals'];

describe('invalidação de cache http nos writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidateHttpCache.mockResolvedValue(undefined);
    mockInvalidateCampaignsCache.mockResolvedValue(undefined);
  });

  describe('CampaignsController', () => {
    function makeController(service: Partial<CampaignsService> = {}) {
      const repoFactory = vi.fn();
      return new CampaignsController(service as CampaignsService, repoFactory as any);
    }

    it('createCampaign invalida métricas + goals', async () => {
      const campaign = { id: 'c1', name: 'Campanha', objective: 'OUTCOME_SALES', dailyBudget: 1000, adAccountId: 'act_1' };
      const ctrl = makeController({ createCampaign: vi.fn().mockResolvedValue(campaign) });
      const req = makeReq({ body: { name: 'Campanha', objective: 'OUTCOME_SALES', dailyBudget: 1000, adAccountId: 'act_1' } });
      const res = makeRes();

      await ctrl.createCampaign(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', METRICS_E_GOALS);
    });

    it('createWizardCampaign invalida métricas + goals', async () => {
      const ctrl = makeController({
        createCampaignFromWizard: vi.fn().mockResolvedValue({ success: true, campaign_name: 'Wizard' }),
      });
      const req = makeReq({
        body: {
          objective: 'engagement',
          creatives: [{ creative_asset_id: 'asset-1', headline: 'Tituto', primary_text: 'Texto' }],
          location_city: 'São Paulo',
          age_min: 18,
          age_max: 65,
          gender: 'all',
          daily_budget_brl: 20,
        },
      });
      const res = makeRes();

      await ctrl.createWizardCampaign(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', METRICS_E_GOALS);
    });

    it.each(['pauseCampaign', 'resumeCampaign', 'updateCampaignStatus', 'softDeleteCampaign', 'updateBudget'])(
      '%s invalida métricas + goals (e mantém invalidação da lista local)',
      async (method) => {
        const serviceMethod = method === 'updateBudget' ? 'updateCampaignBudget' : method;
        const ctrl = makeController({
          [serviceMethod]: vi.fn().mockResolvedValue({ id: 'c1' }),
        } as Partial<CampaignsService>);
        const req = makeReq({ params: { id: 'c1' }, body: method === 'updateCampaignStatus' ? { status: 'PAUSED' } : method === 'updateBudget' ? { dailyBudget: 1500 } : method === 'updateCampaign' ? { name: 'Novo nome' } : {} });
        const res = makeRes();

        await (ctrl as any)[method](req, res, next);

        expect(mockInvalidateCampaignsCache).toHaveBeenCalledWith('tenant-foo');
        expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', METRICS_E_GOALS);
      }
    );
  });

  describe('BillingController', () => {
    function makeController(service: Partial<BillingService> = {}) {
      return new BillingController(service as BillingService);
    }

    it('subscribe invalida /api/billing', async () => {
      const ctrl = makeController({ subscribe: vi.fn().mockResolvedValue({ id: 'sub-1' }) });
      const req = makeReq({
        body: {
          planId: '11111111-1111-1111-1111-111111111111',
          billingType: 'PIX',
          customerName: 'Diogo',
          customerEmail: 'diogo@example.com',
          customerCpfCnpj: '123.456.789-09',
        },
      });
      const res = makeRes();

      await ctrl.subscribe(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/billing']);
    });

    it('cancel invalida /api/billing', async () => {
      const ctrl = makeController({ cancel: vi.fn().mockResolvedValue(undefined) });
      const res = makeRes();

      await ctrl.cancel(makeReq(), res, next);

      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/billing']);
    });
  });

  describe('MetaController', () => {
    function makeController(service: Partial<MetaService> = {}) {
      return new MetaController(service as MetaService);
    }

    it('saveSelection invalida /api/meta', async () => {
      const ctrl = makeController({ saveTenantAssetSelection: vi.fn().mockResolvedValue(undefined) });
      const req = makeReq({ body: { adAccountId: 'act_1' } });
      const res = makeRes();

      await ctrl.saveSelection(req, res, next);

      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/meta']);
    });

    it('selectAdAccount invalida /api/meta', async () => {
      const ctrl = makeController({ selectAdAccount: vi.fn().mockResolvedValue('act_2') });
      const req = makeReq({ params: { id: '5ca0c5cb-609b-4215-a884-1a7edae648ee' }, body: { adAccountId: 'act_2' } });
      const res = makeRes();

      await ctrl.selectAdAccount(req, res, next);

      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/meta']);
    });

    it('deleteConnection invalida /api/meta', async () => {
      const ctrl = makeController({ deleteTenantMetaConnection: vi.fn().mockResolvedValue(undefined) });
      const req = makeReq({ params: { id: '5ca0c5cb-609b-4215-a884-1a7edae648ee' } });
      const res = makeRes();

      await ctrl.deleteConnection(req, res, next);

      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/meta']);
    });

    it('authCallback invalida /api/meta (nova conexão muda asset-selection/connections)', async () => {
      const ctrl = makeController({
        handleMetaOAuthCallback: vi.fn().mockResolvedValue({
          tenantId: 'tenant-foo',
          returnUrl: '/integracoes',
          frontendUrl: 'https://app.example.com',
        }),
      });
      const req = makeReq({ query: { code: 'auth-code', state: 'valid-state' } });
      const res = makeRes();

      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.FRONTEND_URL = 'https://app.example.com';
      const { default: jwt } = await import('jsonwebtoken');
      (req.query as any).state = jwt.sign({ tenantId: 'tenant-foo' }, 'test-jwt-secret');

      await ctrl.authCallback(req, res, next);

      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/meta']);
    });
  });

  describe('GoalController', () => {
    function makeController(service: Partial<GoalService> = {}) {
      return new GoalController(service as GoalService);
    }

    const body = {
      objective: 'Vender mais',
      niche: 'E-commerce',
      mainProduct: 'Curso',
      monthlyBudget: 5000,
      targetCpa: 50,
    };

    it('setup invalida goals + metrics/goals-progress', async () => {
      const ctrl = makeController({ upsertGoal: vi.fn().mockResolvedValue({ id: 'g1' }) });
      const req = makeReq({ body });
      const res = makeRes();

      await ctrl.setup(req, res, next);

      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/goals', '/api/metrics/goals-progress']);
    });

    it('update invalida goals + metrics/goals-progress', async () => {
      const ctrl = makeController({ updateGoal: vi.fn().mockResolvedValue({ id: 'g1' }) });
      const req = makeReq({ body });
      const res = makeRes();

      await ctrl.update(req, res, next);

      expect(mockInvalidateHttpCache).toHaveBeenCalledWith('tenant-foo', ['/api/goals', '/api/metrics/goals-progress']);
    });
  });
});
